import type { ParameterValue } from '../schema';
import type { DSPKernel, NodeState } from './dsp-kernel';

export const passthroughKernel: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  _parameters: Record<string, ParameterValue | undefined>, // Corrected: 3rd param is parameters
  _nodeState: NodeState, // Corrected: 4th param is nodeState
  _sampleRate: number, // Corrected: 5th param is sampleRate
  _blockSize: number, // Corrected: 6th param is blockSize
  numChannels: number, // Corrected: 7th param is numChannels
) => {
  for (let chan = 0; chan < numChannels; chan++) {
    const inputChannel = inputs[chan];
    const outputChannel = outputs[chan];

    // Assuming inputs and outputs will always have valid Float32Array instances
    // for each channel up to numChannels, as per Web Audio API guarantees
    // and the way these buffers are prepared in MfnProcessor.
    // If inputChannel or outputChannel could be legitimately undefined for a valid chan < numChannels,
    // the MfnProcessor logic or buffer allocation would need review.
    outputChannel.set(inputChannel);
  }
};
