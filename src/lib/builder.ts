import { AudioGraph, AudioNode, RoutingMatrix, NODE_PARAMETER_DEFINITIONS, ParameterDefinition } from '../audio/schema';
import { kernelRegistry as defaultKernelRegistry, KernelRegistry } from './kernel-registry';

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_BLOCK_SIZE = 128;
const DEFAULT_NUM_CHANNELS = 2;

// Helper function to create an empty routing matrix
function createEmptyRoutingMatrix(numChannels: number): RoutingMatrix {
  return Array(numChannels).fill(null).map(() => Array(numChannels).fill(0));
}

export class MFNGraphBuilder {
  private graph: AudioGraph;
  private kernelRegistry: KernelRegistry;

  constructor(kernelRegistryInstance?: KernelRegistry) {
    this.kernelRegistry = kernelRegistryInstance || defaultKernelRegistry;
    this.graph = {
      nodes: [],
      routingMatrix: createEmptyRoutingMatrix(DEFAULT_NUM_CHANNELS),
      sampleRate: DEFAULT_SAMPLE_RATE,
      blockSize: DEFAULT_BLOCK_SIZE,
      numChannels: DEFAULT_NUM_CHANNELS,
    };
  }

  public channels(numChannels: number): this {
    this.graph.numChannels = numChannels;
    if (this.graph.routingMatrix.length !== numChannels ||
        (this.graph.routingMatrix[0] && this.graph.routingMatrix[0].length !== numChannels)) {
      this.graph.routingMatrix = createEmptyRoutingMatrix(numChannels);
    }
    return this;
  }

  public sampleRate(sampleRate: number): this {
    this.graph.sampleRate = sampleRate;
    return this;
  }

  public blockSize(blockSize: number): this {
    this.graph.blockSize = blockSize;
    return this;
  }

  public addNode(id: string, type: string, initialParameters?: Record<string, number>): this {
    const kernel = this.kernelRegistry.getKernel(type);
    if (!kernel) {
      // Log a warning but still create the node. The processor will ultimately decide if it can handle it.
      console.warn(`Kernel type "${type}" not registered in builder. Node "${id}" will be created. Ensure processor supports this type.`);
    }

    const finalParameters: Record<string, number> = {};
    const paramDefinitions: ReadonlyArray<ParameterDefinition> | undefined = NODE_PARAMETER_DEFINITIONS[type as keyof typeof NODE_PARAMETER_DEFINITIONS];

    if (paramDefinitions) {
      for (const paramDef of paramDefinitions) {
        finalParameters[paramDef.id] = initialParameters?.[paramDef.id] ?? paramDef.defaultValue;
      }
      // Add any additional parameters provided that are not in definitions (e.g. custom params)
      if (initialParameters) {
        for (const key in initialParameters) {
          if (!finalParameters.hasOwnProperty(key)) {
            finalParameters[key] = initialParameters[key];
          }
        }
      }
    } else if (initialParameters) {
      console.warn(`No parameter definitions found for node type "${type}". Using provided parameters directly.`);
      Object.assign(finalParameters, initialParameters);
    } else {
      // No definitions, no initial params. Node will have empty parameters object.
      console.warn(`No parameter definitions or initial values for node type "${type}". Node "${id}" will have empty parameters.`);
    }

    const newNode: AudioNode = {
      id,
      type,
      kernel: type,
      parameters: finalParameters,
      // state will be initialized by the processor
    };
    this.graph.nodes.push(newNode);
    return this;
  }

  public setMatrix(matrix: RoutingMatrix): this {
    if (matrix.length !== this.graph.numChannels ||
        (this.graph.numChannels > 0 && matrix.length > 0 && matrix[0]?.length !== this.graph.numChannels)) {
      const matrixDims = matrix.length > 0 && matrix[0] ? `${matrix.length}x${matrix[0].length}` : "0x0 or malformed";
      throw new Error(`Routing matrix dimensions (${matrixDims}) must match the number of channels (${this.graph.numChannels}).`);
    }
    this.graph.routingMatrix = matrix;
    return this;
  }

  public updateNodeParameters(nodeId: string, parameters: Record<string, number>): this {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (node) {
      // Merge new parameters, potentially overwriting existing ones
      node.parameters = { ...node.parameters, ...parameters };
    } else {
      console.warn(`Node with id "${nodeId}" not found for parameter update.`);
    }
    return this;
  }

  public removeNode(nodeId: string): this {
    const nodeIndex = this.graph.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex > -1) {
      this.graph.nodes.splice(nodeIndex, 1);
    } else {
      console.warn(`Node with id "${nodeId}" not found for removal.`);
    }
    return this;
  }

  public connect(sourceNodeId: string, destNodeId: string, weight: number = 1): this {
    console.warn("MFNGraphBuilder.connect() is conceptual and does not modify the current channel-based AudioGraph.routingMatrix. Node-to-node routing would require schema changes.");
    // To avoid unused parameter linting if strict checks are on:
    if (sourceNodeId && destNodeId && weight) {
        // No-op for now
    }
    return this;
  }


  public build(): AudioGraph {
    return { ...this.graph, nodes: [...this.graph.nodes.map(n => ({...n}))] }; // Return a shallow copy of graph and nodes array + node objects
  }
}

// Example Usage (conceptual, to be integrated into App.tsx or similar later)
/*
import { kernelRegistry } from './kernel-registry'; // Singleton instance

// const builder = new MFNGraphBuilder(); // Uses the default exported kernelRegistry
// or
// const customRegistry = new KernelRegistry();
// customRegistry.register('custom', myCustomKernel);
// const builder = new MFNGraphBuilder(customRegistry);


const builder = new MFNGraphBuilder();

const myGraph = builder
  .channels(2)
  .sampleRate(44100)
  .blockSize(256)
  .addNode('gainNode1', 'gain', { gain: 0.7 })
  .addNode('delayNode1', 'delay', { delayTime: 0.3, feedback: 0.6 })
  .addNode('filterNode1', 'biquad', { frequency: 1200, q: 0.707, type: 0 /* lowpass * / })
  .setMatrix([
    [0, 0.9], // Channel 1 output to Channel 1 input, Channel 1 output to Channel 2 input
    [0.9, 0]  // Channel 2 output to Channel 1 input, Channel 2 output to Channel 2 input
  ])
  .build();

console.log('Constructed AudioGraph:', myGraph);

// Example: Modifying the graph
builder.updateNodeParameters('gainNode1', { gain: 0.4 });
builder.removeNode('filterNode1');
builder.addNode('anotherGain', 'gain', { gain: 1.0 });

const updatedGraph = builder.build();
console.log('Updated AudioGraph:', updatedGraph);

// Example for a graph with different channel count
const monoBuilder = new MFNGraphBuilder();
const monoGraph = monoBuilder
    .channels(1)
    .addNode('inputGain', 'gain', {gain: 1.0})
    .addNode('mainDelay', 'delay', {delayTime: 0.5, feedback: 0.5})
    .setMatrix([[0.5]]) // Feedback for the single channel
    .build();
console.log('Mono AudioGraph:', monoGraph);
*/
