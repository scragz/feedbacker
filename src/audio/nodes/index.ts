/**
 * Barrel file for exporting all DSP kernels.
 */
import { noiseKernel as noiseKernelInstance } from './noise';

export { processGain } from './gain';
export { processDelay } from './delay';
export { processBiquad } from './biquad';
export { processPassthrough } from './passthrough';
export const noiseKernel = noiseKernelInstance; // Exporting noise kernel directly
export type { DSPKernel } from './dsp-kernel';
