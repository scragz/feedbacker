/**
 * mfn-processor.ts
 * AudioWorkletProcessor for the Multichannel Feedback Network.
 */

// Ensures TypeScript recognizes AudioWorklet-specific globals and types.
// These declarations help if tsconfig.json's "lib" option doesn't fully cover the AudioWorklet environment.
declare global {
  // 'self' in an AudioWorklet is an AudioWorkletGlobalScope.
  // This block augments that scope.
  interface AudioWorkletGlobalScope {
    currentTime: number;
    currentFrame: number;
    sampleRate: number;
    AudioWorkletProcessor: typeof AudioWorkletProcessor;
    registerProcessor: typeof registerProcessor;
  }

  function registerProcessor(
    name: string,
    processorCtor: (new (
      options?: AudioWorkletNodeOptions,
    ) => AudioWorkletProcessor) & {
      parameterDescriptors?: AudioParamDescriptor[];
    },
  ): void;

  class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor(options?: AudioWorkletNodeOptions);
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  }

  interface AudioParamDescriptor {
    name: string;
    automationRate?: 'a-rate' | 'k-rate';
    minValue?: number;
    maxValue?: number;
    defaultValue?: number;
  }
}

import {
  MainThreadMessageType,
  WorkletMessageType,
} from './schema';
import type {
  AudioGraph,
  MainThreadMessage,
  RoutingMatrix,
  AudioNodeInstance, // Used in AudioGraph.nodes
  // Specific message types are used for type narrowing in handleMessage switch cases
  InitProcessorMessage,
  UpdateGraphMessage,
  UpdateParameterMessage,
  SetOutputChannelsMessage,
} from './schema';
import { createEmptyRoutingMatrix, isValidRoutingMatrix } from './matrix';

const MAX_CHANNELS_DEFAULT = 32;
const RMS_GUARD_THRESHOLD_DEFAULT = 0.9;
const RMS_GUARD_ATTENUATION_DEFAULT = 0.5;
const SMOOTHING_FACTOR_DEFAULT = 0.1;

interface MFNProcessorOptions {
  maxChannels?: number;
  graph?: AudioGraph;
}

interface MFNNodeOptions extends AudioWorkletNodeOptions {
  processorOptions?: MFNProcessorOptions;
}

class MFNProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph | null = null;
  private routingMatrix: RoutingMatrix = [];
  private internalSampleRate: number;
  private numChannels = 2;
  private maxChannelsConfig: number = MAX_CHANNELS_DEFAULT;

  private feedbackBuffers: Float32Array[] = [];
  private nodeOutputBuffers: Float32Array[][] = [];

  private rmsLevelsInternal: number[] = [];
  private rmsGuardActiveInternal: boolean[] = [];

  private currentMasterGainInternal = 1.0;
  private targetMasterGainInternal = 1.0;

  constructor(options?: MFNNodeOptions) {
    super(options);
    this.internalSampleRate = (self as AudioWorkletGlobalScope).sampleRate; // 'self' is AudioWorkletGlobalScope here

    const processorOpts = options?.processorOptions;
    if (processorOpts) {
      this.maxChannelsConfig = processorOpts.maxChannels ?? MAX_CHANNELS_DEFAULT;
      if (processorOpts.graph) {
        this.initializeGraph(
          processorOpts.graph,
          this.internalSampleRate,
          this.maxChannelsConfig,
        );
      }
    }
    this.port.onmessage = (event: MessageEvent<MainThreadMessage>) => {
      this.handleMessage(event);
    };
    console.log(`[MFNProcessor] Instance created. Sample rate: ${this.internalSampleRate}`);
  }

  private initializeGraph(graph: AudioGraph, sampleRate: number, maxChannels: number): void {
    console.log(`[MFNProcessor] Initializing graph: ${JSON.stringify(graph)}`);
    this.graph = graph;
    this.internalSampleRate = sampleRate;
    this.maxChannelsConfig = maxChannels;
    this.numChannels = graph.outputChannels; // Schema guarantees this is a number

    if (!isValidRoutingMatrix(graph.routingMatrix, graph.nodes.length, this.numChannels)) {
      console.warn('[MFNProcessor] Invalid routing matrix during init. Creating empty one.');
      this.routingMatrix = createEmptyRoutingMatrix(graph.nodes.length, this.numChannels);
    } else {
      this.routingMatrix = graph.routingMatrix;
    }

    this.targetMasterGainInternal = graph.masterGain; // Schema guarantees this is a number
    this.currentMasterGainInternal = this.targetMasterGainInternal;

    this.allocateBuffers();

    this.port.postMessage({ type: WorkletMessageType.PROCESSOR_READY });
    console.log(`[MFNProcessor] Initialized. Channels: ${this.numChannels}, Nodes: ${this.graph.nodes.length}, SR: ${this.internalSampleRate}`);
  }

  private allocateBuffers(): void {
    if (!this.graph) return;

    const numNodes = this.graph.nodes.length;
    const blockSize = 128; // Standard AudioWorklet block size

    this.feedbackBuffers = Array.from({ length: this.numChannels }, () => new Float32Array(blockSize));
    this.nodeOutputBuffers = Array.from({ length: this.numChannels }, () =>
      Array.from({ length: numNodes }, () => new Float32Array(blockSize)),
    );

    this.rmsLevelsInternal = Array.from({ length: this.numChannels }, () => 0);
    this.rmsGuardActiveInternal = Array.from({ length: this.numChannels }, () => false);

    console.log(`[MFNProcessor] Buffers allocated: ${this.numChannels}ch, ${numNodes}nodes, ${blockSize}block.`);
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const message = event.data;

    switch (message.type) {
      case MainThreadMessageType.INIT_PROCESSOR:
        // message is InitProcessorMessage
        this.initializeGraph((message as InitProcessorMessage).payload.graph, (message as InitProcessorMessage).payload.sampleRate, (message as InitProcessorMessage).payload.maxChannels);
        break;
      case MainThreadMessageType.UPDATE_GRAPH:
        // message is UpdateGraphMessage
        this.graph = (message as UpdateGraphMessage).payload.graph;
        // this.graph is now guaranteed to be AudioGraph by the type of message.payload.graph
        if (!isValidRoutingMatrix(this.graph.routingMatrix, this.graph.nodes.length, this.numChannels)) {
            console.warn('[MFNProcessor] Invalid routing matrix in UPDATE_GRAPH. Re-creating.');
            this.routingMatrix = createEmptyRoutingMatrix(this.graph.nodes.length, this.numChannels);
        } else {
            this.routingMatrix = this.graph.routingMatrix;
        }
        this.targetMasterGainInternal = this.graph.masterGain;
        this.allocateBuffers();
        console.log('[MFNProcessor] Graph updated.');
        break;
      case MainThreadMessageType.UPDATE_PARAMETER:
        // message is UpdateParameterMessage
        if (this.graph) { // this.graph could be null if not initialized yet
            const node = this.graph.nodes.find(n => n.id === (message as UpdateParameterMessage).payload.nodeId);
            if (node) {
                node.parameters[(message as UpdateParameterMessage).payload.parameterId] = (message as UpdateParameterMessage).payload.value;
            } else {
                console.warn(`[MFNProcessor] Node not found for param update: ${(message as UpdateParameterMessage).payload.nodeId}`);
            }
        }
        break;
      case MainThreadMessageType.SET_OUTPUT_CHANNELS:
        // message is SetOutputChannelsMessage
        if ((message as SetOutputChannelsMessage).payload.outputChannels > this.maxChannelsConfig) {
            console.error(`[MFNProcessor] Requested output channels (${(message as SetOutputChannelsMessage).payload.outputChannels}) exceeds max (${this.maxChannelsConfig}).`);
            this.port.postMessage({ type: WorkletMessageType.WORKLET_ERROR, payload: { message: 'Output channels exceed max' } });
            return;
        }
        if (this.numChannels !== (message as SetOutputChannelsMessage).payload.outputChannels) {
            this.numChannels = (message as SetOutputChannelsMessage).payload.outputChannels;
            if (this.graph) { // this.graph could be null
                this.graph.outputChannels = this.numChannels;
                if (!isValidRoutingMatrix(this.routingMatrix, this.graph.nodes.length, this.numChannels)) {
                    console.warn('[MFNProcessor] Routing matrix invalid after channel change. Re-creating.');
                    this.routingMatrix = createEmptyRoutingMatrix(this.graph.nodes.length, this.numChannels);
                }
            }
            this.allocateBuffers();
            console.log(`[MFNProcessor] Output channels set to ${this.numChannels}`);
        }
        break;
      default:
        // const _exhaustiveCheck: never = message;
        // console.warn(`[MFNProcessor] Unknown message type: ${(_exhaustiveCheck as MainThreadMessage).type}`);
        break;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    // Guard condition for main DSP logic
    if (
      !this.graph ||
      this.graph.nodes.length === 0 ||
      outputs.length === 0 ||
      !outputs[0] ||
      outputs[0].length === 0 ||
      !outputs[0][0]
    ) {
      // Passthrough or silence logic
      const mainInputPort = inputs[0];  // Float32Array[] | undefined
      const mainOutputPort = outputs[0]; // Float32Array[] | undefined

      // Only attempt to write if mainOutputPort is valid and has channels
      if (mainOutputPort && mainOutputPort.length > 0) {
        const numOutputChannels = mainOutputPort.length;
        // mainInputPort can be undefined if no input is connected.
        const numInputChannels = mainInputPort ? mainInputPort.length : 0;

        for (let c = 0; c < numOutputChannels; c++) {
          const outputChannelBuffer = mainOutputPort[c];
          // outputChannelBuffer is guaranteed by c < numOutputChannels

          // Check if mainInputPort exists and current channel c is within its bounds
          if (mainInputPort && c < numInputChannels) {
            const inputChannelBuffer = mainInputPort[c];
            // inputChannelBuffer is guaranteed by c < numInputChannels
            outputChannelBuffer.set(inputChannelBuffer);
          } else {
            outputChannelBuffer.fill(0); // Silence if no corresponding input
          }
        }
      }
      return true; // Keep processor alive
    }

    // Main DSP Logic (this.graph is guaranteed non-null here)
    const blockSize = outputs[0][0].length;
    const numNodes = this.graph.nodes.length;
    const mainInput = inputs[0]; // Float32Array[] | undefined

    this.currentMasterGainInternal += (this.targetMasterGainInternal - this.currentMasterGainInternal) * SMOOTHING_FACTOR_DEFAULT;

    for (let c = 0; c < this.numChannels; c++) {
      // Ensure we don't try to write to an output channel that doesn't exist on the physical output
      if (c >= outputs[0].length) continue;
      const outputChannel = outputs[0][c];
      // outputChannel is guaranteed by c < outputs[0].length

      // Clear node output buffers for the current channel
      // this.nodeOutputBuffers[c] and this.nodeOutputBuffers[c][n] are guaranteed by allocateBuffers
      for (let n = 0; n < numNodes; n++) {
        this.nodeOutputBuffers[c][n].fill(0);
      }

      const feedbackIn = this.feedbackBuffers[c];
      // feedbackIn is guaranteed by allocateBuffers

      // 1. Process each node
      for (let n = 0; n < numNodes; n++) {
        const nodeInstance = this.graph.nodes[n]; // this.graph is non-null
        const nodeOutput = this.nodeOutputBuffers[c][n];
        // nodeOutput is guaranteed by allocateBuffers

        for (let s = 0; s < blockSize; s++) {
          let sampleInput = feedbackIn[s];

          if (nodeInstance.type === 'input_mixer') {
            // mainInput can be undefined. If defined, mainInput[c] can be undefined.
            sampleInput = mainInput?.[c]?.[s] ?? 0;
          }

          let processedSample = sampleInput;
          if (nodeInstance.type === 'gain') {
            const gainValue = nodeInstance.parameters.gain ?? 1.0;
            processedSample = sampleInput * gainValue;
          } else {
            processedSample = sampleInput; // Passthrough for other types
          }
          nodeOutput[s] = processedSample;
        }
      }

      // 2. Mix node outputs for main output and next feedback block
      // this.feedbackBuffers[c] is guaranteed by allocateBuffers
      this.feedbackBuffers[c].fill(0);

      let sumOfSquares = 0;

      for (let s = 0; s < blockSize; s++) {
        let channelOutputSample = 0;

        for (let srcNodeIndex = 0; srcNodeIndex < numNodes; srcNodeIndex++) {
          const nodeInstance = this.graph.nodes[srcNodeIndex]; // this.graph is non-null
          // this.nodeOutputBuffers[c][srcNodeIndex] is guaranteed
          const srcNodeOutputSample = this.nodeOutputBuffers[c][srcNodeIndex][s];

          if (nodeInstance.type === 'output_mixer') {
            channelOutputSample += srcNodeOutputSample;
          }

          // this.feedbackBuffers[c] is guaranteed
          for (let destNodeIndex = 0; destNodeIndex < numNodes; destNodeIndex++) {
            // routingMatrix can be sparse or smaller than expected
            const weight = this.routingMatrix[c]?.[srcNodeIndex]?.[destNodeIndex] ?? 0;
            if (weight !== 0) {
              this.feedbackBuffers[c][s] += srcNodeOutputSample * weight;
            }
          }
        }

        channelOutputSample *= this.currentMasterGainInternal;
        sumOfSquares += channelOutputSample * channelOutputSample;
        outputChannel[s] = channelOutputSample;
      }

      const rms = Math.sqrt(sumOfSquares / blockSize);
      this.rmsLevelsInternal[c] = rms; // Types are number = number

      if (rms > RMS_GUARD_THRESHOLD_DEFAULT) {
        if (!this.rmsGuardActiveInternal[c]) { // Types are boolean
          console.warn(`[MFNProcessor] RMS Guard TRG CH${c}. RMS: ${rms.toFixed(3)}`);
          this.rmsGuardActiveInternal[c] = true;
        }
        for (let s = 0; s < blockSize; s++) {
          outputChannel[s] *= RMS_GUARD_ATTENUATION_DEFAULT;
        }
      } else {
        if (this.rmsGuardActiveInternal[c]) { // Types are boolean
          console.log(`[MFNProcessor] RMS Guard RLS CH${c}. RMS: ${rms.toFixed(3)}`);
          this.rmsGuardActiveInternal[c] = false;
        }
      }
    }
    return true;
  }
}

registerProcessor('mfn-processor', MFNProcessor);
