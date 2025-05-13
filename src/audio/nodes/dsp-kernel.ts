import type { AudioNodeInstance } from '../schema';

/**
 * Interface for a DSP kernel processing function.
 *
 * @param inputs - The input audio buffers for the node (Float32Array[channelIndex][sampleIndex]).
 *                 These are the already mixed inputs for the current node.
 * @param outputs - The output audio buffers for the node (Float32Array[channelIndex][sampleIndex]).
 *                  The kernel function should write its processed audio data here.
 * @param node - The AudioNodeInstance providing parameters and type.
 * @param blockSize - The number of samples in the current processing block.
 * @param sampleRate - The current sample rate.
 * @param numChannels - The number of channels being processed.
 * @param nodeState - An object to manage state for individual audio nodes within the processor.
 */
export type DSPKernel = (
  inputs: Float32Array[], // input port 0: [channelIndex][sampleIndex]
  outputs: Float32Array[], // output port 0: [channelIndex][sampleIndex]
  node: AudioNodeInstance,
  blockSize: number,
  sampleRate: number,
  numChannels: number,
  nodeState: Record<string, any>, // Added to manage state for nodes like delay, biquad
) => void;

/**
 * Define a more specific type for node state if possible, or use a generic for now.
 * For example, if state always involves buffers or specific numeric values:
 * export type NodeState = Record<string, Float32Array | number | boolean | object>;
 * Using a simpler approach for now, can be refined later.
 */
export type NodeState = Record<string, unknown>;
