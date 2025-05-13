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

import type {
  AudioGraph,
  MainThreadMessage,
  NodeType,
  AudioNodeInstance as SchemaAudioNodeInstance, // Renamed to avoid conflict
} from './schema';
import {
  MainThreadMessageType,
  WorkletMessageType as WorkletMsgTypeEnum, // Renamed for clarity
} from './schema';
import {
  processGain,
  processDelay,
  processBiquad,
  processPassthrough,
  type DSPKernel,
} from './nodes';
import type { NodeState } from './nodes/dsp-kernel';

// Use the aliased type for internal consistency
type AudioNodeInstance = SchemaAudioNodeInstance;

const dspKernels: Partial<Record<NodeType, DSPKernel>> = {
  gain: processGain,
  delay: processDelay,
  biquad: processBiquad,
  input_mixer: processPassthrough,
  output_mixer: processPassthrough,
};

function getSourceNodeDataForDestination(
  graph: AudioGraph,
  nodes: AudioNodeInstance[],
  destNodeId: string,
  channel: number
): { sourceNodeId: string; gain: number }[] {
  const destNodeIndex = nodes.findIndex((n) => n.id === destNodeId);
  if (destNodeIndex === -1) return [];

  const sources: { sourceNodeId: string; gain: number }[] = [];
  nodes.forEach((sourceNode, sourceNodeIndex) => {
    const gain = graph.routingMatrix[channel]?.[sourceNodeIndex]?.[destNodeIndex];
    if (typeof gain === 'number' && gain !== 0) {
      sources.push({ sourceNodeId: sourceNode.id, gain });
    }
  });
  return sources;
}

class MFNProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph = {
    nodes: [],
    routingMatrix: [],
    outputChannels: 2,
    masterGain: 1.0,
  };
  private maxChannels = 2;
  private nodeOutputBuffers: Map<string, Float32Array[]> = new Map<string, Float32Array[]>();
  private nodeStates: Map<string, NodeState> = new Map<string, NodeState>();
  private initialized = false;

  constructor(options?: globalThis.AudioWorkletNodeOptions) { // Explicitly use globalThis
    super(options);
    this.port.onmessage = this.handleMessage.bind(this);
    console.log('[MFNProcessor] Constructor: Port open, awaiting CHECK_PROCESSOR_STATUS from main thread.');
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const { type, payload } = event.data;

    switch (type) {
      case MainThreadMessageType.INIT_PROCESSOR: {
        this.graph = payload.graph;
        this.maxChannels = payload.maxChannels;
        this.nodeStates.clear();
        this.graph.nodes.forEach((node) => {
          // node.parameters is a required property of AudioNodeInstance
          this.nodeStates.set(node.id, node.parameters);
        });
        this.initialized = true;
        console.log(
          `[MFNProcessor] Initialized. SR: ${sampleRate}, MaxCh: ${this.maxChannels}, GraphCh: ${this.graph.outputChannels}`
        );
        break;
      }
      case MainThreadMessageType.UPDATE_GRAPH: {
        const oldNodeIds = new Set(this.graph.nodes.map(n => n.id));
        this.graph = payload.graph;
        const newNodeIds = new Set(this.graph.nodes.map((n) => n.id));

        for (const nodeId of oldNodeIds) {
          if (!newNodeIds.has(nodeId)) {
            this.nodeStates.delete(nodeId);
            this.nodeOutputBuffers.delete(nodeId);
          }
        }
        this.graph.nodes.forEach((node) => {
          if (!this.nodeStates.has(node.id)) {
            // node.parameters is a required property
            this.nodeStates.set(node.id, node.parameters);
          }
        });
        console.log('[MFNProcessor] Graph updated.');
        break;
      }
      case MainThreadMessageType.UPDATE_PARAMETER: {
        const nodeInstance = this.graph.nodes.find((n) => n.id === payload.nodeId);
        if (nodeInstance) {
          // nodeInstance.parameters is a required property, so no need to initialize it to {}
          nodeInstance.parameters[payload.parameterId] = payload.value;

          const state = this.nodeStates.get(payload.nodeId);
          if (state) {
            state[payload.parameterId] = payload.value;
          } else {
            this.nodeStates.set(payload.nodeId, { [payload.parameterId]: payload.value });
          }

        } else {
          console.warn(`[MFNProcessor] Node not found for param update: ${payload.nodeId}`);
        }
        break;
      }
      case MainThreadMessageType.RENDER_OFFLINE: {
        console.log('[MFNProcessor] RENDER_OFFLINE (not implemented), duration:', payload.durationSeconds);
        this.port.postMessage({
          type: WorkletMsgTypeEnum.WORKLET_ERROR,
          payload: { message: 'Offline rendering not yet implemented.' },
        }); // Removed 'as WorkletMessage'
        break;
      }
      case MainThreadMessageType.SET_OUTPUT_CHANNELS: {
        console.log(`[MFNProcessor] Info: Main context output channels: ${payload.outputChannels}. Graph output channels: ${this.graph.outputChannels}`);
        // This message is more informational for the processor; actual channel count for processing
        // is derived from the 'outputs' argument in the process() method.
        break;
      }
      // ADDED: New case for the handshake
      case MainThreadMessageType.CHECK_PROCESSOR_STATUS:
        this.port.postMessage({ type: WorkletMsgTypeEnum.PROCESSOR_READY });
        console.log('[MFNProcessor] Received CHECK_PROCESSOR_STATUS, sent PROCESSOR_READY.');
        break;
      // ADDED: Case to handle ADD_NODE
      case MainThreadMessageType.ADD_NODE: {
        const { nodeInstance } = payload as { nodeInstance: AudioNodeInstance }; // Type assertion for payload
        // Check if node already exists to prevent duplicates (optional, good practice)
        if (this.graph.nodes.find(n => n.id === nodeInstance.id)) {
          console.warn(`[MFNProcessor] Node with ID ${nodeInstance.id} already exists. Ignoring ADD_NODE.`);
          // Optionally, send a message back to main thread indicating this
          // this.port.postMessage({ type: WorkletMsgTypeEnum.WORKLET_ERROR, payload: { message: `Node ${nodeInstance.id} already exists.` } });
          break;
        }

        this.graph.nodes.push(nodeInstance);
        // Initialize state for the new node
        this.nodeStates.set(nodeInstance.id, { ...nodeInstance.parameters });

        // Adjust routingMatrix:
        // The routingMatrix is channel -> sourceNodeIndex -> destNodeIndex.
        // Adding a new node means new sourceNodeIndex and destNodeIndex possibilities.
        // The new node will be at index this.graph.nodes.length - 1.
        // const newNodeIndex = this.graph.nodes.length - 1;

        // For each channel:
        this.graph.routingMatrix.forEach((channelMatrix) => {
          // Add a new row (for the new node as a source) to each existing destination's column.
          // All existing nodes get a new potential source.
          channelMatrix.forEach((sourceRow) => {
            sourceRow.push(0); // New node as destination, default gain 0 from existing sources
          });

          // Add a new column (for the new node as a destination) for each existing source.
          // The new node gets a new set of potential sources.
          const newSourceRow = new Array(this.graph.nodes.length).fill(0);
          channelMatrix.push(newSourceRow as number[]); // New node as source, default gain 0 to all destinations (including itself)
        });

        // If the routing matrix was empty (e.g., first node), initialize it.
        if (this.graph.nodes.length === 1 && this.graph.routingMatrix.length === 0) {
          const numChannels = this.maxChannels; // Or this.graph.outputChannels if that's more appropriate
          for (let c = 0; c < numChannels; c++) {
            this.graph.routingMatrix[c] = [[0]]; // Single node, single channel, connection to itself is 0
          }
        }


        console.log(`[MFNProcessor] Added node: ${nodeInstance.id} (${nodeInstance.type}). Graph now has ${this.graph.nodes.length} nodes.`);
        // Optionally, confirm back to the main thread
        this.port.postMessage({
          type: WorkletMsgTypeEnum.NODE_ADDED, // Ensure this enum member exists
          payload: nodeInstance,
        });
        break;
      }
      default:
        console.warn('[MFNProcessor] Unknown message type:', type);
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array> // parameters are handled via messages
  ): boolean {
    const mainOutputArray = outputs[0]; // Assumed to be Float32Array[] by linter context

    if (!this.initialized || this.graph.nodes.length === 0) {
      const mainInputArray = inputs[0]; // Assumed to be Float32Array[] by linter context

      // Assuming mainOutputArray is always a valid Float32Array[] here based on lint errors
      const numOutCh = mainOutputArray.length;
      // Assuming mainInputArray is always a valid Float32Array[]
      const numInCh = mainInputArray.length;
      const numChToCopy = Math.min(numOutCh, numInCh);

      for (let i = 0; i < numChToCopy; i++) {
        const inputCh = mainInputArray[i]; // Direct access, assuming valid index
        const outputCh = mainOutputArray[i]; // Direct access, assuming valid index
        // Both inputCh and outputCh are assumed to be valid Float32Array here
        outputCh.set(inputCh);
      }
      for (let i = numChToCopy; i < numOutCh; i++) {
        mainOutputArray[i].fill(0); // Silence remaining output channels
      }
      return true;
    }

    // Assuming mainOutputArray is valid Float32Array[]
    // mainOutputArray[0] can be undefined if mainOutputArray is empty.
    const blockSize = mainOutputArray[0]?.length ?? 128;
    const currentSampleRate = sampleRate; // Global from AudioWorklet scope
    const numSystemChannels = this.graph.outputChannels; // Use graph's channel config

    // 1. Initialize or clear nodeOutputBuffers for this block
    this.graph.nodes.forEach((node) => {
      let buffers = this.nodeOutputBuffers.get(node.id);
      if (!buffers || buffers.length !== numSystemChannels || (buffers[0] && buffers[0].length !== blockSize)) {
        buffers = Array.from({ length: numSystemChannels }, () => new Float32Array(blockSize));
      } else {
        buffers.forEach((buffer) => buffer.fill(0));
      }
      this.nodeOutputBuffers.set(node.id, buffers);
    });

    // 2. Copy main processor inputs to 'input_mixer' pseudo-nodes' output buffers
    const mainProcessorInputArray = inputs[0]; // Assumed to be Float32Array[]
    // Assuming mainProcessorInputArray is always a valid Float32Array[]
    if (mainProcessorInputArray.length > 0) {
      this.graph.nodes
        .filter((node) => node.type === 'input_mixer')
        .forEach((inputNode) => {
          const inputNodeOutputBuffers = this.nodeOutputBuffers.get(inputNode.id);
          if (inputNodeOutputBuffers) {
            const numChannelsToCopy = Math.min(inputNodeOutputBuffers.length, mainProcessorInputArray.length, numSystemChannels);
            for (let i = 0; i < numChannelsToCopy; i++) {
              const sourceChannel = mainProcessorInputArray[i]; // Known to be Float32Array here
              inputNodeOutputBuffers[i].set(sourceChannel);
            }
          }
        });
    }

    // 3. Process all non-mixer nodes
    this.graph.nodes
      .filter((node) => node.type !== 'input_mixer' && node.type !== 'output_mixer')
      .forEach((node) => {
        const kernel = dspKernels[node.type];
        const nodeInputBuffers: Float32Array[] = Array.from({ length: numSystemChannels }, () => new Float32Array(blockSize));
        const nodeOutputBuffers = this.nodeOutputBuffers.get(node.id);
        const nodeState = this.nodeStates.get(node.id);

        if (!nodeState) {
            console.warn(`[MFNProcessor] State not found for node ${node.id}. Skipping.`);
            if (nodeOutputBuffers) nodeOutputBuffers.forEach(ch => ch.fill(0));
            return;
        }

        // Accumulate inputs based on routing matrix
        for (let c = 0; c < numSystemChannels; c++) {
          const sourceNodesData = getSourceNodeDataForDestination(this.graph, this.graph.nodes, node.id, c);
          sourceNodesData.forEach((sourceData) => {
            const sourceOutputBufferSet = this.nodeOutputBuffers.get(sourceData.sourceNodeId);
            const sourceChannelBuffer = sourceOutputBufferSet?.[c];
            if (sourceChannelBuffer) {
              for (let i = 0; i < blockSize; i++) {
                nodeInputBuffers[c][i] += sourceChannelBuffer[i] * sourceData.gain;
              }
            }
          });
        }

        if (kernel && nodeOutputBuffers) {
          try {
            kernel(
              nodeInputBuffers,
              nodeOutputBuffers,
              node, // The AudioNodeInstance from the graph
              blockSize,
              currentSampleRate,
              numSystemChannels,
              nodeState // The specific state for this node instance
            );
            // DSPKernel might modify nodeState, no need to set it back unless it's a new object
          } catch (e) {
            console.error(`[MFNProcessor] Error in node ${node.id} (${node.type}):`, e);
            this.port.postMessage({
              type: WorkletMsgTypeEnum.NODE_ERROR,
              payload: { nodeId: node.id, error: (e as Error).message },
            }); // Removed 'as WorkletMessage'
            nodeOutputBuffers.forEach((ch) => ch.fill(0)); // Silence output on error
          }
        } else if (nodeOutputBuffers) { // Passthrough if no kernel (e.g. for 'unknown' type)
          for (let c = 0; c < numSystemChannels; c++) {
            if (nodeInputBuffers[c] && nodeOutputBuffers[c]) {
              nodeOutputBuffers[c].set(nodeInputBuffers[c]);
            } else if (nodeOutputBuffers[c]) {
              nodeOutputBuffers[c].fill(0);
            }
          }
        }
      });

    // 4. Accumulate outputs for 'output_mixer' pseudo-nodes into main processor outputs
    // Assuming mainOutputArray is always a valid Float32Array[]
    if (mainOutputArray.length > 0) {
      mainOutputArray.forEach((channelBuffer) => channelBuffer.fill(0));

      this.graph.nodes
        .filter((node) => node.type === 'output_mixer')
        .forEach((outputNode) => {
          const numChannelsToProcess = Math.min(numSystemChannels, mainOutputArray.length);
          for (let c = 0; c < numChannelsToProcess; c++) {
            const mainOutputChannelBuffer = mainOutputArray[c]; // Assumed valid Float32Array
            // No 'if (mainOutputChannelBuffer)' needed if it's guaranteed by the loop and types
            const sourceNodesData = getSourceNodeDataForDestination(this.graph, this.graph.nodes, outputNode.id, c);
            sourceNodesData.forEach((sourceData) => {
              const sourceOutputBufferSet = this.nodeOutputBuffers.get(sourceData.sourceNodeId);
              const sourceChannelBuffer = sourceOutputBufferSet?.[c];
              if (sourceChannelBuffer) {
                for (let i = 0; i < blockSize; i++) {
                  mainOutputChannelBuffer[i] += sourceChannelBuffer[i] * sourceData.gain;
                }
              }
            });
            // Apply master gain
            for (let i = 0; i < blockSize; i++) {
              mainOutputChannelBuffer[i] *= this.graph.masterGain;
            }
          }
        });
      // Silence any extra main output channels not covered by graph.outputChannels
      for (let c = numSystemChannels; c < mainOutputArray.length; c++) {
        mainOutputArray[c].fill(0);
      }
    }
    return true;
  }
}

registerProcessor('mfn-processor', MFNProcessor);
export {}; // Ensures this is a module
