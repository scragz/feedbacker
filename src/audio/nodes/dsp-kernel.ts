import type { ParameterValue } from '../schema'; // Import ParameterValue

// NodeState can be defined here
export type NodeState = Record<string, unknown>; // Using 'unknown' for better type safety than 'any'

/**
 * Interface for a DSP kernel processing function.
 *
 * @param inputs - The input audio buffers for the node (Float32Array[channelIndex][sampleIndex]).
 *                 These are the already mixed inputs for the current node. Each Float32Array is a channel.
 * @param outputs - The output audio buffers for the node (Float32Array[channelIndex][sampleIndex]).
 *                  The kernel function should write its processed audio data here. Each Float32Array is a channel.
 * @param parameters - The parameters for the current audio node instance.
 * @param nodeState - An object to manage state for individual audio nodes within the processor.
 * @param sampleRate - The current sample rate.
 * @param blockSize - The number of samples in the current processing block (i.e., length of each channel array).
 * @param numChannels - The number of channels being processed for this node (i.e., length of inputs/outputs arrays).
 */
export type DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  parameters: Record<string, ParameterValue | undefined>,
  nodeState: NodeState,
  sampleRate: number,
  blockSize: number,
  numChannels: number
) => void;

/**
 * Define a more specific type for node state if possible, or use a generic for now.
 * For example, if state always involves buffers or specific numeric values:
 * export type NodeState = Record<string, Float32Array | number | boolean | object>;
 * Using a simpler approach for now, can be refined later.
 */
// The NodeState type is now defined above. This comment block can be removed or updated.
