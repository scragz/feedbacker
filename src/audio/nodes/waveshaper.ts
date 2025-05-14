import type { DSPKernel, NodeState } from './dsp-kernel';
import type { ParameterValue } from '../schema';

interface WaveshaperState extends NodeState {
  curve?: Float32Array;
  oversample: boolean;
}

// Distortion curve types/algorithms
export type WaveshaperCurveType = 'soft' | 'hard' | 'sin' | 'tanh' | 'atan' | 'clip' | 'fold';

// Generate a distortion curve based on the type and amount
function generateCurve(
  type: WaveshaperCurveType,
  amount: number,
  sampleRate: number,
  samples = 8192
): Float32Array {
  const curve = new Float32Array(samples);
  const k = amount; // amount is our distortion parameter

  for (let i = 0; i < samples; i++) {
    // Convert to range -1 to 1
    const x = (i * 2) / samples - 1;
    let y = 0;

    switch (type) {
      case 'soft':
        // Soft clipping
        y = x * (3 - x * x) / 2 * k;
        break;
      case 'hard':
        // Hard clipping
        y = Math.max(-0.7, Math.min(0.7, x * k));
        break;
      case 'sin':
        // Sine waveshaping
        y = Math.sin(x * Math.PI * k);
        break;
      case 'tanh':
        // Hyperbolic tangent (nice smooth distortion)
        y = Math.tanh(x * k);
        break;
      case 'atan':
        // Arctangent (warm distortion)
        y = Math.atan(x * k) / Math.PI;
        break;
      case 'clip':
        // Digital clipping
        y = x < 0 ? -1 : 1;
        if (Math.abs(x) < 1 / k) {
          y = x * k;
        }
        break;
      case 'fold':
        // Wavefolding (intense distortion)
        y = Math.sin(x * k * Math.PI);
        break;
      default:
        // Default to no distortion
        y = x;
    }

    curve[i] = y;
  }

  return curve;
}

export const waveshaperKernel: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  parameters: Record<string, ParameterValue | undefined>,
  nodeState: NodeState,
  sampleRate: number,
  blockSize: number,
  numChannels: number
): void => {
  // Initialize state if not exists
  nodeState.waveshaper ??= { oversample: false } as WaveshaperState;
  const state = nodeState.waveshaper as WaveshaperState;

  // Get parameters
  const amount = (parameters.amount as number) ?? 1.0;
  const drive = (parameters.drive as number) ?? 1.0;
  const mix = (parameters.mix as number) ?? 1.0;
  const curveType = (parameters.curveType as WaveshaperCurveType) ?? 'soft';
  const oversample = (parameters.oversample as boolean) ?? false;

  // Generate curve if needed or if parameters changed
  const curveNeeded = !state.curve ||
    state.curveType !== curveType ||
    state.amount !== amount ||
    state.oversample !== oversample;

  if (curveNeeded) {
    state.curve = generateCurve(curveType, amount, sampleRate);
    state.curveType = curveType;
    state.amount = amount;
    state.oversample = oversample;
  }

  // Validate buffers
  if (!inputs || inputs.length < numChannels || !outputs || outputs.length < numChannels) {
    console.error('[waveshaperKernel] Invalid buffer configuration');
    return;
  }

  // Apply waveshaping to each sample
  for (let ch = 0; ch < Math.min(numChannels, inputs.length, outputs.length); ch++) {
    const input = inputs[ch];
    const output = outputs[ch];

    if (!input || !output || input.length !== blockSize || output.length !== blockSize) {
      console.error(`[waveshaperKernel] Channel ${ch}: Invalid buffer length`);
      continue;
    }

    const curve = state.curve;
    if (!curve) {
      // If curve generation failed, just pass through the input
      for (let i = 0; i < blockSize; i++) {
        output[i] = input[i];
      }
      continue;
    }

    const curveLength = curve.length;
    for (let i = 0; i < blockSize; i++) {
      // Apply drive to input signal
      const inputSample = input[i] * drive;

      // Map input to curve (range -1 to 1)
      const index = ((inputSample + 1) * 0.5 * (curveLength - 1)) | 0;
      const clampedIndex = Math.max(0, Math.min(curveLength - 1, index));

      // Get distorted output from curve and scale back
      const distortedSample = curve[clampedIndex];

      // Mix dry/wet signal
      output[i] = inputSample * (1 - mix) + distortedSample * mix;
    }
  }
};
