/**
 * mfn-processor.ts
 * AudioWorkletProcessor for the Multichannel Feedback Network.
 */

// Restore and refine AudioWorklet global types
declare global {
   
  var sampleRate: number;
   
  var currentTime: number;
   
  var currentFrame: number;

  interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean;
  }

  // Use type for AudioWorkletNodeOptions to avoid empty interface lint error
  type AudioWorkletNodeOptions = Record<string, any>;

  // Constructor for AudioWorkletProcessor
  const AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
  };

  function registerProcessor(
    name: string,
    processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
  ): void;
}

import type {
  AudioGraph,
  MainThreadMessage,
  NodeType,
  AudioNodeInstance as SchemaAudioNodeInstance,
} from './schema';
import {
  MainThreadMessageType,
  WorkletMessageType as WorkletMsgTypeEnum,
} from './schema';
import {
  processGain,
  processDelay,
  processBiquad,
  processPassthrough,
  type DSPKernel,
} from './nodes';
import type { NodeState } from './nodes/dsp-kernel';

// Alias for clarity within this file, ensuring it matches the imported structure.
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

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.port.onmessage = this.handleMessage.bind(this);
    this.port.postMessage({ type: WorkletMsgTypeEnum.PROCESSOR_READY });
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const { type, payload } = event.data;

    switch (type) {
      case MainThreadMessageType.INIT_PROCESSOR: {
        this.graph = payload.graph;
        this.maxChannels = payload.maxChannels;
        this.nodeStates.clear();
        this.graph.nodes.forEach((node) => {
          this.nodeStates.set(node.id, {});
        });
        this.initialized = true;
        console.log(
          `[MFNProcessor] Initialized. SR: ${sampleRate}, MaxCh: ${this.maxChannels}, GraphCh: ${this.graph.outputChannels}`
        );
        break;
      }
      case MainThreadMessageType.UPDATE_GRAPH: {
        this.graph = payload.graph;
        const newNodeIds = new Set(this.graph.nodes.map((n) => n.id));
        for (const nodeId of this.nodeStates.keys()) {
          if (!newNodeIds.has(nodeId)) {
            this.nodeStates.delete(nodeId);
            this.nodeOutputBuffers.delete(nodeId);
          }
        }
        this.graph.nodes.forEach((node) => {
          if (!this.nodeStates.has(node.id)) {
            this.nodeStates.set(node.id, {});
          }
        });
        console.log('[MFNProcessor] Graph updated.');
        break;
      }
      case MainThreadMessageType.UPDATE_PARAMETER: {
        const node = this.graph.nodes.find((n) => n.id === payload.nodeId);
        if (node) {
          node.parameters ??= {}; // Use nullish coalescing assignment
          node.parameters[payload.parameterId] = payload.value;
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
        });
        break;
      }
      case MainThreadMessageType.SET_OUTPUT_CHANNELS: {
        console.log(`[MFNProcessor] Info: Main context output channels: ${payload.outputChannels}. Graph output channels: ${this.graph.outputChannels}`);
        if (this.graph.outputChannels !== payload.outputChannels) {
            console.warn('[MFNProcessor] Discrepancy in output channels. Graph update might be needed for changes to take effect in processing loop.');
        }
        break;
      }
      default:
        console.warn('[MFNProcessor] Unknown message type:', type);
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    if (!this.initialized || this.graph.nodes.length === 0) {
      const mainInputChannels = inputs[0];
      const mainOutputChannels = outputs[0];

      if (mainOutputChannels) {
        const numInputActualChannels = mainInputChannels?.length ?? 0;
        const numOutputActualChannels = mainOutputChannels.length;
        const numChannelsToProcess = Math.min(numInputActualChannels, numOutputActualChannels);

        for (let i = 0; i < numChannelsToProcess; i++) {
          const inputChannel = mainInputChannels?.[i];
          const outputChannel = mainOutputChannels[i];
          if (inputChannel && outputChannel) {
            outputChannel.set(inputChannel);
          } else if (outputChannel) {
            outputChannel.fill(0);
          }
        }
        for (let i = numChannelsToProcess; i < numOutputActualChannels; i++) {
          const outputChannel = mainOutputChannels[i];
          if (outputChannel) {
            outputChannel.fill(0);
          }
        }
      }
      return true;
    }

    const blockSize = outputs[0]?.[0]?.length ?? 128;
    const currentSampleRate = sampleRate; // Use global sampleRate from declare global

    this.graph.nodes.forEach((node) => {
      let buffers = this.nodeOutputBuffers.get(node.id);
      if (
        !buffers ||
        buffers.length !== this.graph.outputChannels ||
        (buffers[0] && buffers[0].length !== blockSize)
      ) {
        buffers = Array.from(
          { length: this.graph.outputChannels },
          () => new Float32Array(blockSize)
        );
      } else {
        buffers.forEach((buffer) => buffer.fill(0));
      }
      this.nodeOutputBuffers.set(node.id, buffers);
    });

    const mainProcessorInputChannels = inputs[0];
    if (mainProcessorInputChannels) {
        this.graph.nodes
        .filter((node) => node.type === 'input_mixer')
        .forEach((inputNode) => {
            const inputNodeOutput = this.nodeOutputBuffers.get(inputNode.id);
            if (inputNodeOutput) {
              const numChannelsToCopy = Math.min(inputNodeOutput.length, mainProcessorInputChannels.length, this.graph.outputChannels);
              for (let i = 0; i < numChannelsToCopy; i++) {
                  if (mainProcessorInputChannels[i]) {
                    inputNodeOutput[i].set(mainProcessorInputChannels[i]);
                  }
              }
            }
        });
    }

    this.graph.nodes
      .filter((node) => node.type !== 'input_mixer' && node.type !== 'output_mixer')
      .forEach((node) => {
        const kernel = dspKernels[node.type];
        const nodeInputBuffers: Float32Array[] = Array.from(
          { length: this.graph.outputChannels },
          () => new Float32Array(blockSize)
        );
        const nodeOutput = this.nodeOutputBuffers.get(node.id);
        const nodeState = this.nodeStates.get(node.id) ?? {};

        for (let c = 0; c < this.graph.outputChannels; c++) {
          const sourceNodesData = getSourceNodeDataForDestination(
            this.graph,
            this.graph.nodes,
            node.id,
            c
          );
          sourceNodesData.forEach((sourceData) => {
            const sourceOutputBuffer = this.nodeOutputBuffers.get(sourceData.sourceNodeId);
            if (sourceOutputBuffer?.[c]) {
              for (let i = 0; i < blockSize; i++) {
                nodeInputBuffers[c][i] += sourceOutputBuffer[c][i] * sourceData.gain;
              }
            }
          });
        }

        if (kernel && nodeOutput) {
          try {
            kernel(
              nodeInputBuffers,
              nodeOutput,
              node,
              blockSize,
              currentSampleRate,
              this.graph.outputChannels,
              nodeState
            );
            this.nodeStates.set(node.id, nodeState);
          } catch (e) {
            console.error(`[MFNProcessor] Error in node ${node.id} (${node.type}):`, e);
            this.port.postMessage({
              type: WorkletMsgTypeEnum.NODE_ERROR,
              payload: { nodeId: node.id, error: (e as Error).message },
            });
            nodeOutput.forEach((ch) => ch.fill(0));
          }
        } else if (!kernel && nodeOutput) {
          for (let c = 0; c < this.graph.outputChannels; c++) {
            if (nodeInputBuffers[c] && nodeOutput[c]) {
              nodeOutput[c].set(nodeInputBuffers[c]);
            } else if (nodeOutput[c]) {
              nodeOutput[c].fill(0);
            }
          }
        }
      });

    const mainProcessorOutputChannels = outputs[0];
    if (mainProcessorOutputChannels) {
        mainProcessorOutputChannels.forEach((channelBuffer) => channelBuffer.fill(0));

        this.graph.nodes
        .filter((node) => node.type === 'output_mixer')
        .forEach((outputNode) => {
            for (let c = 0; c < Math.min(this.graph.outputChannels, mainProcessorOutputChannels.length); c++) {
            if (mainProcessorOutputChannels[c]) {
                const sourceNodesData = getSourceNodeDataForDestination(
                this.graph,
                this.graph.nodes,
                outputNode.id,
                c
                );
                sourceNodesData.forEach((sourceData) => {
                const sourceOutputBuffer = this.nodeOutputBuffers.get(sourceData.sourceNodeId);
                if (sourceOutputBuffer?.[c]) {
                    for (let i = 0; i < blockSize; i++) {
                    mainProcessorOutputChannels[c][i] += sourceOutputBuffer[c][i] * sourceData.gain;
                    }
                }
                });
                for (let i = 0; i < blockSize; i++) {
                    mainProcessorOutputChannels[c][i] *= this.graph.masterGain;
                }
            }
            }
        });
        for (let c = this.graph.outputChannels; c < mainProcessorOutputChannels.length; c++) {
            if (mainProcessorOutputChannels[c]) {
                mainProcessorOutputChannels[c].fill(0);
            }
        }
    }
    return true;
  }
}

registerProcessor('mfn-processor', MFNProcessor);
export {};
