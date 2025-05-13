/**
 * audio/index.ts
 *
 * Main entry point for audio-related functionalities.
 * Includes helpers for initializing the AudioContext and loading the AudioWorklet.
 */

import { WorkletMessageType } from './schema'; // Removed AudioGraph, MainThreadMessageType
import MFNProcessorURL from './mfn-processor.ts?worker&url'; // Vite-specific import for worker URL

const MFN_PROCESSOR_NAME = 'mfn-processor';

/**
 * Represents the connection to the MFNProcessor in the AudioWorklet.
 */
export interface MFNWorkletNode extends AudioWorkletNode {
  // You can add custom methods or properties here if needed in the future
}

let audioContext: AudioContext | null = null;
let mfnNode: MFNWorkletNode | null = null;

/**
 * Initializes the AudioContext if it hasn't been already.
 * @returns The singleton AudioContext instance.
 * @throws Error if AudioContext cannot be created.
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    if (!audioContext) {
      throw new Error('AudioContext is not supported in this browser.');
    }
    // Optional: Resume context if it was suspended by autoplay policy
    audioContext.resume().catch((err: unknown) => {
      console.error('AudioContext resume failed:', err);
    });
  }
  return audioContext;
}

/**
 * Loads the MFNProcessor AudioWorklet module and creates an instance of the MFNWorkletNode.
 * It ensures that the AudioContext is initialized and the worklet is added only once.
 *
 * @param processorPath - The path to the mfn-processor.ts module (should be the JS output path).
 * @returns A promise that resolves with the MFNWorkletNode instance.
 * @throws Error if the worklet module cannot be added or the node cannot be created.
 */
export async function loadMFNWorklet(): Promise<MFNWorkletNode> { // Changed: path is now imported
  const context = getAudioContext();

  if (mfnNode) {
    console.log('[AudioIndex] MFNWorkletNode already loaded.');
    return mfnNode;
  }

  try {
    console.log(`[AudioIndex] Adding module from URL: ${MFNProcessorURL}`); // Use imported URL
    await context.audioWorklet.addModule(MFNProcessorURL); // Use imported URL
    console.log('[AudioIndex] MFNProcessor module added successfully.');
  } catch (e) {
    console.error(`[AudioIndex] Failed to add MFNProcessor module from ${MFNProcessorURL}:`, e); // Use imported URL
    throw new Error(`Failed to add AudioWorklet module: ${(e as Error).message}`);
  }

  try {
    mfnNode = new AudioWorkletNode(context, MFN_PROCESSOR_NAME, {
      numberOfInputs: 1, // Example: 1 stereo input
      numberOfOutputs: 1, // Example: 1 stereo output
      outputChannelCount: [2], // Specify channel count for each output, e.g. stereo for the first output
      // processorOptions: { /* initial options if any */ }
    }) as MFNWorkletNode;
    console.log('[AudioIndex] MFNWorkletNode created successfully.');

    // Basic message handling from the worklet
    mfnNode.port.onmessage = (event) => {
      console.log('[AudioIndex] Message from MFNProcessor:', event.data);
      if (event.data.type === WorkletMessageType.PROCESSOR_READY) {
        console.log('[AudioIndex] MFNProcessor reported ready!');
        // You can now safely send initial configuration messages to the processor
      }
      // Handle other messages like WORKLET_ERROR, DATA_AVAILABLE, etc.
    };

    mfnNode.onprocessorerror = (event) => {
      console.error('[AudioIndex] MFNWorkletNode processor error:', event);
      // Potentially try to re-initialize or notify the user
    };

    return mfnNode;
  } catch (e) {
    console.error('[AudioIndex] Failed to create MFNWorkletNode:', e);
    throw new Error(`Failed to create MFNWorkletNode: ${(e as Error).message}`);
  }
}

/**
 * Gets the existing MFNWorkletNode instance.
 * @returns The MFNWorkletNode or null if not loaded.
 */
export function getMFNWorkletNode(): MFNWorkletNode | null { // Renamed from getMFNNode
  return mfnNode;
}

/**
 * A utility to ensure the AudioContext is resumed, typically after a user interaction.
 */
export async function ensureAudioContextResumed(): Promise<void> {
  const context = getAudioContext();
  if (context.state === 'suspended') {
    console.log('[AudioIndex] Resuming AudioContext...');
    await context.resume();
    console.log('[AudioIndex] AudioContext resumed.');
  }
}

// Example of how this might be called from main application logic:
// async function initializeAudio() { // This was previously commented out
export async function initializeAudioSystem() { // Renamed and made exportable
  try {
    const workletNode = await loadMFNWorklet();
    workletNode.connect(getAudioContext().destination);
    console.log('[AudioSystem] Initialized, MFN worklet loaded and connected to destination.');

    // Removed automatic INIT_PROCESSOR message. App.tsx will handle this.
    // Wait for the PROCESSOR_READY message or use a small delay as a fallback.
    const listenForReady = new Promise<void>(resolve => {
      if (!mfnNode) { // Should not happen if loadMFNWorklet succeeded
        resolve(); // or reject
        return;
      }
      const readyListener = (event: MessageEvent) => {
        if (event.data.type === WorkletMessageType.PROCESSOR_READY) {
          mfnNode?.port.removeEventListener('message', readyListener);
          resolve();
        }
      };
      mfnNode.port.addEventListener('message', readyListener);
      // Timeout if ready message isn't received
      setTimeout(() => {
        mfnNode?.port.removeEventListener('message', readyListener);
        resolve(); // Resolve anyway to allow App to attempt sending init
        console.warn("[AudioSystem] Timeout waiting for PROCESSOR_READY, App.tsx will attempt to send INIT.");
      }, 1000); // 1 second timeout
    });

    await listenForReady;
    // App.tsx will now be responsible for checking mfnNode and AudioContext state
    // before sending INIT_PROCESSOR.

  } catch (error) {
    console.error('[AudioSystem] Failed to initialize audio system:', error);
    // Display error to user, etc.
  }
}

// // Call this from your main application entry point, e.g., App.tsx useEffect
// // initializeAudioSystem(); // Now to be called from App.tsx
