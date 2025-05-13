import { useEffect, useState } from 'react';
import type { AudioGraph, InitProcessorMessage } from '../audio/schema';
import { MainThreadMessageType } from '../audio/schema';

const MAX_CHANNELS = 2;

interface UseProcessorInitializationProps {
  processorReady: boolean;
  workletNodeRef: React.RefObject<AudioWorkletNode | null>;
  audioContextRef: React.RefObject<AudioContext | null>;
  audioGraph: AudioGraph;
}

export function useProcessorInitialization({
  processorReady,
  workletNodeRef,
  audioContextRef,
  audioGraph,
}: UseProcessorInitializationProps) {
  const [initMessageSent, setInitMessageSent] = useState(false);

  useEffect(() => {
    if (processorReady && workletNodeRef.current && audioContextRef.current && !initMessageSent) {
      console.log('[useProcessorInitialization.ts] Processor ready, sending INIT_PROCESSOR with graph:', audioGraph);
      const initMessage: InitProcessorMessage = {
        type: MainThreadMessageType.INIT_PROCESSOR,
        payload: {
          graph: audioGraph,
          sampleRate: audioContextRef.current.sampleRate,
          maxChannels: MAX_CHANNELS,
        },
      };
      workletNodeRef.current.port.postMessage(initMessage);
      setInitMessageSent(true);
    }
  }, [processorReady, initMessageSent, audioGraph, workletNodeRef, audioContextRef]);

  return { initMessageSent, setInitMessageSent };
}
