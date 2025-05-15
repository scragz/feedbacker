/**
 * types.ts
 *
 * Contains TypeScript type definitions for AudioWorklet global types.
 */

// Declare the global AudioWorklet types
// These types augment the standard DOM types to add missing or custom functionality
declare global {
  // Note: AudioWorkletGlobalScope is already declared in global.d.ts
  // We only add MFNProcessor specific types here

  interface MFNProcessorOptions {
    sampleRate?: number;
    maxChannels?: number;
    [key: string]: unknown;
  }

  // Define the base AudioWorkletProcessor interface if not already defined elsewhere
  interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean;
  }

  // AudioWorkletProcessor constructor is defined in global.d.ts

  // registerProcessor is defined in global.d.ts
}

export {};
