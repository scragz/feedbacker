import { useEffect, useState } from 'react';
import { MainThreadMessageType } from '../audio/schema';

interface UseProcessorStatusCheckProps {
  audioContextState: AudioContextState | null;
  workletNodeRef: React.RefObject<AudioWorkletNode | null>;
  processorReady: boolean;
}

export function useProcessorStatusCheck({
  audioContextState,
  workletNodeRef,
  processorReady,
}: UseProcessorStatusCheckProps) {
  const [checkStatusSent, setCheckStatusSent] = useState(false);

  useEffect(() => {
    if (audioContextState === 'running' && workletNodeRef.current && !processorReady && !checkStatusSent) {
      console.log('[useProcessorStatusCheck.ts] Audio context running, sending CHECK_PROCESSOR_STATUS');
      workletNodeRef.current.port.postMessage({ type: MainThreadMessageType.CHECK_PROCESSOR_STATUS });
      setCheckStatusSent(true);
    }
  }, [audioContextState, processorReady, checkStatusSent, workletNodeRef]);

  return { checkStatusSent, setCheckStatusSent };
}
