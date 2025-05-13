import { useGraphStore, type GraphState } from '../stores/graph';
import { useUIStore } from '../stores/ui';
import {
  MainThreadMessageType,
  WorkletMessageType,
  type InitProcessorMessage,
  type UpdateGraphMessage,
  type UpdateParameterMessage,
  type RenderOfflineMessage,
  type WorkletMessage,
  type NodeId,
  type ParameterId,
  type ParameterValue,
  type AudioGraph,
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
  processorPort.onmessage = (event: MessageEvent<WorkletMessage>) => {
    const message = event.data;
    const { setLastErrorMessage, setAudioContextRunning } = useUIStore.getState();

    switch (message.type) {
      case WorkletMessageType.PROCESSOR_READY: {
        console.log('MFNProcessor initialized successfully:', message.payload);
        setAudioContextRunning(true);
        break;
      }
      case WorkletMessageType.GRAPH_UPDATED: {
        console.log('MFNProcessor graph updated successfully:', message.payload);
        break;
      }
      case WorkletMessageType.WORKLET_ERROR:
      case WorkletMessageType.NODE_ERROR: { // Combined error handling
        // Payload structure is { message: string, nodeId?: NodeId }
        const errorPayload = message.payload;
        if (errorPayload && typeof errorPayload.message === 'string') {
          console.error('MFNProcessor Error:', errorPayload.message);
          setLastErrorMessage(errorPayload.message);
        } else {
          console.error('MFNProcessor Error: Received malformed error payload', errorPayload);
          setLastErrorMessage('An unspecified error occurred in the audio processor.');
        }
        break;
      }
      case WorkletMessageType.DATA_AVAILABLE: {
        // Payload structure is { dataType: string, data: T, message?: string }
        const dataPayload = message.payload;
        if (dataPayload && dataPayload.dataType === 'offlineRenderComplete') {
          console.log('Offline render complete:', dataPayload.data as ArrayBuffer);
        }
        break;
      }
      default: {
        // const _exhaustiveCheck: never = message.type;
        console.warn('Received unknown message type from MFNProcessor:', message.type);
        break;
      }
    }
  };

  // Subscribe to graph changes from Zustand store
  useGraphStore.subscribe(
    // The selector `(state: GraphState) => state` was removed.
    // The listener function below is now the sole argument to subscribe,
    // and it directly receives the current and previous state.
    (currentState: GraphState, previousState: GraphState) => {
      // Compare relevant parts of the graph for changes
      if (
        currentState.nodes === previousState.nodes &&
        currentState.routingMatrix === previousState.routingMatrix &&
        currentState.masterGain === previousState.masterGain &&
        currentState.outputChannels === previousState.outputChannels
      ) {
        return;
      }
      sendGraphUpdateToProcessorDebounced();
    },
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
    if (!processorPortRef) return;
    const graphToSend: AudioGraph = useGraphStore.getState(); // Send the whole graph state which conforms to AudioGraph
    // If getSerializedGraph() is preferred, ensure its return type is AudioGraph or cast appropriately
    // const serializedGraph = useGraphStore.getState().getSerializedGraph();

    const message: UpdateGraphMessage = {
      type: MainThreadMessageType.UPDATE_GRAPH,
      // payload: { graph: serializedGraph as any }, // Kept as any if serializedGraph is used and differs
      payload: { graph: graphToSend }, // Assumes AudioGraph is expected by worklet
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
  parameterId: ParameterId, // Corrected: schema uses parameterId
  value: ParameterValue,
): void {
  if (!processorPortRef) {
    console.warn('Processor port not initialized. Cannot send parameter update.');
    return;
  }
  const message: UpdateParameterMessage = {
    type: MainThreadMessageType.UPDATE_PARAMETER,
    payload: { nodeId, parameterId, value }, // Corrected: use parameterId
  };
  processorPortRef.postMessage(message);
}

/**
 * Sends an INIT message to the MFNProcessor.
 * This is typically called once after the AudioWorkletNode is created and the bridge is initialized.
 *
 * @param sampleRate The sample rate of the AudioContext.
 */
export function sendInitRequestToProcessor(
  sampleRate: number,
  maxChannels: number
): void {
  if (!processorPortRef) {
    console.warn('Processor port not initialized. Cannot send init request.');
    return;
  }
  const initialGraph: AudioGraph = useGraphStore.getState();

  const message: InitProcessorMessage = {
    type: MainThreadMessageType.INIT_PROCESSOR,
    payload: {
      graph: {
        nodes: initialGraph.nodes,
        routingMatrix: initialGraph.routingMatrix,
        outputChannels: initialGraph.outputChannels,
        masterGain: initialGraph.masterGain,
      },
      sampleRate,
      maxChannels,
    },
  };
  processorPortRef.postMessage(message);
}

/**
 * Sends an RENDER_OFFLINE message to the MFNProcessor.
 *
 * @param durationSeconds The duration of the audio to render offline, in seconds.
 */
export function sendOfflineRenderRequestToProcessor(
  durationSeconds: number,
): void {
  if (!processorPortRef) {
    console.warn('Processor port not initialized. Cannot send offline render request.');
    return;
  }
  const message: RenderOfflineMessage = {
    type: MainThreadMessageType.RENDER_OFFLINE,
    payload: {
      durationSeconds,
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
