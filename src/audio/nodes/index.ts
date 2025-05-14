/**
 * Barrel file for exporting all DSP kernels and a kernel registry.
 */
import { noiseKernel } from './noise';
import { processGain } from './gain';
import { processDelay } from './delay';
import { processBiquad } from './biquad';
import { passthroughKernel } from './passthrough';
import { oscillatorKernel } from './oscillator'; // ADDED
import type { DSPKernel } from './dsp-kernel';

// Export individual kernels if needed elsewhere
export { processGain, processDelay, processBiquad, noiseKernel, passthroughKernel, oscillatorKernel }; // MODIFIED

// Create and export the kernel registry
// export const kernelRegistry: Record<NodeType, DSPKernel> = {
//   gain: processGain,
//   delay: processDelay,
//   biquad: processBiquad,
//   noise: noiseKernel,
//   oscillator: passthroughKernel, // Placeholder for oscillator
//   input_mixer: passthroughKernel, // Placeholder for input_mixer
//   output_mixer: passthroughKernel, // Placeholder for output_mixer
// };

export type { DSPKernel };
