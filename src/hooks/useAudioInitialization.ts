import { useEffect, useRef, useState } from 'react';
import { setupAudioWorklet } from '../audio';
import type {
  AudioGraph,
  NodeAddedMessage,
  NodeRemovedMessage,
  ParameterUpdatedMessage,
  GraphUpdatedMessage,
  WorkletErrorMessage,
  WorkletMessage,
} from '../audio/schema';
import { WorkletMessageType } from '../audio/schema';

const MAX_CHANNELS = 2; // Default to stereo, ensure this matches worklet and context

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
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!audioContextRef.current) {
      const initializeAudio = async () => {
        try {
          const context = new AudioContext();
          if (isMounted) setAudioContextState(context.state);
          context.onstatechange = () => {
            if (isMounted) setAudioContextState(context.state);
          };

          await setupAudioWorklet(context);
          const mfnNode = new AudioWorkletNode(context, 'mfn-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [MAX_CHANNELS],
            processorOptions: { maxChannels: MAX_CHANNELS, sampleRate: context.sampleRate },
          });

          mfnNode.connect(context.destination);

          mfnNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
            if (!isMounted) return;
            const { type, payload } = event.data;
            console.log('[useAudioInitialization.ts] Received message from worklet:', type, payload);

            switch (type) {
              case WorkletMessageType.PROCESSOR_READY:
                if (isMounted) setProcessorReady(true);
                console.log('[useAudioInitialization.ts] Audio processor is ready.');
                break;
              case WorkletMessageType.NODE_ADDED:
                if (isMounted && payload) {
                  const nodeAddedPayload = payload as NodeAddedMessage['payload'];
                  setAudioGraph(prevGraph => ({
                    ...prevGraph,
                    nodes: [...prevGraph.nodes, nodeAddedPayload],
                  }));
                }
                break;
              case WorkletMessageType.NODE_REMOVED:
                if (isMounted && payload) {
                  const nodeRemovedPayload = payload as NodeRemovedMessage['payload'];
                  setAudioGraph(prevGraph => ({
                    ...prevGraph,
                    nodes: prevGraph.nodes.filter(n => n.id !== nodeRemovedPayload.nodeId),
                  }));
                }
                break;
              case WorkletMessageType.PARAMETER_UPDATED:
                if (isMounted && payload) {
                  const paramUpdatedPayload = payload as ParameterUpdatedMessage['payload'];
                  setAudioGraph(prevGraph => ({
                    ...prevGraph,
                    nodes: prevGraph.nodes.map(n =>
                      n.id === paramUpdatedPayload.nodeId
                        ? { ...n, parameters: { ...n.parameters, [paramUpdatedPayload.parameterId]: paramUpdatedPayload.value } }
                        : n
                    ),
                  }));
                }
                break;
              case WorkletMessageType.GRAPH_UPDATED:
                if (isMounted && payload) {
                  setAudioGraph(payload as GraphUpdatedMessage['payload']);
                }
                break;
              case WorkletMessageType.WORKLET_ERROR:
              case WorkletMessageType.NODE_ERROR:
                if (isMounted && payload) {
                  const errorPayload = payload as WorkletErrorMessage['payload'];
                  setAudioError(errorPayload.message);
                  console.error('[useAudioInitialization.ts] Worklet Error:', errorPayload.message);
                }
                break;
              default:
                console.warn('[useAudioInitialization.ts] Received unknown message type from worklet:', type);
            }
          };

          audioContextRef.current = context;
          workletNodeRef.current = mfnNode;
          if (isMounted) setAudioInitialized(true);

        } catch (error) {
          console.error('Error initializing audio:', error);
          if (isMounted) setAudioError(error instanceof Error ? error.message : String(error));
        }
      };
      void initializeAudio();
    }
    return () => {
      isMounted = false;
      // if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      //   // audioContextRef.current.close(); // Consider implications before enabling
      // }
    };
  }, [setAudioContextState, setAudioError, setAudioGraph, setProcessorReady]);

  return { audioContextRef, workletNodeRef, audioInitialized };
}
