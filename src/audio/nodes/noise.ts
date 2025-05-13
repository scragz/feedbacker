import { type DSPKernel, type NodeState } from './dsp-kernel';
import type { AudioNodeInstance as SchemaAudioNodeInstance, ParameterValue } from '../schema'; // Removed NodeId, added ParameterValue

export interface NoiseNodeParams {
  type: 'white' | 'pink' | 'brownian';
  gain: number;
}

export interface NoiseNodeInternalState { // Renamed for clarity
  lastPinkValues?: number[];
}

// Helper to safely get typed parameters
function getTypedParams(parameters: Record<string, ParameterValue | undefined>): NoiseNodeParams {
  const typeParam = parameters.type;
  const gainParam = parameters.gain;

  // Check if typeParam is a valid NoiseNodeParams['type']
  const isValidType = typeof typeParam === 'string' && ['white', 'pink', 'brownian'].includes(typeParam);

  return {
    type: isValidType ? (typeParam as NoiseNodeParams['type']) : 'white',
    gain: typeof gainParam === 'number' ? gainParam : 0.5,
  };
}

/**
 * Noise generation kernel.
 */
export const noiseKernel: DSPKernel = (
  _inputs: Float32Array[], // Noise source has no audio inputs from other nodes in the graph
  outputs: Float32Array[], // Output port 0: [channelIndex][sampleIndex]
  node: SchemaAudioNodeInstance, // Full node instance, includes parameters
  _blockSize: number, // frameLength is derived from outputs[0].length
  _sampleRate: number, // sampleRate might be needed for some noise algorithms
  numChannels: number, // Number of channels for this node\'s output
  _nodeState: NodeState // Generic state, can cast to NoiseNodeInternalState if needed
): void => {
  // Use the helper for safer parameter access
  const { type, gain } = getTypedParams(node.parameters);

  if (numChannels === 0 || outputs.length === 0) return;

  const frameLength = outputs[0]?.length ?? 0;
  if (frameLength === 0) return;

  // The DSPKernel type expects outputs as Float32Array[], where each element is a channel.
  // The mfn-processor provides nodeOutputBuffers as Map<string, Float32Array[]>
  // where the Float32Array[] is [channel][sample]. This matches.

  if (type === 'white') {
    for (let ch = 0; ch < numChannels; ch++) {
      const outputBuffer = outputs[ch];
      // Removed redundant check for outputBuffer, as the loop structure implies its existence.
      for (let i = 0; i < frameLength; i++) {
        outputBuffer[i] = (Math.random() * 2 - 1) * gain;
      }
    }
  } else {
    for (let ch = 0; ch < numChannels; ch++) {
      const outputBuffer = outputs[ch];
      // Removed redundant check for outputBuffer.
      outputBuffer.fill(0);
    }
    // console.warn(`[noiseKernel] Noise type \'${type}\' not yet implemented. Outputting silence.`);
  }
};

export default noiseKernel;
