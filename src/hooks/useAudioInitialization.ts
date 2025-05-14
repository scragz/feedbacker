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
              console.log('[useAudioInitialization.ts] Received PROCESSOR_READY. Setting processorReady to true.');
              setProcessorReady(true);
              // console.log('[useAudioInitialization.ts] Audio processor is ready.'); // Original log
              break;
            case WorkletMessageType.PARAMETER_UPDATED:
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
              // This is the main way the graph should be updated from the worklet if it's the source of truth
              console.log('[useAudioInitialization.ts] Received GRAPH_UPDATED from worklet. Updating graph.');
              setAudioGraph(payload);
              // console.log('[useAudioInitialization.ts] Graph updated from worklet via GRAPH_UPDATED.'); // Original log
              break;
            case WorkletMessageType.PROCESSOR_STATUS: // Added case
              console.log('[useAudioInitialization.ts] Received PROCESSOR_STATUS:', payload);
              // Only update if the new status is different to avoid unnecessary re-renders if already correct.
              // This also helps prevent a delayed PROCESSOR_STATUS (false) from overriding a recent PROCESSOR_READY (true).
              // However, if the processor explicitly states it's not initialized, we must honor that.
              setProcessorReady(prev => {
                if (prev !== payload.isInitialized) {
                  console.log(`[useAudioInitialization.ts] PROCESSOR_STATUS: Updating processorReady from ${prev} to ${payload.isInitialized}.`);
                  return payload.isInitialized;
                }
                return prev;
              });
              if (payload.isInitialized) {
                // console.log('[useAudioInitialization.ts] Audio processor is confirmed ready (from PROCESSOR_STATUS).');
              } else {
                // console.warn('[useAudioInitialization.ts] Audio processor reported NOT ready (from PROCESSOR_STATUS).');
              }
              break;
            case WorkletMessageType.WORKLET_ERROR:
            // case WorkletMessageType.NODE_ERROR: // NODE_ERROR was removed, WORKLET_ERROR covers it
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

  return { audioContextRef, workletNodeRef, audioInitialized, setAudioGraph };
}
