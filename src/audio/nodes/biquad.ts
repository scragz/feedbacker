import type { DSPKernel, NodeState } from './dsp-kernel';
import type { ParameterValue } from '../schema';

// Define Biquad filter types (matches Web Audio API, 'peaking' for 'peakingeq')
export type BiquadFilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'allpass'
  | 'peaking'
  | 'lowshelf'
  | 'highshelf';

const VALID_FILTER_TYPES: BiquadFilterType[] = [
  'lowpass', 'highpass', 'bandpass', 'notch', 'allpass',
  'peaking', 'lowshelf', 'highshelf',
];

interface BiquadChannelState {
  b0: number;
  b1: number;
  b2: number;
  a1: number; // a0 is normalized to 1
  a2: number;
  x1: number; // x[n-1]
  x2: number; // x[n-2]
  y1: number; // y[n-1]
  y2: number; // y[n-2]
}

export interface BiquadNodeState extends NodeState {
  channelStates?: BiquadChannelState[];
  // To track if parameters that affect coefficients have changed
  lastCalculatedType?: BiquadFilterType;
  lastCalculatedFrequency?: number;
  lastCalculatedQ?: number;
  lastCalculatedGain?: number;
  lastCalculatedSampleRate?: number;
  lastCalculatedNumChannels?: number;
}

/**
 * Calculates biquad filter coefficients.
 * Formulas based on Robert Bristow-Johnson's Audio EQ Cookbook.
 * Coefficients are normalized by a0.
 * Updates the b0, b1, b2, a1, a2 fields in the provided channelState object.
 */
function calculateCoefficients(
  type: BiquadFilterType,
  frequency: number,
  Q: number,
  gainDB: number, // gain in dB
  sampleRate: number,
  channelState: BiquadChannelState // to update b0,b1,b2,a1,a2
): void {
  // Clamp parameters
  const f = Math.max(1e-6, Math.min(frequency, sampleRate / 2 - 1e-6)); // Avoid 0 and Nyquist exactly
  const qVal = Math.max(0.0001, Q); // Q must be positive

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  const w0 = 2 * Math.PI * f / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * qVal);

  let A = 1; // Linear gain from dB
  if (type === 'peaking' || type === 'lowshelf' || type === 'highshelf') {
    A = Math.pow(10, gainDB / 40); // For peaking and shelving filters
  }

  switch (type) {
    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'bandpass': // BPF (constant 0dB peak gain)
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'allpass':
      b0 = 1 - alpha;
      b1 = -2 * cosW0;
      b2 = 1 + alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 =    A * ( (A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha );
      b1 =  2 * A * ( (A - 1) - (A + 1) * cosW0                   );
      b2 =    A * ( (A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha );
      a0 =          ( (A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha );
      a1 =     -2 * ( (A - 1) + (A + 1) * cosW0                   );
      a2 =          ( (A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha );
      break;
    }
    case 'highshelf': {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 =    A * ( (A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha );
      b1 = -2 * A * ( (A - 1) + (A + 1) * cosW0                   );
      b2 =    A * ( (A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha );
      a0 =          ( (A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha );
      a1 =      2 * ( (A - 1) - (A + 1) * cosW0                   );
      a2 =          ( (A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha );
      break;
    }
    default: // Passthrough for unknown type (should not happen if type is validated)
      b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }

  // Normalize by a0. If a0 is close to zero, treat as passthrough to avoid NaNs.
  if (Math.abs(a0) < 1e-9) {
    channelState.b0 = 1; channelState.b1 = 0; channelState.b2 = 0;
    channelState.a1 = 0; channelState.a2 = 0;
  } else {
    channelState.b0 = b0 / a0;
    channelState.b1 = b1 / a0;
    channelState.b2 = b2 / a0;
    channelState.a1 = a1 / a0;
    channelState.a2 = a2 / a0;
  }
}

/**
 * DSP kernel for a Biquad Filter node.
 */
export const processBiquad: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  parameters: Record<string, ParameterValue | undefined>, // Changed from any to ParameterValue | undefined
  nodeState: NodeState,          // Changed from 'blockSize: number' to 'nodeState'
  sampleRate: number,            // Changed from 'sampleRate: number' (was 5th, now correctly 5th)
  blockSize: number,             // Changed from 'numChannels: number' to 'blockSize'
  numChannels: number,           // Changed from 'nodeStateFromProcessor: NodeState' to 'numChannels'
): void => {
  const state = nodeState as BiquadNodeState; // Use the new 'nodeState' parameter
  const params = parameters; // Use the new 'parameters' parameter

  const typeParam = params.type;
  const type: BiquadFilterType =
    typeof typeParam === 'string' && VALID_FILTER_TYPES.includes(typeParam as BiquadFilterType)
    ? (typeParam as BiquadFilterType)
    : 'lowpass';

  const freqParam = params.frequency;
  const frequency: number = typeof freqParam === 'number' ? freqParam : 1000;

  const qParam = params.Q;
  const Q: number = typeof qParam === 'number' ? qParam : 1.0;

  const gainParam = params.gain;
  const gainDB: number = typeof gainParam === 'number' ? gainParam : 0.0;

  // Initialize or reconfigure channel states if needed
  if (
    !state.channelStates ||
    state.lastCalculatedNumChannels !== numChannels ||
    state.lastCalculatedSampleRate !== sampleRate ||
    state.lastCalculatedType !== type ||
    state.lastCalculatedFrequency !== frequency ||
    state.lastCalculatedQ !== Q ||
    state.lastCalculatedGain !== gainDB
  ) {
    if (!state.channelStates || state.channelStates.length !== numChannels) {
        state.channelStates = Array(numChannels).fill(null).map(() => ({
            b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, // Initial passthrough
            x1: 0, x2: 0, y1: 0, y2: 0,
        }));
    } // else, channelStates array has correct length, just needs coefficient update

    for (let i = 0; i < numChannels; i++) {
      // Ensure channel state object exists (it should due to map above)
      if (!state.channelStates[i]) { // Defensive: should not happen
        state.channelStates[i] = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
      }
      calculateCoefficients(type, frequency, Q, gainDB, sampleRate, state.channelStates[i]);
    }

    state.lastCalculatedType = type;
    state.lastCalculatedFrequency = frequency;
    state.lastCalculatedQ = Q;
    state.lastCalculatedGain = gainDB;
    state.lastCalculatedSampleRate = sampleRate;
    state.lastCalculatedNumChannels = numChannels;
  }

  // After initialization/update, state.channelStates is guaranteed to be non-null and populated.
  const channelStates = state.channelStates;

  for (let c = 0; c < numChannels; c++) {
    const inputChannel = inputs[c];
    const outputChannel = outputs[c];
    // Assuming MFNProcessor guarantees inputs[c] and outputs[c] exist for c < numChannels,
    // and chanState is prepared for numChannels, direct access should be safe.
    const chanState = channelStates[c]; // Accessing directly

    const { b0, b1, b2, a1, a2 } = chanState;
    let { x1, x2, y1, y2 } = chanState; // Get copies of state variables

    for (let i = 0; i < blockSize; i++) {
      const x0 = inputChannel[i];
      // Direct Form I Transposed (common for biquads)
      // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
      let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

      if (Number.isNaN(y0) || !Number.isFinite(y0)) {
        y0 = 0; // Output silence if calculation results in NaN or Infinity
        // Reset memory to prevent further NaNs/Infinities for this channel for this block
        // More robust reset might happen at coefficient calculation time if params are extreme.
        x1 = 0;
        x2 = 0;
        y1 = 0;
        y2 = 0;
      }
      outputChannel[i] = y0;

      // Update delay lines
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0; // y0 is already sanitized (0 if it was NaN/Infinity)
    }

    // Store updated state variables back
    chanState.x1 = x1;
    chanState.x2 = x2;
    chanState.y1 = y1;
    chanState.y2 = y2;
  }
};
