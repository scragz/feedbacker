import type { AudioNodeInstance } from '../schema';
import type { DSPKernel } from './dsp-kernel';

export const processGain: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  node: AudioNodeInstance,
  blockSize: number,
  _sampleRate: number, // Not used by gain
  numChannels: number,
) => {
  const paramGain = node.parameters.gain;
  const gainValue = typeof paramGain === 'number' ? paramGain : 1.0;

  for (let chan = 0; chan < numChannels; chan++) {
    const inputChannel = inputs[chan];
    const outputChannel = outputs[chan];
    if (inputChannel && outputChannel) {
      for (let sample = 0; sample < blockSize; sample++) {
        outputChannel[sample] = inputChannel[sample] * gainValue;
      }
    }
  }
};
