/**
 * mfn-globals.d.ts
 *
 * Contains TypeScript type definitions for global properties
 * available in the AudioWorklet context.
 */

// This declaration is placed in the global scope
// and adds the missing AudioWorklet globals that TypeScript doesn't know about
declare global {
  // Variables available in AudioWorklet scope
  const sampleRate: number;
  const currentTime: number;
  const currentFrame: number;
}

// Export makes this a module which prevents name conflicts
export {};
