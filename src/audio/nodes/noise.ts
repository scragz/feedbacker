import type { AudioNodeInstance } from '../schema';
import type { DSPKernel, NodeState } from './dsp-kernel';

/**
 * NoiseKernel: Generates white noise.
 * Conforms to the DSPKernel functional type.
 */
export const noiseKernel: DSPKernel = (
  _inputs: Float32Array[], // Noise ignores inputs
  outputs: Float32Array[], // output port 0: [channelIndex][sampleIndex]
  node: AudioNodeInstance,
  _blockSize: number, // Block size is implicitly outputs[0][0]?.length
  _sampleRate: number,
  _numChannels: number, // numChannels is implicitly outputs[0]?.length
  _nodeState: NodeState, // Noise is stateless for now
): void => {
  // Use the channelCount from the node instance if available, otherwise default to the number of output buffers provided.
  const nodeEffectiveChannelCount = node.channelCount ?? outputs.length;
  const samplesPerChannel = outputs[0]?.length ?? 0;

  // console.log(`[noiseKernel ${node.id}] Processing. Node Channels: ${nodeEffectiveChannelCount}, Output Channels: ${outputs.length}, Samples: ${samplesPerChannel}`);

  if (samplesPerChannel === 0) {
    // console.warn(`[noiseKernel ${node.id}] No samples to process.`);
    return;
  }

  // Fill the output buffers with white noise
  // Respect the lesser of the node's intended channel count and the available output buffers
  for (let channel = 0; channel < nodeEffectiveChannelCount && channel < outputs.length; channel++) {
    const outputBuffer = outputs[channel];
    for (let i = 0; i < samplesPerChannel; i++) {
      outputBuffer[i] = Math.random() * 2 - 1; // White noise between -1 and 1
    }
  }

  // If the node is intended to have fewer channels than available output buffers,
  // zero out the remaining output buffers to prevent stale data.
  for (let channel = nodeEffectiveChannelCount; channel < outputs.length; channel++) {
    const outputBuffer = outputs[channel];
    outputBuffer.fill(0);
  }
};

// Helper or specific functions related to noise, if any, can go here.
// For example, a function to initialize state if noise were stateful.
// export function createNoiseState(nodeId: string, sampleRate: number, channelCount: number): Record<string, any> {
//   return { id: nodeId, sampleRate, channelCount, /* other state properties */ };
// }
