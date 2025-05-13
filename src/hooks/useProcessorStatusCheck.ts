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
  processorReady, // This is processorHandshakeComplete from App.tsx
}: UseProcessorStatusCheckProps) {
  const [checkStatusSent, setCheckStatusSent] = useState(false);

  useEffect(() => {
    // If processorReady (processorHandshakeComplete) becomes true, reset checkStatusSent.
    // This allows a new check to be sent if the processor becomes not ready again (e.g., due to an error or re-initialization).
    if (processorReady) {
      if (checkStatusSent) { // Only log and reset if it was previously sent and now processor is ready
        console.log('[useProcessorStatusCheck.ts] Processor is now ready. Resetting checkStatusSent to false.');
        setCheckStatusSent(false);
      }
      return; // Don't proceed to send a check if the processor is already marked as ready.
    }

    // Conditions for sending the check:
    // 1. Audio context must be running.
    // 2. Worklet node must exist.
    // 3. Processor must NOT be ready yet (processorReady is false).
    // 4. Status check must NOT have been sent already in the current "not ready" cycle.
    if (audioContextState === 'running' && workletNodeRef.current && !processorReady && !checkStatusSent) {
      console.log('[useProcessorStatusCheck.ts] Conditions met: Audio context running, worklet node available, processor NOT ready, status check NOT yet sent. Sending CHECK_PROCESSOR_STATUS.');
      workletNodeRef.current.port.postMessage({ type: MainThreadMessageType.CHECK_PROCESSOR_STATUS });
      setCheckStatusSent(true);
    } else if (!processorReady) { // Log details only if we are in a state where we *might* send, but don't (i.e., processor is not ready)
      let reason = '[useProcessorStatusCheck.ts] Not sending CHECK_PROCESSOR_STATUS because:';
      if (audioContextState !== 'running') {
        reason += ` audioContextState is ${audioContextState} (expected 'running').`;
      }
      if (!workletNodeRef.current) {
        reason += ' workletNodeRef.current is null.';
      }
      // processorReady is already known to be false here, so no need to check it as a negative condition.
      if (checkStatusSent) {
        reason += ' checkStatusSent is true (waiting for processor to become ready or for checkStatusSent to be reset).';
      }
      // Only log if there was a reason other than processorReady being true (which is handled by the first return).
      if (audioContextState !== 'running' || !workletNodeRef.current || checkStatusSent) {
        console.log(reason);
      }
    }
  }, [audioContextState, processorReady, checkStatusSent, workletNodeRef]);

  // This hook primarily manages an effect; its return value might not be essential for App.tsx.
  // Returning checkStatusSent can be useful for debugging or more complex parent logic if needed.
  return { checkStatusSent };
}
