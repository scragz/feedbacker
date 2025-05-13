/**
 * Barrel file for exporting all DSP kernels.
 */
export { processGain } from './gain';
export { processDelay } from './delay';
export { processBiquad } from './biquad';
export { processPassthrough } from './passthrough';
export type { DSPKernel } from './dsp-kernel';
