import { AudioGraph, AudioNodeInstance, RoutingMatrix, NODE_PARAMETER_DEFINITIONS, NodeType } from '../audio/schema';
import type { ParameterDefinition } from '../audio/schema'; // Type-only import
import { kernelRegistry as defaultKernelRegistry, KernelRegistry } from './kernel-registry';

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_BLOCK_SIZE = 128;
const DEFAULT_NUM_CHANNELS = 2;
const DEFAULT_MASTER_GAIN = 1.0;

// Helper function to create an empty 3D routing matrix
function createEmpty3DRoutingMatrix(numChannels: number, numNodes: number): RoutingMatrix {
  return Array(numChannels).fill(null).map(() =>
    Array(numNodes).fill(null).map((): number[] =>
      Array(numNodes).fill(0)
    )
  );
}

// Helper function to deep copy a 3D routing matrix
function deepCopyRoutingMatrix(matrix: RoutingMatrix): RoutingMatrix {
    return matrix.map(channelMatrix =>
        channelMatrix.map(sourceRow => [...sourceRow])
    );
}

export class MFNGraphBuilder {
  private nodesInternal: AudioNodeInstance[] = [];
  private routingMatrixInternal: RoutingMatrix;
  private outputChannelsInternal: number = DEFAULT_NUM_CHANNELS;
  private masterGainInternal: number = DEFAULT_MASTER_GAIN;
  private sampleRateInternal: number = DEFAULT_SAMPLE_RATE;
  private blockSizeInternal: number = DEFAULT_BLOCK_SIZE;
  private kernelRegistry: KernelRegistry;

  constructor(kernelRegistryInstance?: KernelRegistry) {
    this.kernelRegistry = kernelRegistryInstance ?? defaultKernelRegistry;
    this.routingMatrixInternal = createEmpty3DRoutingMatrix(this.outputChannelsInternal, this.nodesInternal.length);
  }

  public channels(numChannels: number): this {
    if (numChannels <= 0) {
      console.warn('Number of channels must be positive.');
      return this;
    }
    this.outputChannelsInternal = numChannels;
    // Re-initialize the routing matrix for the new channel count, preserving node dimensions
    this.routingMatrixInternal = createEmpty3DRoutingMatrix(this.outputChannelsInternal, this.nodesInternal.length);
    return this;
  }

  public sampleRate(sr: number): this {
    this.sampleRateInternal = sr;
    return this;
  }

  public blockSize(bs: number): this {
    this.blockSizeInternal = bs;
    return this;
  }

  public masterGain(gain: number): this {
    this.masterGainInternal = Math.max(0, gain); // Ensure non-negative gain
    return this;
  }

  public addNode(id: string, type: string, initialParameters?: Record<string, number>): this {
    const nodeType = type as NodeType;
    const kernel = this.kernelRegistry.getKernel(nodeType);
    if (!kernel) {
      console.warn(`Kernel type "${nodeType}" not registered in builder. Node "${id}" will be created. Ensure processor supports this type.`);
    }

    const finalParameters: Record<string, number> = {};
    const paramDefinitions = NODE_PARAMETER_DEFINITIONS[nodeType as keyof typeof NODE_PARAMETER_DEFINITIONS] as readonly ParameterDefinition[] | undefined;

    if (paramDefinitions) {
      for (const paramDef of paramDefinitions) {
        finalParameters[paramDef.id] = initialParameters?.[paramDef.id] ?? paramDef.defaultValue;
      }
      if (initialParameters) {
        for (const key in initialParameters) {
          if (!Object.prototype.hasOwnProperty.call(finalParameters, key)) {
            finalParameters[key] = initialParameters[key];
          }
        }
      }
    } else if (initialParameters) {
      console.warn(`No parameter definitions found for node type "${nodeType}". Using provided parameters directly for node "${id}".`);
      Object.assign(finalParameters, initialParameters);
    } else {
      console.warn(`No parameter definitions or initial values for node type "${nodeType}". Node "${id}" will have empty parameters.`);
    }

    const newNode: AudioNodeInstance = {
      id,
      type: nodeType,
      parameters: finalParameters,
    };
    this.nodesInternal.push(newNode);

    // Expand the routing matrix for the new node
    const numNodes = this.nodesInternal.length;
    this.routingMatrixInternal.forEach(channelMatrix => {
      // Add new column to existing source rows
      channelMatrix.forEach(sourceRow => sourceRow.push(0));
      // Add new source row (for the new node)
      channelMatrix.push(Array(numNodes).fill(0));
    });

    return this;
  }

  public removeNode(nodeId: string): this {
    const nodeIndex = this.nodesInternal.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      console.warn(`Node with id "${nodeId}" not found for removal.`);
      return this;
    }

    this.nodesInternal.splice(nodeIndex, 1);

    // Shrink the routing matrix
    this.routingMatrixInternal.forEach(channelMatrix => {
      // Remove column from all source rows
      channelMatrix.forEach(sourceRow => sourceRow.splice(nodeIndex, 1));
      // Remove source row
      channelMatrix.splice(nodeIndex, 1);
    });
    return this;
  }

  public setNodeParameter(nodeId: string, paramId: string, value: number): this {
    const node = this.nodesInternal.find(n => n.id === nodeId);
    if (node) {
      node.parameters[paramId] = value;
    } else {
      console.warn(`Node "${nodeId}" not found to set parameter "${paramId}".`);
    }
    return this;
  }

  public updateNodeParameters(nodeId: string, parameters: Record<string, number>): this {
    const node = this.nodesInternal.find(n => n.id === nodeId);
    if (node) {
      node.parameters = { ...node.parameters, ...parameters };
    } else {
      console.warn(`Node with id "${nodeId}" not found for parameter update.`);
    }
    return this;
  }

  /**
   * Sets the entire 3D routing matrix.
   * matrix[channelIndex][sourceNodeIndex][destinationNodeIndex] = gainValue
   */
  public setMatrix(matrix: RoutingMatrix): this {
    // Basic validation
    if (matrix.length !== this.outputChannelsInternal) {
      throw new Error(`Matrix channel dimension (${matrix.length}) does not match graph output channels (${this.outputChannelsInternal}).`);
    }
    const numNodes = this.nodesInternal.length;
    for (let i = 0; i < matrix.length; i++) {
      if (matrix[i].length !== numNodes) {
        throw new Error(`Matrix source node dimension (${matrix[i].length}) for channel ${i} does not match graph node count (${numNodes}).`);
      }
      for (let j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j].length !== numNodes) {
          throw new Error(`Matrix destination node dimension (${matrix[i][j].length}) for channel ${i}, source ${j} does not match graph node count (${numNodes}).`);
        }
      }
    }
    this.routingMatrixInternal = deepCopyRoutingMatrix(matrix);
    return this;
  }

  /**
   * Sets a specific gain in the routing matrix.
   * @param channelIndex The channel context.
   * @param sourceNodeId ID of the source node.
   * @param destNodeId ID of the destination node.
   * @param gainValue The gain (0.0 to 1.0 typically).
   */
  public setRoute(channelIndex: number, sourceNodeId: string, destNodeId: string, gainValue: number): this {
    if (channelIndex < 0 || channelIndex >= this.outputChannelsInternal) {
      console.warn(`Invalid channel index ${channelIndex}.`);
      return this;
    }
    const sourceNodeIndex = this.nodesInternal.findIndex(n => n.id === sourceNodeId);
    const destNodeIndex = this.nodesInternal.findIndex(n => n.id === destNodeId);

    if (sourceNodeIndex === -1) {
      console.warn(`Source node "${sourceNodeId}" not found.`);
      return this;
    }
    if (destNodeIndex === -1) {
      console.warn(`Destination node "${destNodeId}" not found.`);
      return this;
    }

    if (!this.routingMatrixInternal[channelIndex] ||
        !this.routingMatrixInternal[channelIndex][sourceNodeIndex]) {
       console.error('Routing matrix not properly initialized for setRoute.');
       return this;
    }
    this.routingMatrixInternal[channelIndex][sourceNodeIndex][destNodeIndex] = gainValue;
    return this;
  }


  public build(): AudioGraph {
    return {
      nodes: [...this.nodesInternal.map(n => ({ ...n, parameters: { ...n.parameters } }))], // Deep copy nodes and their parameters
      routingMatrix: deepCopyRoutingMatrix(this.routingMatrixInternal),
      outputChannels: this.outputChannelsInternal,
      masterGain: this.masterGainInternal,
    };
  }

  public getSampleRate(): number {
    return this.sampleRateInternal;
  }

  public getBlockSize(): number {
    return this.blockSizeInternal;
  }
}

// Example Usage (illustrative)
/*
import { kernelRegistry } from './kernel-registry';

const builder = new MFNGraphBuilder(kernelRegistry);

const graphData = builder
  .channels(2) // 2 output channels for the graph
  .sampleRate(44100)
  .blockSize(128)
  .masterGain(0.8)
  .addNode('input1', 'passthrough') // Assuming 'passthrough' kernel exists
  .addNode('delayL', 'delay', { delayTime: 0.5, feedback: 0.3 })
  .addNode('gain1', 'gain', { gain: 0.7 })
  .addNode('biquadR', 'biquad', { frequency: 1000, q: 1, type: 0 }) // type 0 for lowpass
  .build();

// At this point, graphData.nodes has 4 nodes.
// graphData.routingMatrix is 2 (channels) x 4 (sources) x 4 (destinations)

// To set specific routes after building the node structure:
// Example: Route node 'input1' to 'delayL' with gain 1.0 in channel 0
// And 'input1' to 'biquadR' with gain 1.0 in channel 1
// Node indices: input1=0, delayL=1, gain1=2, biquadR=3

const newMatrix = createEmpty3DRoutingMatrix(graphData.outputChannels, graphData.nodes.length);

if (graphData.outputChannels > 0 && graphData.nodes.length > 1) {
  // Channel 0: input1 (idx 0) -> delayL (idx 1)
  newMatrix[0][0][1] = 1.0;
  // Channel 0: delayL (idx 1) -> gain1 (idx 2)
  newMatrix[0][1][2] = 0.8;
  // Channel 0: gain1 (idx 2) -> delayL (idx 1) (feedback)
  newMatrix[0][2][1] = 0.5;
}
if (graphData.outputChannels > 1 && graphData.nodes.length > 3) {
  // Channel 1: input1 (idx 0) -> biquadR (idx 3)
  newMatrix[1][0][3] = 1.0;
  // Channel 1: biquadR (idx 3) -> gain1 (idx 2) (cross-channel or common processing)
  newMatrix[1][3][2] = 0.6;
}

builder.setMatrix(newMatrix); // Apply this matrix to the builder's internal state

const finalGraph = builder.build();
console.log('Constructed AudioGraph:', finalGraph);

// Alternative using setRoute (after nodes are added)
const builder2 = new MFNGraphBuilder(kernelRegistry).channels(1).sampleRate(48000);
builder2.addNode('src', 'gain');
builder2.addNode('dest', 'delay');
// Route src to dest in channel 0 with gain 0.75
builder2.setRoute(0, 'src', 'dest', 0.75);
const graphFromSetRoute = builder2.build();
console.log('Graph from setRoute:', graphFromSetRoute);

*/
