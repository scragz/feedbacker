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
  MainThreadMessage as ProcessorMessage,
} from './schema';
import { MainThreadMessageType } from './schema';
import { processMatrix } from './matrix'; // Added import

// No MFNProcessorInterface needed

class MFNProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph | null = null;
  private numChannels = 2;
  private internalSampleRate: number;
  private maxChannelsConfig = 32;

  private readonly nodeOutputs: Map<string, Float32Array[][]> = new Map<string, Float32Array[][]>();

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.internalSampleRate = sampleRate; // global sampleRate from AudioWorkletGlobalScope
    this.port.onmessage = (event: MessageEvent<ProcessorMessage>) => {
      this.onMessage(event.data);
    };
    this.initializeGraph(
      { nodes: [], routingMatrix: [], outputChannels: 2, masterGain: 1.0 },
      sampleRate, // global sampleRate
      this.maxChannelsConfig,
    );
    console.log('[MFNProcessor] Initialized');
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

  private onMessage(message: ProcessorMessage): void {
    switch (message.type) {
      case MainThreadMessageType.INIT_PROCESSOR: {
        const payload = message.payload; // No assertion needed if types align
        this.initializeGraph(payload.graph, payload.sampleRate, payload.maxChannels);
        break;
      }
      case MainThreadMessageType.UPDATE_GRAPH: {
        const payload = message.payload;
        this.initializeGraph(payload.graph, this.internalSampleRate, this.maxChannelsConfig);
        break;
      }
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
    }
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
      this.graph,
      this.numChannels,
      blockSize,
      destinationNodeInputs, // This map will be populated by processMatrix
    );

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

      // Apply DSP based on node type
      if (node.type === 'gain') {
        const paramGain = node.parameters.gain;
        const gainValue = typeof paramGain === 'number' ? paramGain : 1.0;
        for (let chan = 0; chan < this.numChannels; chan++) {
          if (calculatedNodeInputBuffers[chan] && nodeKernelOutputBuffers[chan]) {
            for (let sample = 0; sample < blockSize; sample++) {
              nodeKernelOutputBuffers[chan][sample] = calculatedNodeInputBuffers[chan][sample] * gainValue;
            }
          }
        }
      } else { // For other node types (e.g., delay, biquad, or passthrough for now)
        for (let chan = 0; chan < this.numChannels; chan++) {
          if (calculatedNodeInputBuffers[chan] && nodeKernelOutputBuffers[chan]) {
            nodeKernelOutputBuffers[chan].set(calculatedNodeInputBuffers[chan]);
          }
        }
      }
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
}

registerProcessor('mfn-processor', MFNProcessor);
