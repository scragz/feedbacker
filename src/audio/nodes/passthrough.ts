import type { AudioNodeInstance } from '../schema';
import type { DSPKernel, NodeState } from './dsp-kernel';

export const passthroughKernel: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  _node: AudioNodeInstance, // Changed type from any to AudioNodeInstance
  _blockSize: number,
  _sampleRate: number,
  numChannels: number,
  _nodeState: NodeState, // Added _nodeState to match DSPKernel type
) => {
  for (let chan = 0; chan < numChannels; chan++) {
    const inputChannel = inputs[chan];
    const outputChannel = outputs[chan];
    // The loop `chan < numChannels` and the structure of inputs/outputs (Float32Array[])
    // should guarantee that inputChannel and outputChannel are valid Float32Array instances
    // if numChannels is correctly derived from inputs[0].length or outputs[0].length.
    outputChannel.set(inputChannel);
  }
};
