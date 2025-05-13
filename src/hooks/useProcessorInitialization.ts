import { useEffect, useState } from 'react';
import type { AudioGraph, InitProcessorMessage } from '../audio/schema';
import { MainThreadMessageType } from '../audio/schema';

const MAX_CHANNELS = 2;

interface UseProcessorInitializationProps {
  audioInitialized: boolean; // Changed from processorReady
  workletNodeRef: React.RefObject<AudioWorkletNode | null>;
  audioContextRef: React.RefObject<AudioContext | null>;
  audioGraph: AudioGraph;
}

export function useProcessorInitialization({
  audioInitialized, // Changed from processorReady
  workletNodeRef,
  audioContextRef,
  audioGraph,
}: UseProcessorInitializationProps) {
  const [initMessageSent, setInitMessageSent] = useState(false);

  useEffect(() => {
    // Send INIT_PROCESSOR when audio is initialized (worklet node available) and message hasn't been sent
    if (audioInitialized && workletNodeRef.current && audioContextRef.current && !initMessageSent) {
      console.log('[useProcessorInitialization.ts] Audio initialized, sending INIT_PROCESSOR with graph:', audioGraph);
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
  }, [audioInitialized, initMessageSent, audioGraph, workletNodeRef, audioContextRef]);

  return { initMessageSent, setInitMessageSent }; // setInitMessageSent might be useful for resets if needed
}
