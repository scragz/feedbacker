import type { DSPKernel, NodeState as BaseNodeState } from './dsp-kernel';
import type { ParameterValue, OscillatorWaveformType } from '../schema';

// Basic state for an oscillator
interface OscillatorState {
  phase: number;
}

export const oscillatorKernel: DSPKernel = (
  _inputs: Float32Array[], // Prefixed with underscore as it's not used
  outputs: Float32Array[],
  parameters: Record<string, ParameterValue | undefined>,
  nodeState: BaseNodeState,
  sampleRate: number,
  blockSize: number,
  numChannels: number
): void => {
  nodeState.oscillator ??= { phase: 0 } as OscillatorState;
  const state = nodeState.oscillator as OscillatorState;

  // Provide defaults if parameters are undefined or not the expected type
  const frequency = (parameters.frequency as number) ?? 440;
  const type = (parameters.type as OscillatorWaveformType) ?? 'sine';
  const gain = (parameters.gain as number) ?? 0.7;

  // Basic check for output buffer validity
  if (!outputs || outputs.length < numChannels || !outputs[0] || outputs[0].length !== blockSize) {
    // console.error('[oscillatorKernel] Output buffer structure invalid, insufficient channels, or blockSize mismatch.');
    // Fill outputs with silence to prevent errors down the chain if structure is unexpected
    for (let ch = 0; ch < (outputs?.length ?? 0); ch++) {
      if (outputs[ch] && outputs[ch].length === blockSize) {
        outputs[ch].fill(0);
      }
    }
    return;
  }

  const phaseIncrement = frequency / sampleRate;

  for (let i = 0; i < blockSize; i++) {
    let value = 0;
    switch (type) {
      case 'sine':
        value = Math.sin(2 * Math.PI * state.phase);
        break;
      case 'square':
        value = Math.sign(Math.sin(2 * Math.PI * state.phase));
        break;
      case 'sawtooth':
        value = 2 * (state.phase - Math.floor(state.phase + 0.5));
        break;
      case 'triangle':
        value = 2 * Math.abs(2 * (state.phase - Math.floor(state.phase + 0.5))) - 1;
        break;
      default: {
        // Exhaustive check for OscillatorWaveformType
        const _exhaustiveCheck: never = type;
        // console.warn(`[oscillatorKernel] Unhandled oscillator type: ${type}`);
        value = 0;
        // To satisfy the linter about _exhaustiveCheck being unused, you could log it:
        // console.log(`Unhandled type: ${_exhaustiveCheck}`);
        break;
      }
    }

    value *= gain;
    state.phase = (state.phase + phaseIncrement) % 1.0;

    for (let ch = 0; ch < numChannels; ch++) {
      // Ensure the channel exists in the output array before writing
      if (outputs[ch]) {
        outputs[ch][i] = value;
      } else {
        // This should not happen if mfn-processor allocates outputs correctly based on numChannels
        // console.warn(`[oscillatorKernel] Output channel ${ch} is undefined, expected ${numChannels} channels.`);
      }
    }
  }
};
