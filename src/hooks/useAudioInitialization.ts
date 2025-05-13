import { useEffect, useRef, useState } from 'react';
import { getAudioContext, loadMFNWorklet } from '../audio';
import type { MFNWorkletNode } from '../audio'; // Import MFNWorkletNode as a type
import type {
  AudioGraph,
  WorkletMessage, // Combined type for all messages
} from '../audio/schema';
import { WorkletMessageType } from '../audio/schema';

interface UseAudioInitializationProps {
  setAudioGraph: React.Dispatch<React.SetStateAction<AudioGraph>>;
  setAudioError: React.Dispatch<React.SetStateAction<string | null>>;
  setProcessorReady: React.Dispatch<React.SetStateAction<boolean>>;
  setAudioContextState: React.Dispatch<React.SetStateAction<AudioContextState | null>>;
}

export function useAudioInitialization({
  setAudioGraph,
  setAudioError,
  setProcessorReady,
  setAudioContextState,
}: UseAudioInitializationProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<MFNWorkletNode | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const initializeAudio = async () => {
      try {
        const context = getAudioContext();
        audioContextRef.current = context;
        if (isMounted) setAudioContextState(context.state);
        context.onstatechange = () => {
          if (isMounted) setAudioContextState(context.state);
        };

        const mfnNode = await loadMFNWorklet();
        workletNodeRef.current = mfnNode;

        // Connect the worklet node to the destination
        mfnNode.connect(context.destination);

        mfnNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
          if (!isMounted) return;
          const { type, payload } = event.data;
          // console.log('[useAudioInitialization.ts] Received message from worklet:', type, payload);

          switch (type) {
            case WorkletMessageType.PROCESSOR_READY:
              setProcessorReady(true);
              console.log('[useAudioInitialization.ts] Audio processor is ready.');
              // Example: Accessing payload if it was defined for PROCESSOR_READY
              // if (payload && 'sampleRate' in payload) {
              //   console.log('Processor ready with sampleRate:', payload.sampleRate);
              // }
              break;
            case WorkletMessageType.NODE_ADDED:
              // Payload is non-optional for NODE_ADDED (AudioNodeInstance)
              setAudioGraph(prevGraph => ({
                ...prevGraph,
                nodes: [...prevGraph.nodes, payload],
              }));
              break;
            case WorkletMessageType.NODE_REMOVED:
              // Payload is non-optional for NODE_REMOVED ({ nodeId: string })
              setAudioGraph(prevGraph => ({
                ...prevGraph,
                nodes: prevGraph.nodes.filter(n => n.id !== payload.nodeId),
              }));
              break;
            case WorkletMessageType.PARAMETER_UPDATED:
              // Payload is non-optional for PARAMETER_UPDATED ({ nodeId: string, parameterId: string, value: ParameterValue })
              setAudioGraph(prevGraph => ({
                ...prevGraph,
                nodes: prevGraph.nodes.map(n =>
                  n.id === payload.nodeId
                    ? { ...n, parameters: { ...n.parameters, [payload.parameterId]: payload.value } }
                    : n
                ),
              }));
              break;
            case WorkletMessageType.GRAPH_UPDATED:
              // Payload is non-optional for GRAPH_UPDATED (AudioGraph)
              setAudioGraph(payload);
              break;
            case WorkletMessageType.WORKLET_ERROR:
            case WorkletMessageType.NODE_ERROR:
              // Payload is non-optional for WORKLET_ERROR/NODE_ERROR ({ message: string })
              setAudioError(payload.message);
              console.error('[useAudioInitialization.ts] Worklet Error:', payload.message);
              break;
            default:
              // Exhaustive check for message types, TS should warn if a case is missed.
              // const _exhaustiveCheck: never = type; // Uncomment for exhaustive check
              console.warn('[useAudioInitialization.ts] Received unknown message type from worklet:', type);
          }
        };

        if (isMounted) setAudioInitialized(true);

      } catch (error) {
        console.error('Error initializing audio:', error);
        if (isMounted) setAudioError(error instanceof Error ? error.message : String(error));
      }
    };
    void initializeAudio();

    return () => {
      isMounted = false;
      // Consider cleanup:
      // if (workletNodeRef.current) {
      //   workletNodeRef.current.port.onmessage = null;
      //   workletNodeRef.current.disconnect();
      // }
      // if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      //   // audioContextRef.current.close(); // Closing context might be too aggressive
      // }
    };
  }, [setAudioContextState, setAudioError, setAudioGraph, setProcessorReady]);

  return { audioContextRef, workletNodeRef, audioInitialized };
}
