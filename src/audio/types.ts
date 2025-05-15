/**
 * types.ts
 *
 * Contains TypeScript type definitions for AudioWorklet global types.
 */

// Declare the global AudioWorklet types
declare global {
  interface AudioWorkletGlobalScope {
    readonly sampleRate: number;
    readonly currentTime: number;
    readonly currentFrame: number;
  }

  // Define the base AudioWorkletProcessor interface
  interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean;
  }

  // Define the constructor signature for an AudioWorkletProcessor
  const AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
  };

  // Define the AudioWorkletNodeOptions interface
  interface AudioWorkletNodeOptions {
    numberOfInputs?: number;
    numberOfOutputs?: number;
    outputChannelCount?: number[];
    processorOptions?: {
      sampleRate?: number;
      maxChannels?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  // Global registerProcessor function
  function registerProcessor(
    name: string,
    processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
  ): void;

  // Make AudioWorkletGlobalScope available as a property of globalThis
  var AudioWorkletGlobalScope: AudioWorkletGlobalScope | undefined;
}

export {};
