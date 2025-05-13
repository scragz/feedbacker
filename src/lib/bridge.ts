import { useGraphStore } from '../stores/graph';
import { useUIStore } from '../stores/ui';
import {
  MessageType,
  type ProcessorMessage,
  type WorkerMessage,
  type SerializedAudioGraph,
  type NodeId,
  type ParameterId,
  type ProcessorInitRequest,
  type GraphUpdateRequest,
  type ParamUpdateRequest,
  type OfflineRenderRequest,
  type WorkerInitResponse,
  type WorkerUpdateResponse,
  type WorkerErrorResponse,
  type WorkerOfflineRenderResponse,
} from '../audio/schema';

const DEBOUNCE_MS = 5;

let audioContextRef: AudioContext | null = null;
let processorPortRef: MessagePort | null = null;
let debounceTimeoutId: number | null = null;

/**
 * Initializes the audio bridge with the AudioContext and the MessagePort from the MFNProcessor.
 * Sets up listeners for messages from the processor and subscribes to graph store changes.
 *
 * @param audioContext The Web Audio API AudioContext.
 * @param processorPort The MessagePort for communication with the MFNProcessor AudioWorklet.
 */
export function initAudioBridge(
  audioContext: AudioContext,
  processorPort: MessagePort,
): void {
  audioContextRef = audioContext;
  processorPortRef = processorPort;

  // Listen for messages from the MFNProcessor
  processorPort.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;
    const { setLastErrorMessage, setAudioContextRunning } = useUIStore.getState();

    switch (type) {
      case MessageType.WORKER_INIT_SUCCESS:
        console.log('MFNProcessor initialized successfully:', payload as WorkerInitResponse);
        // You might want to update some UI state here
        setAudioContextRunning(true); // Or based on actual audioContext.state
        break;
      case MessageType.WORKER_UPDATE_SUCCESS:
        console.log('MFNProcessor updated successfully:', payload as WorkerUpdateResponse);
        break;
      case MessageType.WORKER_ERROR:
        console.error('MFNProcessor Error:', (payload as WorkerErrorResponse).message);
        setLastErrorMessage((payload as WorkerErrorResponse).message);
        break;
      case MessageType.WORKER_OFFLINE_RENDER_COMPLETE:
        console.log('Offline render complete:', payload as WorkerOfflineRenderResponse);
        // Handle the rendered audio data (e.g., save to file, play back)
        break;
      default:
        console.warn('Received unknown message type from MFNProcessor:', type);
    }
  };

  // Subscribe to graph changes from Zustand store
  useGraphStore.subscribe(
    (state) => state.graph, // Selector: listen to the whole graph object
    (currentGraph, previousGraph) => {
      // Basic check to prevent updates if the graph hasn't actually changed.
      // Zustand's subscribe fires even for shallowly equal objects if the reference changes.
      // A more robust deep comparison or versioning might be needed for complex scenarios.
      if (currentGraph === previousGraph) {
        return;
      }
      // console.log('Graph store changed, scheduling update to processor.');
      sendGraphUpdateToProcessorDebounced();
    },
    // { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) } // Could use deep equal for more precise updates
  );
}

/**
 * Sends a GRAPH_UPDATE message to the MFNProcessor with the current graph state.
 * This function is debounced to prevent flooding the processor with messages.
 */
function sendGraphUpdateToProcessorDebounced(): void {
  if (!processorPortRef) {
    console.warn('Processor port not initialized. Cannot send graph update.');
    return;
  }

  if (debounceTimeoutId !== null) {
    clearTimeout(debounceTimeoutId);
  }

  debounceTimeoutId = window.setTimeout(() => {
    if (!processorPortRef) return; // Check again inside timeout
    const serializedGraph = useGraphStore.getState().getSerializedGraph();
    // console.log('Debounced: Sending GRAPH_UPDATE to MFNProcessor:', serializedGraph);
    const message: GraphUpdateRequest = {
      type: MessageType.GRAPH_UPDATE,
      payload: serializedGraph,
    };
    processorPortRef.postMessage(message);
    debounceTimeoutId = null;
  }, DEBOUNCE_MS);
}

/**
 * Sends a PARAM_UPDATE message to the MFNProcessor.
 *
 * @param nodeId The ID of the node whose parameter is being updated.
 * @param paramId The ID of the parameter being updated.
 * @param value The new value of the parameter.
 */
export function sendParameterUpdateToProcessor(
  nodeId: NodeId,
  paramId: ParameterId,
  value: number,
): void {
  if (!processorPortRef) {
    console.warn('Processor port not initialized. Cannot send parameter update.');
    return;
  }
  // console.log(\`Sending PARAM_UPDATE for ${nodeId}.${paramId} = ${value}\`);
  const message: ParamUpdateRequest = {
    type: MessageType.PARAM_UPDATE,
    payload: { nodeId, paramId, value },
  };
  processorPortRef.postMessage(message);
}

/**
 * Sends an INIT message to the MFNProcessor.
 * This is typically called once after the AudioWorkletNode is created and the bridge is initialized.
 *
 * @param numberOfChannels The number of channels to initialize the processor with.
 * @param sampleRate The sample rate of the AudioContext.
 */
export function sendInitRequestToProcessor(
  numberOfChannels: number,
  sampleRate: number,
): void {
  if (!processorPortRef) {
    console.warn('Processor port not initialized. Cannot send init request.');
    return;
  }
  // console.log(\`Sending INIT to MFNProcessor: ${numberOfChannels} channels, ${sampleRate} Hz\`);
  const message: ProcessorInitRequest = {
    type: MessageType.INIT,
    payload: {
      numberOfChannels,
      sampleRate,
      // initialGraph: useGraphStore.getState().getSerializedGraph(), // Optionally send initial graph
    },
  };
  processorPortRef.postMessage(message);
}

/**
 * Sends an RENDER_OFFLINE message to the MFNProcessor.
 *
 * @param durationSeconds The duration of the audio to render offline, in seconds.
 * @param sampleRate The sample rate for the offline render (can be different from AudioContext's).
 *                   If not provided, the processor's current sample rate will be used.
 */
export function sendOfflineRenderRequestToProcessor(
  durationSeconds: number,
  targetSampleRate?: number,
): void {
  if (!processorPortRef || !audioContextRef) {
    console.warn(
      'Processor port or audio context not initialized. Cannot send offline render request.',
    );
    return;
  }
  // console.log(\`Sending RENDER_OFFLINE to MFNProcessor: ${durationSeconds}s\`);
  const message: OfflineRenderRequest = {
    type: MessageType.RENDER_OFFLINE,
    payload: {
      durationSeconds,
      sampleRate: targetSampleRate || audioContextRef.sampleRate,
    },
  };
  processorPortRef.postMessage(message);
}

// Ensure that the audio context is resumed if it's in a suspended state.
// This is often needed due to browser autoplay policies.
export async function resumeAudioContext(): Promise<void> {
  if (audioContextRef && audioContextRef.state === 'suspended') {
    try {
      await audioContextRef.resume();
      useUIStore.getState().setAudioContextRunning(true);
      console.log('AudioContext resumed successfully.');
    } catch (err) {
      console.error('Error resuming AudioContext:', err);
      useUIStore.getState().setLastErrorMessage('Failed to resume audio context.');
      useUIStore.getState().setAudioContextRunning(false);
    }
  } else if (audioContextRef && audioContextRef.state === 'running') {
    useUIStore.getState().setAudioContextRunning(true);
  }
}

// Example of how to get the current AudioContext (if needed elsewhere)
export function getAudioContext(): AudioContext | null {
  return audioContextRef;
}

// Example of how to get the current Processor Port (if needed elsewhere)
export function getProcessorPort(): MessagePort | null {
  return processorPortRef;
}
