import type { DSPKernel } from './dsp-kernel';

export const processPassthrough: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  _node: any, // Node parameters not used by passthrough
  _blockSize: number, // Not used
  _sampleRate: number, // Not used
  numChannels: number,
) => {
  for (let chan = 0; chan < numChannels; chan++) {
    const inputChannel = inputs[chan];
    const outputChannel = outputs[chan];
    if (inputChannel && outputChannel) {
      // For passthrough, simply copy the input to the output.
      // This also handles cases where inputChannel might be shorter than outputChannel
      // (though typically they should match in blockSize).
      outputChannel.set(inputChannel);
    }
  }
};
