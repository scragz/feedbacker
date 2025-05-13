/**
 * global.d.ts
 *
 * Contains global type declarations for the project.
 * This is particularly useful for augmenting existing types or declaring types
 * for modules that don't have their own .d.ts files, or for global browser APIs.
 */

// This declaration allows TypeScript to recognize your AudioWorkletProcessor subclass
// when it's registered with `registerProcessor`.
// It helps avoid type errors when the processor name is used in `AudioWorkletNode` constructor.

// We don't strictly need to declare MFNProcessor globally if mfn-processor.ts
// already handles its own registration and the main thread only refers to it by name string.
// However, if you were to import MFNProcessor class itself on the main thread for some reason
// (not typical for worklets), then a global or module declaration would be more relevant.

// The primary purpose of this file in the context of the plan is to ensure
// that `AudioWorkletGlobalScope` and `registerProcessor` are known, especially if
// you have strict type checking that might not recognize these ambiently.

// Ensure AudioWorkletGlobalScope types are available if not implicitly included
// by your tsconfig.json lib settings (e.g., "DOM", "WebWorker").
declare global {
  interface AudioWorkletGlobalScope {
    registerProcessor: (name: string, processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor) => void;
    currentFrame: number;
    sampleRate: number;
    AudioWorkletProcessor: typeof AudioWorkletProcessor;
  }

  // If you need to refer to your specific processor class by name globally (less common)
  // interface Window {
  //   MFNProcessor: typeof import('./audio/mfn-processor').default; // Assuming default export
  // }
}

// This export {} is important to make this file a module, which allows `declare global`.
// If it's not a module, `declare global` might affect the actual global scope differently.
export {};
