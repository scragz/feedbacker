/**
 * mfn-processor.ts
 * AudioWorkletProcessor for the Multichannel Feedback Network.
 */

// Restore and refine AudioWorklet global types
declare global {

  let sampleRate: number;

  let currentTime: number;

  let currentFrame: number;

  // Define a base interface for the processor instance
  interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean;
  }

  // Ensure this global AudioWorkletNodeOptions is what the constructor expects
  interface AudioWorkletNodeOptions {
    numberOfInputs?: number;
    numberOfOutputs?: number;
    outputChannelCount?: number[];
    // Allow any other properties for flexibility
    [key: string]: unknown;
  }

  // Define the constructor signature for an AudioWorkletProcessor
  const AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    // The constructor options should match the defined interface
    new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
  };

  function registerProcessor(
    name: string,
    // The processor constructor options should also match
    processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
  ): void;
}

import {
  type AudioGraph,
  type AudioNodeInstance,
  type NodeId,
  type MainThreadMessage,
  MainThreadMessageType,
  WorkletMessageType,
  type InitProcessorMessage,
  type UpdateGraphMessage,
  type AddNodeMessage,
  type RemoveNodeMessage,
  type UpdateParameterMessage,
  type SetGlobalParameterMessage,
  type RoutingMatrix,
} from './schema';
import { kernelRegistry } from '../lib/kernel-registry';
import type { DSPKernel, NodeState } from './nodes/dsp-kernel';
import { passthroughKernel } from './nodes/passthrough';

const DEFAULT_BLOCK_SIZE = 128;
const DEFAULT_OUTPUT_CHANNELS = 2;

class MfnProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph | null = null;
  private kernels: Map<NodeId, DSPKernel> = new Map<NodeId, DSPKernel>();
  private nodeStates: Map<NodeId, NodeState> = new Map<NodeId, NodeState>();
  private previousKernelOutputBuffers: Map<NodeId, Float32Array[]> = new Map<NodeId, Float32Array[]>();
  private nodeOrder: NodeId[] = [];

  private sampleRateInternal: number = globalThis.AudioWorkletGlobalScope?.sampleRate ?? 44100;
  private maxOutputChannels: number = DEFAULT_OUTPUT_CHANNELS;

  private currentBlockOutputChannels: number = DEFAULT_OUTPUT_CHANNELS;
  private currentBlockSize: number = DEFAULT_BLOCK_SIZE;

  private logCounter = 0;
  private readonly logThrottle: number = 200;

  private isInitialized = false;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    if (options?.processorOptions) {
      this.sampleRateInternal = options.processorOptions.sampleRate ?? this.sampleRateInternal;
      this.maxOutputChannels = options.processorOptions.maxChannels ?? this.maxOutputChannels;
    }
    this.port.onmessage = this.handleMessage.bind(this);
    console.log('[MFNProcessor] Initialized. Sample Rate:', this.sampleRateInternal, 'Max Channels:', this.maxOutputChannels);
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const { type, payload } = event.data;
    // console.log(`[MFNProcessor] Received message: ${type}`, payload);

    try {
      switch (type) {
        case MainThreadMessageType.INIT_PROCESSOR:
          this._initProcessor(payload);
          break;
        case MainThreadMessageType.UPDATE_GRAPH:
          this._updateGraph(payload);
          break;
        case MainThreadMessageType.ADD_NODE:
          this._addNode(payload);
          break;
        case MainThreadMessageType.REMOVE_NODE:
          this._removeNode(payload);
          break;
        case MainThreadMessageType.UPDATE_PARAMETER:
          this._updateParameter(payload);
          break;
        case MainThreadMessageType.SET_GLOBAL_PARAMETER:
          this._setGlobalParameter(payload);
          break;
        case MainThreadMessageType.CHECK_PROCESSOR_STATUS: // Added case
          this._checkProcessorStatus();
          break;
        default:
          console.warn(`[MFNProcessor] Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error(`[MFNProcessor] Error handling message ${type}:`, error);
      this.port.postMessage({
        type: WorkletMessageType.WORKLET_ERROR,
        payload: { message: `Error in ${type}: ${(error as Error).message}` },
      });
    }
  }

  private _initProcessor(payload: InitProcessorMessage['payload']): void {
    console.log('[MFNProcessor] Initializing with graph:', payload.graph);
    this.sampleRateInternal = payload.sampleRate;
    this.maxOutputChannels = payload.maxChannels;
    this.graph = payload.graph;
    this._buildGraphInternals();
    this.isInitialized = true;
    this.port.postMessage({ type: WorkletMessageType.PROCESSOR_READY });
    console.log('[MFNProcessor] Processor ready.');
  }

  private _updateGraph(payload: UpdateGraphMessage['payload']): void {
    if (!this.isInitialized) {
      console.warn('[MFNProcessor] Received UPDATE_GRAPH before initialization. Graph will be set, but ensure INIT_PROCESSOR provides all necessary context (sampleRate, maxChannels).');
      this.graph = payload.graph;
    } else {
      this.graph = payload.graph;
    }
    console.log('[MFNProcessor] Updating graph:', this.graph);
    this._buildGraphInternals();
    this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
  }

  private _buildGraphInternals(): void {
    if (!this.graph) {
      console.warn('[MFNProcessor] _buildGraphInternals called with no graph.');
      return;
    }

    this.kernels.clear();
    this.nodeStates.clear();
    this.previousKernelOutputBuffers.clear();
    this.nodeOrder = this.graph.nodes.map(n => n.id);

    const defaultNodeChannelCount = this.graph.outputChannels;

    for (const node of this.graph.nodes) {
      // const kernel = kernelRegistry[node.type] ?? passthroughKernel; // Old way
      const kernel = kernelRegistry.getKernel(node.type) ?? passthroughKernel; // New way
      this.kernels.set(node.id, kernel);

      const initialState: NodeState = {};
      if (node.type === 'delay') {
        initialState.delayBuffer = new Float32Array(this.sampleRateInternal * 2);
        initialState.writePosition = 0;
      }
      this.nodeStates.set(node.id, initialState);

      const nodeChannelCount = node.channelCount ?? defaultNodeChannelCount;
      const prevOutputs: Float32Array[] = Array.from(
        { length: nodeChannelCount },
        // this.currentBlockSize might not be set before the first process call, so default is safer
        () => new Float32Array(this.currentBlockSize || DEFAULT_BLOCK_SIZE).fill(0)
      );
      this.previousKernelOutputBuffers.set(node.id, prevOutputs);
    }

    if (this.graph.routingMatrix.length === 0) { // Corrected: routingMatrix is AudioGraph member, so not null
      console.log('[MFNProcessor] Routing matrix is empty, creating default.');
      this._createDefaultRoutingMatrix();
    } else {
      const numNodes = this.graph.nodes.length;
      const expectedChannels = this.graph.outputChannels;
      if (this.graph.nodes.length > 0 && (
          this.graph.routingMatrix.length !== expectedChannels ||
          this.graph.routingMatrix[0]?.length !== numNodes ||
          this.graph.routingMatrix[0]?.[0]?.length !== numNodes )) {
        console.warn('[MFNProcessor] Routing matrix dimensions mismatch graph. Recreating default matrix.');
        this._createDefaultRoutingMatrix();
      }
    }
    console.log('[MFNProcessor] Graph internals rebuilt. Kernels:', this.kernels.size, 'Node order:', this.nodeOrder, 'Matrix:', this.graph.routingMatrix);
  }

  private _getNodeIndex(nodeId: NodeId): number {
    return this.nodeOrder.indexOf(nodeId);
  }

  private _addNode(payload: AddNodeMessage['payload']): void {
    if (!this.graph) {
      console.log('[MFNProcessor] No graph exists, creating a new one for ADD_NODE.');
      this.graph = {
        nodes: [],
        routingMatrix: [] as RoutingMatrix,
        outputChannels: this.maxOutputChannels,
        masterGain: 1.0,
      };
      this.nodeOrder = [];
    }

    const { nodeInstance } = payload;
    if (this.kernels.has(nodeInstance.id)) {
      console.warn(`[MFNProcessor] Node with ID ${nodeInstance.id} already exists. Ignoring ADD_NODE.`);
      return;
    }

    this.graph.nodes.push(nodeInstance);
    this.nodeOrder.push(nodeInstance.id);

    // const kernel = kernelRegistry[nodeInstance.type] ?? passthroughKernel; // Old way
    const kernel = kernelRegistry.getKernel(nodeInstance.type) ?? passthroughKernel; // New way
    this.kernels.set(nodeInstance.id, kernel);
    this.nodeStates.set(nodeInstance.id, {});

    const nodeChannelCount = nodeInstance.channelCount ?? this.graph.outputChannels;

    const prevOutputs: Float32Array[] = Array.from(
      { length: nodeChannelCount },
      // this.currentBlockSize might not be set before the first process call, so default is safer
      () => new Float32Array(this.currentBlockSize || DEFAULT_BLOCK_SIZE).fill(0)
    );
    this.previousKernelOutputBuffers.set(nodeInstance.id, prevOutputs);

    this._resizeAndAdaptRoutingMatrixForAddedNode(nodeInstance);

    console.log(`[MFNProcessor] Node ${nodeInstance.id} added. New graph:`, JSON.parse(JSON.stringify(this.graph))); // Deep copy for logging
    this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
  }

  private _resizeAndAdaptRoutingMatrixForAddedNode(addedNode: AudioNodeInstance): void {
    if (!this.graph) return;

    const oldNumNodes = this.graph.nodes.length - 1; // Assuming node already added to graph.nodes
    const newNumNodes = this.graph.nodes.length;
    const numChannels = this.graph.outputChannels; // No ?? needed

    const newMatrixCorrected: RoutingMatrix = Array.from({ length: numChannels }, () =>
        Array.from({ length: newNumNodes }, () => Array(newNumNodes).fill(0) as number[])
    );

    // if (oldNumNodes > 0 && this.graph.routingMatrix && this.graph.routingMatrix.length === numChannels) {
    // The this.graph.routingMatrix check is implicitly handled by oldMatrixSourceNodes > 0 or oldMatrixDestNodes > 0 if matrix can be empty array
    // The .length === numChannels check is also implicitly handled if we assume a valid prior state or handle reconstruction if not.
    if (oldNumNodes > 0) { // Simplified: if there were nodes before, try to copy their connections
      const oldMatrixChannels = this.graph.routingMatrix.length;
      const oldMatrixSourceNodes = this.graph.routingMatrix[0]?.length ?? 0;
      const oldMatrixDestNodes = this.graph.routingMatrix[0]?.[0]?.length ?? 0;

      if (oldMatrixChannels === numChannels && oldMatrixSourceNodes === oldNumNodes && oldMatrixDestNodes === oldNumNodes) {
        for (let c = 0; c < numChannels; c++) {
          for (let i = 0; i < oldNumNodes; i++) {
            for (let j = 0; j < oldNumNodes; j++) {
              // No need for undefined check if matrix is guaranteed to be filled with numbers
              newMatrixCorrected[c][i][j] = this.graph.routingMatrix[c][i][j];
            }
          }
        }
      } else {
        console.warn('[MFNProcessor] _resizeAndAdaptRoutingMatrixForAddedNode: Old matrix dimensions mismatch or invalid. Starting with a fresh zeroed matrix for new size.');
      }
    }
    this.graph.routingMatrix = newMatrixCorrected;

    const addedNodeIndex = this._getNodeIndex(addedNode.id);
    if (addedNodeIndex === -1) {
        console.error("[MFNProcessor] _resizeAndAdaptRoutingMatrixForAddedNode: Added node not found in nodeOrder. This shouldn't happen.");
        return;
    }

    const outputMixerNode = this.graph.nodes.find(n => n.type === 'output_mixer');
    // Important: get outputMixerIndex from the *current* nodeOrder, which includes the addedNode
    const outputMixerIndex = outputMixerNode ? this._getNodeIndex(outputMixerNode.id) : -1;

    if (outputMixerNode && outputMixerIndex !== -1) { // Output mixer exists in the graph
      if (addedNode.id !== outputMixerNode.id) { // The added node is NOT the output mixer
        // Connect the new node's output to the output_mixer's input
        for (let c = 0; c < numChannels; c++) {
          this.graph.routingMatrix[c][addedNodeIndex][outputMixerIndex] = 1.0;
        }
        console.log(`[MFNProcessor] Default Route: Connected new node ${addedNode.id} (idx ${addedNodeIndex}) output to ${outputMixerNode.id} (idx ${outputMixerIndex}) input.`);
      } else { // The added node IS the output mixer itself
        // Connect all OTHER existing non-mixer nodes to this newly added output_mixer
        for (let i = 0; i < newNumNodes; i++) {
          // If node 'i' is not the output_mixer itself AND its type is not 'output_mixer' (defensive)
          if (i !== addedNodeIndex && this.graph.nodes[i].type !== 'output_mixer') {
            for (let c = 0; c < numChannels; c++) {
              this.graph.routingMatrix[c][i][addedNodeIndex] = 1.0; // Source i to Dest addedNode (which is the output_mixer)
            }
            console.log(`[MFNProcessor] Default Route: Connected existing node ${this.graph.nodes[i].id} (idx ${i}) output to new ${addedNode.id} (idx ${addedNodeIndex}) input.`);
          }
        }
      }
    } else { // No output_mixer in the graph
      console.log(`[MFNProcessor] Default Route: No output_mixer. Added node ${addedNode.id} (idx ${addedNodeIndex}). Routing matrix not auto-connected for this node. Outputs will be summed.`);
    }
    // console.log('[MFNProcessor] _resizeAndAdaptRoutingMatrixForAddedNode completed. Matrix:', JSON.parse(JSON.stringify(this.graph.routingMatrix)));
  }

  private _removeNode(payload: RemoveNodeMessage['payload']): void {
    if (!this.graph) {
      console.error('[MFNProcessor] Cannot remove node: graph not initialized.');
      return;
    }
    const { nodeId } = payload;
    const nodeIndex = this._getNodeIndex(nodeId);

    if (nodeIndex === -1) {
      console.warn(`[MFNProcessor] Node with ID ${nodeId} not found. Ignoring REMOVE_NODE.`);
      return;
    }

    this.graph.nodes.splice(nodeIndex, 1);
    this.nodeOrder.splice(nodeIndex, 1);

    this.kernels.delete(nodeId);
    this.nodeStates.delete(nodeId);
    this.previousKernelOutputBuffers.delete(nodeId);

    this._createDefaultRoutingMatrix();

    console.log(`[MFNProcessor] Node ${nodeId} removed. New graph:`, JSON.parse(JSON.stringify(this.graph)));
    this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
  }

  private _updateParameter(payload: UpdateParameterMessage['payload']): void {
    if (!this.graph) return;
    const { nodeId, parameterId, value } = payload;
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (node) {
      // node.parameters is already initialized as {} in AudioNodeInstance, so ?? {} is not strictly needed
      // if it can be undefined by other means, then it's fine.
      // Assuming it's always present as per schema for existing nodes:
      node.parameters[parameterId] = value;
      this.port.postMessage({
        type: WorkletMessageType.PARAMETER_UPDATED,
        payload: { nodeId, parameterId, value },
      });
    } else {
      console.warn(`[MFNProcessor] Node ${nodeId} not found for parameter update.`);
    }
  }

  private _setGlobalParameter(payload: SetGlobalParameterMessage['payload']): void {
    if (!this.graph) return;
    const { parameterId, value } = payload;
    if (parameterId === 'masterGain' && typeof value === 'number') {
        this.graph.masterGain = value;
        console.log(`[MFNProcessor] Master gain updated to ${value}.`);
        this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
    } else {
        console.warn(`[MFNProcessor] Unknown global parameter: ${parameterId}`);
    }
  }

  // Added method
  private _checkProcessorStatus(): void {
    this.port.postMessage({
      type: WorkletMessageType.PROCESSOR_STATUS,
      payload: {
        isInitialized: this.isInitialized,
        graphNodeCount: this.graph ? this.graph.nodes.length : null,
      },
    });
  }

  private _createDefaultRoutingMatrix(): void {
    if (!this.graph || this.graph.nodes.length === 0) {
      if (this.graph) this.graph.routingMatrix = [] as RoutingMatrix;
      console.log('[MFNProcessor] _createDefaultRoutingMatrix: No graph or no nodes, matrix cleared.');
      return;
    }

    const numNodes = this.graph.nodes.length;
    const numChannels = this.graph.outputChannels; // No ?? needed

    this.graph.routingMatrix = Array.from({ length: numChannels }, () =>
      Array.from({ length: numNodes }, () => Array(numNodes).fill(0) as number[])
    );

    const outputMixerNode = this.graph.nodes.find(n => n.type === 'output_mixer');
    const outputMixerIndex = outputMixerNode ? this._getNodeIndex(outputMixerNode.id) : -1;

    if (outputMixerIndex !== -1) { // Output mixer exists
      // Route all OTHER nodes to the output_mixer
      for (let i = 0; i < numNodes; i++) {
        if (i !== outputMixerIndex) { // If it's not the output_mixer itself
          for (let c = 0; c < numChannels; c++) {
            this.graph.routingMatrix[c][i][outputMixerIndex] = 1.0; // Source i to Dest output_mixer
          }
        }
      }
      console.log('[MFNProcessor] _createDefaultRoutingMatrix: Output_mixer found. Non-mixer nodes routed to it.');
    } else { // No output_mixer, but other nodes exist
      console.log('[MFNProcessor] _createDefaultRoutingMatrix: No output_mixer. Routing matrix is zeros. Node outputs will be summed directly in process().');
    }
    // console.log('[MFNProcessor] _createDefaultRoutingMatrix completed. Matrix:', JSON.parse(JSON.stringify(this.graph.routingMatrix)));
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    if (!this.isInitialized || !this.graph || this.graph.nodes.length === 0) {
      for (const output of outputs) {
        for (const channelData of output) {
          channelData.fill(0);
        }
      }
      return true;
    }

    this.currentBlockOutputChannels = outputs[0]?.length ?? DEFAULT_OUTPUT_CHANNELS;
    this.currentBlockSize = outputs[0]?.[0]?.length ?? DEFAULT_BLOCK_SIZE;

    // Assuming this.graph.masterGain is always a number as per schema
    const masterGain = this.graph.masterGain;
    const numNodes = this.graph.nodes.length;
    const nodeInstances = this.graph.nodes;

    const currentKernelOutputBuffers: Map<NodeId, Float32Array[]> = new Map<NodeId, Float32Array[]>();
    for (const node of nodeInstances) {
      const nodeEffectiveChannelCount = node.channelCount ?? this.currentBlockOutputChannels;
      currentKernelOutputBuffers.set(
        node.id,
        Array.from({ length: nodeEffectiveChannelCount }, () => new Float32Array(this.currentBlockSize).fill(0))
      );
    }

    for (let destNodeOrderIdx = 0; destNodeOrderIdx < numNodes; destNodeOrderIdx++) {
      const destNode = nodeInstances[destNodeOrderIdx];
      const destNodeId = destNode.id;
      const destNodeEffectiveChannelCount = destNode.channelCount ?? this.currentBlockOutputChannels;
      const kernel = this.kernels.get(destNodeId);
      const state = this.nodeStates.get(destNodeId) ?? {};

      if (!kernel) continue;

      const mixedInputsForDestNode: Float32Array[] = Array.from(
        { length: destNodeEffectiveChannelCount },
        () => new Float32Array(this.currentBlockSize).fill(0)
      );

      for (let inputChannelIdx = 0; inputChannelIdx < destNodeEffectiveChannelCount; inputChannelIdx++) {
        for (let sourceNodeOrderIdx = 0; sourceNodeOrderIdx < numNodes; sourceNodeOrderIdx++) {
          const sourceNode = nodeInstances[sourceNodeOrderIdx];
          const sourceNodeId = sourceNode.id;
          const sourceNodeEffectiveChannelCount = sourceNode.channelCount ?? this.currentBlockOutputChannels;

          if (inputChannelIdx < sourceNodeEffectiveChannelCount) {
            const gain = this.graph.routingMatrix[inputChannelIdx]?.[sourceNodeOrderIdx]?.[destNodeOrderIdx] ?? 0;
            if (gain > 0) {
              const sourceOutputBufferFromPreviousBlock = this.previousKernelOutputBuffers.get(sourceNodeId)?.[inputChannelIdx];
              if (sourceOutputBufferFromPreviousBlock) {
                for (let s = 0; s < this.currentBlockSize; s++) {
                  mixedInputsForDestNode[inputChannelIdx][s] += sourceOutputBufferFromPreviousBlock[s] * gain;
                }
              }
            }
          }
        }
      }

      const kernelSpecificOutputs = currentKernelOutputBuffers.get(destNodeId);
      if (!kernelSpecificOutputs) {
        // This should ideally not happen if currentKernelOutputBuffers is populated correctly for all nodes
        if (this.logCounter % (this.logThrottle * 10) === 0) {
            console.warn(`[MFNProcessor process] Missing currentKernelOutputBuffers for node ${destNodeId}. Skipping kernel processing for this node.`);
        }
        continue;
      }
      kernel(mixedInputsForDestNode, kernelSpecificOutputs, destNode, this.currentBlockSize, this.sampleRateInternal, destNodeEffectiveChannelCount, state);
    }

    const finalOutputBuffers = outputs[0];
    for (let c = 0; c < this.currentBlockOutputChannels; c++) {
      finalOutputBuffers[c]?.fill(0);
    }

    const outputMixerNodeInstance = nodeInstances.find(n => n.type === 'output_mixer');
    if (outputMixerNodeInstance) {
      const mixerOutput = currentKernelOutputBuffers.get(outputMixerNodeInstance.id);
      if (mixerOutput) {
        for (let c = 0; c < Math.min(this.currentBlockOutputChannels, mixerOutput.length); c++) {
          if (finalOutputBuffers[c] && mixerOutput[c]) {
            for (let s = 0; s < this.currentBlockSize; s++) {
              finalOutputBuffers[c][s] = mixerOutput[c][s] * masterGain;
            }
          }
        }
      }
    } else {
      for (const node of nodeInstances) {
        if (node.type === 'output_mixer') continue; // Should not happen if find succeeded, but defensive

        const nodeOutput = currentKernelOutputBuffers.get(node.id);
        if (nodeOutput) {
          for (let c = 0; c < Math.min(this.currentBlockOutputChannels, nodeOutput.length); c++) {
            if (finalOutputBuffers[c] && nodeOutput[c]) {
              for (let s = 0; s < this.currentBlockSize; s++) {
                finalOutputBuffers[c][s] += nodeOutput[c][s] * masterGain;
              }
            }
          }
        }
      }
    }

    // Update previousKernelOutputBuffers for the next block
    for (const [nodeId, currentOutputs] of currentKernelOutputBuffers) {
      let prevOutputChannels = this.previousKernelOutputBuffers.get(nodeId);

      // Ensure the entry for the node exists in previousKernelOutputBuffers
      if (!prevOutputChannels) {
        if (this.logCounter % (this.logThrottle * 5) === 0) {
            console.warn(`[MFNProcessor] process: Creating previousKernelOutputBuffers entry for node ${nodeId} as it was missing. Ch count: ${currentOutputs.length}, BlockSize: ${this.currentBlockSize}`);
        }
        prevOutputChannels = currentOutputs.map(arr => new Float32Array(arr.length));
        this.previousKernelOutputBuffers.set(nodeId, prevOutputChannels);
      }

      // Ensure channel counts match
      if (prevOutputChannels.length !== currentOutputs.length) {
        if (this.logCounter % (this.logThrottle * 5) === 0) {
            console.warn(`[MFNProcessor] process: Channel count mismatch for node ${nodeId} during prevOutput update. Prev: ${prevOutputChannels.length}, Curr: ${currentOutputs.length}. Re-mapping.`);
        }
        prevOutputChannels = currentOutputs.map(arr => new Float32Array(arr.length));
        this.previousKernelOutputBuffers.set(nodeId, prevOutputChannels);
      }

      for (let c = 0; c < currentOutputs.length; c++) {
        // Ensure channel buffer exists and lengths match
        if (prevOutputChannels[c] && prevOutputChannels[c].length === currentOutputs[c].length) {
          prevOutputChannels[c].set(currentOutputs[c]);
        } else {
          if (this.logCounter % (this.logThrottle * 5) === 0) {
            console.warn(`[MFNProcessor] process: Buffer length mismatch for node ${nodeId}, channel ${c} during prevOutput update. Prev len: ${prevOutputChannels[c]?.length}, Curr len: ${currentOutputs[c]?.length}. BlockSize: ${this.currentBlockSize}. Re-creating buffer for this channel.`);
          }
          // Recreate this specific channel's buffer if it's problematic
          prevOutputChannels[c] = new Float32Array(currentOutputs[c].length);
          prevOutputChannels[c].set(currentOutputs[c]);
        }
      }
    }

    if (this.logCounter % this.logThrottle === 0 && nodeInstances.length > 0) {
        // console.log(`[MFNProcessor process #${this.logCounter}] End of block. MasterGain: ${masterGain}, Nodes: ${nodeInstances.length}`);
        // const noiseNode = nodeInstances.find(n => n.type === 'noise');
        // if (noiseNode) {
        //     const noiseCurrentOut = currentKernelOutputBuffers.get(noiseNode.id);
        //     const noisePrevOut = this.previousKernelOutputBuffers.get(noiseNode.id);
        //     if (noiseCurrentOut?.[0]?.[0] !== undefined) {
        //         console.log(`  Noise (${noiseNode.id}) current ch0[0]: ${noiseCurrentOut[0][0].toFixed(3)}`);
        //     }
        //     if (noisePrevOut?.[0]?.[0] !== undefined) {
        //          console.log(`  Noise (${noiseNode.id}) prev ch0[0]: ${noisePrevOut[0][0].toFixed(3)} (after update)`);
        //     }
        // }
        // if (finalOutputBuffers[0]?.[0] !== undefined) {
        //   console.log(`  Final output ch0[0]: ${finalOutputBuffers[0][0].toFixed(3)}`);
        // }
    }
    this.logCounter++;

    return true;
  }
}

registerProcessor('mfn-processor', MfnProcessor);
export {}; // Ensures this is a module
