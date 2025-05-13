import type { DSPKernel, NodeState } from './dsp-kernel';
import type { AudioNodeInstance } from '../schema';

const MAX_DELAY_SECONDS = 5; // Maximum delay time allowed, in seconds

interface DelayNodeState extends NodeState {
  delayBuffers?: Float32Array[];      // Optional: dynamically initialized
  writePointers?: number[];         // Optional: dynamically initialized
  initializedSampleRate?: number;   // To detect sample rate changes
  initializedNumChannels?: number;  // To detect channel count changes
  initializedMaxDelayBufferSize?: number; // To detect changes requiring buffer resize
}

/**
 * DSP kernel for a Delay node.
 * Implements a delay line with feedback and dry/wet mix control.
 */
export const processDelay: DSPKernel = (
  inputs: Float32Array[],
  outputs: Float32Array[],
  node: AudioNodeInstance,
  blockSize: number,
  sampleRate: number,
  numChannels: number,
  genericNodeState: NodeState // Received as generic NodeState from mfn-processor
): void => {
  // Cast the generic NodeState to the specific DelayNodeState for this kernel.
  // Properties defined in DelayNodeState will be initialized if they don't exist yet.
  const state = genericNodeState as DelayNodeState;

  // Retrieve parameters from the node instance, with defaults and clamping
  const delayTimeParam = node.parameters.delayTime;
  const feedbackParam = node.parameters.feedback;
  const mixParam = node.parameters.mix;

  const delayTimeSeconds =
    typeof delayTimeParam === 'number' && delayTimeParam >= 0
      ? Math.min(delayTimeParam, MAX_DELAY_SECONDS)
      : 0.5; // Default delay: 0.5 seconds

  const feedbackGain =
    typeof feedbackParam === 'number'
      ? Math.max(0, Math.min(1, feedbackParam))
      : 0.3; // Default feedback: 0.3

  const wetMix =
    typeof mixParam === 'number'
      ? Math.max(0, Math.min(1, mixParam))
      : 0.5; // Default mix: 0.5 (equal dry/wet)
  const dryMix = 1 - wetMix;

  // Calculate the required size for delay buffers based on max delay time and sample rate
  const currentMaxDelayBufferSize = Math.ceil(MAX_DELAY_SECONDS * sampleRate);

  // Initialize or re-initialize delay buffers and write pointers if:
  // 1. They haven't been initialized yet.
  // 2. The number of channels has changed.
  // 3. The sample rate has changed (affecting buffer sizes for a given time).
  // 4. The calculated max buffer size has changed (e.g., if MAX_DELAY_SECONDS were dynamic).
  if (
    !state.delayBuffers ||
    !state.writePointers ||
    state.initializedNumChannels !== numChannels ||
    state.initializedSampleRate !== sampleRate ||
    state.initializedMaxDelayBufferSize !== currentMaxDelayBufferSize
  ) {
    // console.log(`[DelayNode ${node.id}] Initializing/Re-initializing delay buffers. SR: ${sampleRate}, Ch: ${numChannels}, MaxBufSize: ${currentMaxDelayBufferSize}`);
    state.delayBuffers = Array.from({ length: numChannels }, () => new Float32Array(currentMaxDelayBufferSize).fill(0));
    state.writePointers = Array.from({ length: numChannels }, () => 0);
    state.initializedSampleRate = sampleRate;
    state.initializedNumChannels = numChannels;
    state.initializedMaxDelayBufferSize = currentMaxDelayBufferSize;
  }

  // At this point, state.delayBuffers and state.writePointers are guaranteed to be initialized.
  // TypeScript's control flow analysis should recognize this, avoiding the need for non-null assertions.
  const delayBuffers = state.delayBuffers;
  const writePointers = state.writePointers;

  for (let c = 0; c < numChannels; c++) {
    const inputChannel = inputs[c];    // Provided by mfn-processor, assumed valid
    const outputChannel = outputs[c];  // Provided by mfn-processor, assumed valid

    // These are now guaranteed to be valid due to the initialization block above
    // and the numChannels check within it.
    const delayBuffer = delayBuffers[c];
    let writePointer = writePointers[c];
    const bufferLength = delayBuffer.length;

    for (let i = 0; i < blockSize; i++) {
      // Calculate delay in samples. Ensure it's an integer and within buffer bounds.
      const delayInSamples = Math.max(0, Math.min(Math.floor(delayTimeSeconds * sampleRate), bufferLength - 1));

      // Calculate read pointer position
      let readPointer = writePointer - delayInSamples;
      if (readPointer < 0) {
        readPointer += bufferLength;
      }
      // Ensure readPointer is an integer index for array access
      const currentDelayedSample = delayBuffer[Math.floor(readPointer)];

      const currentInputSample = inputChannel[i];

      // Calculate output sample: mix dry (input) and wet (delayed) signals
      outputChannel[i] = (dryMix * currentInputSample) + (wetMix * currentDelayedSample);

      // Write to delay buffer: current input + feedback from the delayed signal
      delayBuffer[writePointer] = currentInputSample + (currentDelayedSample * feedbackGain);

      // Advance write pointer and wrap around if necessary
      writePointer++;
      if (writePointer >= bufferLength) {
        writePointer = 0;
      }
    }
    // Persist the updated write pointer for this channel back to the node's state
    writePointers[c] = writePointer;
  }
};
