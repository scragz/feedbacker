import { useEffect, useRef } from 'react';
import { MainThreadMessageType } from '../audio/schema';

interface UseProcessorStatusCheckProps {
  audioContextState: AudioContextState | null;
  workletNodeRef: React.RefObject<AudioWorkletNode | null>;
  processorReady: boolean;
  audioInitialized: boolean;
  appInitializationTime: number; // Timestamp when the app (or audio part) started initializing
}

export function useProcessorStatusCheck({
  audioContextState,
  workletNodeRef,
  processorReady,
  audioInitialized,
  appInitializationTime,
}: UseProcessorStatusCheckProps) {
  const lastCheckTimestampRef = useRef<number>(0);
  const initialGracePeriod = 2500; // Wait 2.5 seconds after app init before the first check
  const checkInterval = 5000;    // Then check every 5 seconds if still not ready

  useEffect(() => {
    if (processorReady) {
      // If processor becomes ready, reset timestamp so a check can happen again if it becomes not ready later.
      lastCheckTimestampRef.current = 0;
      return;
    }

    if (!audioInitialized || !workletNodeRef.current || audioContextState !== 'running') {
      // console.log('[useProcessorStatusCheck.ts] Pre-conditions not met (audio not init, no worklet, or context not running). Skipping check.');
      return;
    }

    const now = Date.now();

    // Determine if it's time for the first check (after grace period) or a subsequent check
    let shouldSendCheck = false;
    if (lastCheckTimestampRef.current === 0) { // Potentially the first check cycle
      if (now - appInitializationTime > initialGracePeriod) {
        shouldSendCheck = true;
      }
    } else { // Subsequent check cycle
      if (now - lastCheckTimestampRef.current > checkInterval) {
        shouldSendCheck = true;
      }
    }

    if (shouldSendCheck) {
      console.log(`[useProcessorStatusCheck.ts] Conditions met (processorReady: false, audioInitialized: true, context: running). Sending CHECK_PROCESSOR_STATUS.`);
      workletNodeRef.current.port.postMessage({ type: MainThreadMessageType.CHECK_PROCESSOR_STATUS });
      lastCheckTimestampRef.current = now;
    }
    // else {
    //   if (lastCheckTimestampRef.current === 0) {
    //     // console.log(`[useProcessorStatusCheck.ts] Waiting for initial grace period. App init: ${new Date(appInitializationTime).toISOString()}, Now: ${new Date(now).toISOString()}`);
    //   } else {
    //     // console.log(`[useProcessorStatusCheck.ts] Waiting for check interval. Last check: ${new Date(lastCheckTimestampRef.current).toISOString()}, Now: ${new Date(now).toISOString()}`);
    //   }
    // }
  }, [
    audioContextState,
    processorReady,
    workletNodeRef,
    audioInitialized,
    appInitializationTime,
    initialGracePeriod,
    checkInterval
  ]);

  // This hook is side-effect only.
}
