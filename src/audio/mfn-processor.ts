/**
 * mfn-processor.ts
 * AudioWorkletProcessor for the Multichannel Feedback Network.
 */

// Ensures TypeScript recognizes AudioWorklet-specific globals and types.
declare global {
  // AudioWorkletGlobalScope properties
  const currentFrame: number;
  const sampleRate: number;

  function registerProcessor(
    name: string,
    processorCtor: (new (
      options?: AudioWorkletNodeOptions,
    ) => AudioWorkletProcessor) & {
      parameterDescriptors?: AudioParamDescriptor[];
    },
  ): void;

  // Base AudioWorkletProcessor class definition
  class AudioWorkletProcessor {
    constructor(options?: AudioWorkletNodeOptions);
    readonly port: MessagePort;
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean;
  }

  // AudioParamDescriptor interface definition
  interface AudioParamDescriptor {
    name: string;
    automationRate?: 'a-rate' | 'k-rate';
    defaultValue?: number;
    minValue?: number;
    maxValue?: number;
  }

  // AudioWorkletNodeOptions might also need a basic definition if not picked up
  // from lib: ["DOM"]. For now, assuming it's available or covered by 'any' in processorOptions.
  interface AudioWorkletNodeOptions {
    numberOfInputs?: number;
    numberOfOutputs?: number;
    outputChannelCount?: number[];
    parameterData?: Record<string, number>;
    processorOptions?: any; // Reverted to any to match common global lib definitions
  }
}

import type {
  AudioGraph,
  AudioNodeInstance,
  MainThreadMessage,
  WorkletMessage,
  WorkletMessageType,
} from './schema';
import { MainThreadMessageType, NODE_PARAMETER_DEFINITIONS, WorkletMessageType as WorkletMsgTypeEnum } from './schema';
import {dspKernels, type DSPKernel} from './nodes';
import { বাজেtrix, createEmptyRoutingMatrix, getSourceNodes, getTargetNodes } from './matrix'; // Assuming বাজেtrix is a typo and should be matrix
import type { NodeState } from './nodes/dsp-kernel'; // Import NodeState

// AudioWorkletGlobalScope is available in AudioWorkletProcessor
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const globalThis: AudioWorkletGlobalScope;
const { sampleRate, currentTime, currentFrame } = globalThis;

// No MFNProcessorInterface needed

class MFNProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph = { nodes: [], routingMatrix: [], outputChannels: 2, masterGain: 1.0 };
  private maxChannels = 2;
  private internalInputBuffer: Float32Array[] = [];
  private internalOutputBuffer: Float32Array[] = [];
  private nodeOutputBuffers: Map<string, Float32Array[]> = new Map();
  private nodeStates: Map<string, NodeState> = new Map(); // Added to store state for each node

  private initialized = false;
  private lastGraphUpdateTime = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    console.log('[MFNProcessor] Instance created.');
    if (options?.processorOptions) {
      // this.maxChannels = options.processorOptions.maxChannels || 8;
      // this.graph = options.processorOptions.graph; // Initial graph can be passed here
      console.log('[MFNProcessor] Received options:', options.processorOptions);
    }

    // Initialize graph with empty values
    this.port.onmessage = this.handleMessage.bind(this);
    // Signal readiness to the main thread
    this.port.postMessage({ type: WorkletMsgTypeEnum.PROCESSOR_READY });
    console.log('[MFNProcessor] Processor ready message sent.');
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const { type, payload } = event.data;
    console.log(`[MFNProcessor] Received message: ${type}`, payload);

    switch (type) {
      case MainThreadMessageType.INIT_PROCESSOR:
        this.graph = payload.graph;
        this.maxChannels = payload.maxChannels;
        // Initialize node states
        this.nodeStates.clear();
        this.graph.nodes.forEach(node => {
          this.nodeStates.set(node.id, {}); // Initialize with empty state
        });
        this.initialized = true;
        this.lastGraphUpdateTime = currentTime;
        console.log('[MFNProcessor] Initialized with graph:', this.graph, 'maxChannels:', this.maxChannels);
        break;
      case MainThreadMessageType.UPDATE_GRAPH:
        this.graph = payload.graph;
        // Update node states: add new, remove old if necessary
        const newNodeIds = new Set(this.graph.nodes.map(n => n.id));
        for (const nodeId of this.nodeStates.keys()) {
          if (!newNodeIds.has(nodeId)) {
            this.nodeStates.delete(nodeId);
          }
        }
        this.graph.nodes.forEach(node => {
          if (!this.nodeStates.has(node.id)) {
            this.nodeStates.set(node.id, {}); // Initialize new nodes with empty state
          }
        });
        this.lastGraphUpdateTime = currentTime;
        console.log('[MFNProcessor] Graph updated:', this.graph);
        break;
      case MainThreadMessageType.UPDATE_PARAMETER: {
        if (this.graph) {
          const payload = message.payload;
          const node = this.graph.nodes.find((n) => n.id === payload.nodeId);
          if (node) {
            // node.parameters is guaranteed by AudioNodeInstance type in schema.ts
            node.parameters[payload.parameterId] = payload.value;
          } else {
            console.warn(
              `[MFNProcessor] Node not found for param update: ${payload.nodeId}`,
            );
          }
        }
        break;
      }
      case MainThreadMessageType.SET_OUTPUT_CHANNELS: {
        const payload = message.payload;
        if (payload.outputChannels > this.maxChannelsConfig) {
          console.error(
            `[MFNProcessor] Requested output channels (${payload.outputChannels}) exceeds max (${this.maxChannelsConfig}).`,
          );
          return;
        }
        if (this.numChannels !== payload.outputChannels) {
          this.numChannels = payload.outputChannels;
          if (this.graph) {
            this.graph.outputChannels = payload.outputChannels;
            this.initializeGraph(this.graph, this.internalSampleRate, this.maxChannelsConfig);
          }
          console.log(
            `[MFNProcessor] Output channels set to ${this.numChannels}`,
          );
        }
        break;
      }
      case MainThreadMessageType.RENDER_OFFLINE: { // Added this case
        const payload = message.payload;
        console.log('[MFNProcessor] RENDER_OFFLINE message received, duration:', payload.durationSeconds, 'seconds. Offline rendering not yet implemented.');
        // Actual offline rendering logic will be part of a later step (e.g., Step 12)
        // For now, we can acknowledge the message.
        // Example: this.port.postMessage({ type: WorkletMessageType.DATA_AVAILABLE, payload: { dataType: 'offlineRenderStatus', data: 'started' } });
        break;
      }
    }
  }

  private initializeGraph(
    graph: AudioGraph,
    sampleRateValue: number,
    maxChannels: number,
  ) {
    this.graph = graph;
    this.internalSampleRate = sampleRateValue;
    this.maxChannelsConfig = maxChannels;
    this.numChannels = graph.outputChannels || 2;

    this.nodeOutputs.clear();
    const initialBlockSize = 128;
    this.graph.nodes.forEach(node => {
      const nodeOutputBuffers: Float32Array[][] = [[]]; // Output port 0
      for (let i = 0; i < this.numChannels; i++) {
        nodeOutputBuffers[0][i] = new Float32Array(initialBlockSize);
      }
      this.nodeOutputs.set(node.id, nodeOutputBuffers);
    });

    console.log(
      `[MFNProcessor] Graph initialized. Sample Rate: ${this.internalSampleRate}, Output Channels: ${this.numChannels}`,
      this.graph,
    );
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.graph?.nodes.length) {
      for (const output of outputs) {
        for (const outputChannel of output) {
          outputChannel.fill(0);
        }
      }
      return true;
    }

    const mainInput = inputs[0]; // Assuming at least one input from AudioWorklet spec
    const mainOutput = outputs[0]; // Assuming at least one output
    const blockSize = mainOutput[0]?.length || 128;

    // 1. Prepare/Validate `this.nodeOutputs`
    this.graph.nodes.forEach(node => {
      const prevNodeOutputArrays = this.nodeOutputs.get(node.id);
      // Check if buffers need to be (re)created or resized
      if (
        !prevNodeOutputArrays?.[0] || // No output port 0 array
        prevNodeOutputArrays[0].length !== this.numChannels || // Incorrect number of channels
        prevNodeOutputArrays[0]?.[0]?.length !== blockSize // Incorrect block size for channel 0
      ) {
        const newBuffersForPrevState: Float32Array[][] = [[]]; // Output port 0
        for (let i = 0; i < this.numChannels; i++) {
          newBuffersForPrevState[0][i] = new Float32Array(blockSize);
        }
        this.nodeOutputs.set(node.id, newBuffersForPrevState);
      }
    });

    // 2. Create `currentNodeResults` and `destinationNodeInputs`
    const currentNodeResults: Map<string, Float32Array[][]> = new Map<string, Float32Array[][]>();
    const destinationNodeInputs: Map<string, Float32Array[][]> = new Map<string, Float32Array[][]>();

    this.graph.nodes.forEach(node => {
      const newKernelOutputBuffers: Float32Array[][] = [[]]; // Output port 0
      const newNodeInputBuffers: Float32Array[][] = [[]]; // Input port 0
      for (let i = 0; i < this.numChannels; i++) {
        newKernelOutputBuffers[0][i] = new Float32Array(blockSize);
        newNodeInputBuffers[0][i] = new Float32Array(blockSize); // Initialize with zeros
      }
      currentNodeResults.set(node.id, newKernelOutputBuffers);
      destinationNodeInputs.set(node.id, newNodeInputBuffers);
    });

    // 3. Calculate all node inputs for the current block using processMatrix
    // this.nodeOutputs contains the state from the *previous* block
    // destinationNodeInputs will be populated with inputs for the *current* block
    processMatrix(
      this.nodeOutputs,
      this.graph, // graph is non-null here
      this.numChannels,
      blockSize,
      destinationNodeInputs, // This map will be populated by processMatrix
    );

    // TODO: Address topological sorting or iterative processing strategy (from README/previous discussions).
    // CURRENT APPROACH for feedback and processing order:
    // 1. Feedback Handling: `processMatrix` uses `this.nodeOutputs` (outputs from the *previous* block)
    //    to calculate `destinationNodeInputs` for the *current* block. This introduces an inherent
    //    one-block delay in all feedback paths, effectively breaking cycles for same-block calculations.
    //    This is a standard technique in block-based audio processing.
    // 2. Node Processing Order: The loop below iterates nodes in the order they appear in `this.graph.nodes`,
    //    which is defined by the main thread. Since all `destinationNodeInputs` are pre-calculated based on
    //    the previous block, this iteration order does not change the audio outcome for the current block.
    //    The order primarily matters for how `routingMatrix` indices correspond to nodes.
    // 3. Iterative Processing: An iterative strategy (re-calculating graph outputs multiple times within
    //    one block until convergence) is not currently implemented. It would be a more complex change,
    //    potentially for future requirements like zero-delay feedback in specific scenarios.

    // 4. Iterate `this.graph.nodes` to process DSP and apply inputs
    for (const node of this.graph.nodes) {
      const nodeKernelOutputBuffers = currentNodeResults.get(node.id)?.[0]; // Output for current node, current block
      const calculatedNodeInputBuffers = destinationNodeInputs.get(node.id)?.[0]; // Input for current node, current block

      if (!nodeKernelOutputBuffers) {
        console.warn(`[MFNProcessor] Could not get kernel output buffers for node ${node.id}`);
        continue;
      }
      if (!calculatedNodeInputBuffers) {
        console.warn(`[MFNProcessor] Could not get calculated input buffers for node ${node.id}`);
        continue;
      }

      // For 'input_mixer' nodes, add the mainWorkletInput to the already calculated matrix-based input
      if (node.type === 'input_mixer') {
        for (let chan = 0; chan < this.numChannels; chan++) {
          if (mainInput[chan] && calculatedNodeInputBuffers[chan]) {
            for (let sample = 0; sample < blockSize; sample++) {
              calculatedNodeInputBuffers[chan][sample] += mainInput[chan][sample];
            }
          }
        }
      }

      // Select and apply DSP kernel based on node type
      let kernel: DSPKernel;
      switch (node.type) {
        case 'gain':
          kernel = processGain;
          break;
        case 'delay': // Added case for delay
          kernel = processDelay;
          break;
        case 'biquad': // Added case for biquad
          kernel = processBiquad;
          break;
        case 'input_mixer':
        case 'output_mixer':
        default:
          kernel = processPassthrough;
          break;
      }

      kernel(
        calculatedNodeInputBuffers, // expects Float32Array[] (port 0, [channelIndex][sampleIndex])
        nodeKernelOutputBuffers,    // expects Float32Array[] (port 0, [channelIndex][sampleIndex])
        node,
        blockSize,
        this.internalSampleRate,
        this.numChannels,
      );
    }

    // 5. Mix node outputs to `mainOutput`
    for (let chan = 0; chan < this.numChannels; chan++) {
      if (!mainOutput[chan]) continue;
      mainOutput[chan].fill(0);
      for (let sample = 0; sample < blockSize; sample++) {
        let finalSampleValue = 0;
        let outputMixerContributed = false;
        for (const node of this.graph.nodes) {
          if (node.type === 'output_mixer') {
            const nodeCurrentOutputPort = currentNodeResults.get(node.id);
            if (nodeCurrentOutputPort?.[0]?.[chan]) {
              finalSampleValue += nodeCurrentOutputPort[0][chan][sample];
              outputMixerContributed = true;
            }
          }
        }

        if (!outputMixerContributed && this.graph.nodes.length === 1 && this.graph.nodes[0].type !== 'input_mixer') {
            const singleNodeCurrentOutput = currentNodeResults.get(this.graph.nodes[0].id);
            if(singleNodeCurrentOutput?.[0]?.[chan]) {
                finalSampleValue = singleNodeCurrentOutput[0][chan][sample];
            }
        }
        // masterGain is number in schema, no nullish coalescing needed if graph is present.
        mainOutput[chan][sample] = finalSampleValue * this.graph.masterGain;
      }
    }

    // 6. RMS Guard
    for (let chan = 0; chan < this.numChannels; chan++) {
      if (!mainOutput[chan]) continue;
      let sumOfSquares = 0;
      for (let sample = 0; sample < blockSize; sample++) {
        sumOfSquares += mainOutput[chan][sample] * mainOutput[chan][sample];
      }
      const rms = Math.sqrt(sumOfSquares / blockSize);
      const threshold = 0.95;
      if (rms > threshold) {
        const gainReduction = threshold / rms;
        for (let sample = 0; sample < blockSize; sample++) {
          mainOutput[chan][sample] *= gainReduction;
        }
      }
    }

    // 7. Update `this.nodeOutputs`
    this.graph.nodes.forEach(node => {
      const calculatedOutputForNode = currentNodeResults.get(node.id);
      const targetForNextBlockStorage = this.nodeOutputs.get(node.id);
      // Ensure port 0 exists on both and channel arrays are valid
      if (calculatedOutputForNode?.[0] && targetForNextBlockStorage?.[0]) {
        for (let chan = 0; chan < calculatedOutputForNode[0].length; chan++) {
          if (calculatedOutputForNode[0][chan] && targetForNextBlockStorage[0][chan]) {
             targetForNextBlockStorage[0][chan].set(calculatedOutputForNode[0][chan]);
          }
        }
      }
    });

    // Zero out any extra output channels the host provided but we are not using
    for (let i = this.numChannels; i < mainOutput.length; i++) {
      if (mainOutput[i]) { // Check if the channel array itself exists
        mainOutput[i].fill(0);
      }
    }

    return true;
  }

  // ...existing code...
  private processGraph(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (!this.initialized || !this.graph || this.graph.nodes.length === 0) {
      // console.warn('[MFNProcessor] Not initialized or empty graph, passing through audio.');
      // Passthrough audio if not initialized
      const mainInput = inputs[0];
      const mainOutput = outputs[0];
      if (mainInput && mainOutput) {
        for (let channel = 0; channel < Math.min(mainInput.length, mainOutput.length); ++channel) {
          if (mainInput[channel] && mainOutput[channel]) {
            mainOutput[channel].set(mainInput[channel]);
          }
        }
      }
      return true;
    }

    const blockSize = inputs[0]?.[0]?.length ?? 128; // Get blockSize from actual input

    // 1. Initialize or clear node output buffers for this block
    this.graph.nodes.forEach(node => {
      let buffers = this.nodeOutputBuffers.get(node.id);
      if (!buffers || buffers.length !== this.graph.outputChannels || buffers[0]?.length !== blockSize) {
        buffers = Array.from({ length: this.graph.outputChannels }, () => new Float32Array(blockSize));
      } else {
        buffers.forEach(buffer => buffer.fill(0));
      }
      this.nodeOutputBuffers.set(node.id, buffers);
    });

    // 2. Process 'input_mixer' nodes first (system inputs)
    // These effectively take data from `inputs` and place it into their `nodeOutputBuffers`
    this.graph.nodes.filter(node => node.type === 'input_mixer').forEach(inputNode => {
      const inputNodeOutput = this.nodeOutputBuffers.get(inputNode.id);
      const mainProcessorInput = inputs[0]; // Assuming first input array is the main one
      if (inputNodeOutput && mainProcessorInput) {
        for (let i = 0; i < Math.min(inputNodeOutput.length, mainProcessorInput.length); i++) {
          if (mainProcessorInput[i]) { // Check if the specific channel input exists
            inputNodeOutput[i].set(mainProcessorInput[i]);
          }
        }
      }
    });


    // 3. Iteratively process other nodes or use a topological sort if complex dependencies arise.
    // For now, a simple iteration might work if feedback is handled with one block delay.
    // TODO: Implement topological sort or a more robust processing order if needed.
    this.graph.nodes
      .filter(node => node.type !== 'input_mixer' && node.type !== 'output_mixer') // Process actual DSP nodes
      .forEach(node => {
        const kernel = dspKernels[node.type];
        const nodeInputBuffers: Float32Array[] = Array.from({ length: this.graph.outputChannels }, () => new Float32Array(blockSize));
        const nodeOutput = this.nodeOutputBuffers.get(node.id);
        const nodeState = this.nodeStates.get(node.id) || {}; // Get or initialize node state

        // Sum inputs for this node based on the routing matrix
        for (let c = 0; c < this.graph.outputChannels; c++) {
          const sourceNodesData = getSourceNodes(this.graph, node.id, c);
          sourceNodesData.forEach(sourceData => {
            const sourceOutputBuffer = this.nodeOutputBuffers.get(sourceData.sourceNodeId);
            if (sourceOutputBuffer && sourceOutputBuffer[c]) {
              for (let i = 0; i < blockSize; i++) {
                nodeInputBuffers[c][i] += sourceOutputBuffer[c][i] * sourceData.gain;
              }
            }
          });
        }

        if (kernel && nodeOutput) {
          try {
            kernel(nodeInputBuffers, nodeOutput, node, blockSize, sampleRate, this.graph.outputChannels, nodeState);
            this.nodeStates.set(node.id, nodeState); // Persist any state changes from the kernel
          } catch (e) {
            console.error(`[MFNProcessor] Error processing node ${node.id} (${node.type}):`, e);
            // Optional: Post error to main thread
            this.port.postMessage({
              type: WorkletMsgTypeEnum.NODE_ERROR,
              payload: { nodeId: node.id, error: (e as Error).message }
            });
            // Silence output of this node in case of error
            nodeOutput.forEach(ch => ch.fill(0));
          }
        } else if (!kernel) {
          // console.warn(`[MFNProcessor] No kernel for node type: ${node.type}. Passing through for this node.`);
          // If no kernel, pass through inputs to this node's output buffer (or silence if no input)
          if (nodeOutput) {
            for(let c=0; c < this.graph.outputChannels; c++) {
              if(nodeInputBuffers[c]) {
                nodeOutput[c].set(nodeInputBuffers[c]);
              } else {
                nodeOutput[c].fill(0);
              }
            }
          }
        }
      });

    // 4. Process 'output_mixer' nodes (system outputs)
    // These sum the outputs of nodes routed to them into `outputs`
    const mainProcessorOutput = outputs[0]; // Assuming first output array is the main one
    if (mainProcessorOutput) {
      mainProcessorOutput.forEach(channelBuffer => channelBuffer.fill(0)); // Clear main output buffer

      this.graph.nodes.filter(node => node.type === 'output_mixer').forEach(outputNode => {
        // For each channel of the output mixer
        for (let c = 0; c < this.graph.outputChannels; c++) {
          if (mainProcessorOutput[c]) {
            const sourceNodesData = getSourceNodes(this.graph, outputNode.id, c);
            sourceNodesData.forEach(sourceData => {
              const sourceOutputBuffer = this.nodeOutputBuffers.get(sourceData.sourceNodeId);
              if (sourceOutputBuffer && sourceOutputBuffer[c]) {
                for (let i = 0; i < blockSize; i++) {
                  mainProcessorOutput[c][i] += sourceOutputBuffer[c][i] * sourceData.gain;
                  // Apply masterGain at the very end
                  mainProcessorOutput[c][i] *= this.graph.masterGain;
                }
              }
            });
          }
        }
      });
    }
    return true;
  }
}

registerProcessor('mfn-processor', MFNProcessor);
