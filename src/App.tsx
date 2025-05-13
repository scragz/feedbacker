import { useState, useEffect, useCallback } from 'react';
import { MantineProvider, LoadingOverlay } from '@mantine/core';
import { theme } from './theme';

import LayoutShell from './components/LayoutShell/LayoutShell';
import Controls from './components/Controls/Controls';
import Pedalboard from './components/Pedalboard/Pedalboard';
import NodeList from './components/NodeList/NodeList';
import NodeEditor from './components/NodeEditor/NodeEditor';
import StatusDisplay from './components/StatusDisplay/StatusDisplay';

import { useAudioInitialization } from './hooks/useAudioInitialization';
import { useProcessorInitialization } from './hooks/useProcessorInitialization';
import { useProcessorStatusCheck } from './hooks/useProcessorStatusCheck';

import { useGraphStore } from './stores/graph';
import { useUIStore } from './stores/ui';
import {
  type NodeId,
  type ParameterId,
  type ParameterValue,
  type NodeType,
  MainThreadMessageType,
  type AudioGraph,
  type WorkletMessage,
  WorkletMessageType,
} from './audio/schema';

function App() {
  // Zustand Store Hooks
  const {
    nodes,
    routingMatrix,
    outputChannels,
    masterGain,
    addNode: addNodeToStore,
    updateNodeParameter: updateParamInStore,
    getNodeById,
  } = useGraphStore();

  const {
    selectedNodeId,
    // lastErrorMessage, // This was unused, consider removing if not needed elsewhere
    selectNode: setSelectedNodeIdInStore,
    setLastErrorMessage,
    setAudioContextRunning: setCtxRunningInStore,
  } = useUIStore();

  // Local state for App.tsx
  const [audioInitError, setAudioInitError] = useState<string | null>(null);
  const [currentAudioContextState, setCurrentAudioContextState] = useState<AudioContext['state'] | null>(null);

  // New state to track if the processor handshake (status check response) is complete
  const [processorHandshakeComplete, setProcessorHandshakeComplete] = useState(false);

  // workletKnownGraph and its handler are not directly related to this fix,
  // but ensure they are used or remove if they are remnants of other features.
  // For now, keeping it as it was, but noting 'workletKnownGraph' is currently unused.
  const [_workletKnownGraph, setWorkletKnownGraph] = useState<AudioGraph>(() => useGraphStore.getState());


  const handleWorkletGraphUpdate = useCallback((newGraphOrUpdater: AudioGraph | ((prevGraph: AudioGraph) => AudioGraph)) => {
    console.warn('[App.tsx] handleWorkletGraphUpdate received update from useAudioInitialization.');
    setWorkletKnownGraph(prevGraph => { // Use functional update
      const newGraph = typeof newGraphOrUpdater === 'function' ? newGraphOrUpdater(prevGraph) : newGraphOrUpdater;
      // Example: Potentially call a store action to sync
      // useGraphStore.getState().loadGraph(convertToSerialized(newGraph)); // convertToSerialized would need to be implemented
      console.log('[App.tsx] Worklet known graph updated via functional update to:', newGraph);
      return newGraph;
    });
  }, [setWorkletKnownGraph]); // Dependency is now stable setWorkletKnownGraph

  const handleSetProcessorReadyFromAudioInit = useCallback(() => {
    console.warn(`[App.tsx] useAudioInitialization's setProcessorReady callback was invoked. App.tsx now uses direct message listening for processor handshake completion.`);
  }, []); // Memoized callback


  const {
    audioContextRef,
    workletNodeRef,
    audioInitialized // This should mean the AudioWorkletNode is created and module loaded
  } = useAudioInitialization({
    setAudioError: setAudioInitError,
    // IMPORTANT: App.tsx now handles the handshake completion itself via direct message listening.
    // This setProcessorReady from the hook might be for basic node readiness or could be problematic if it sets true too early for handshake.
    setProcessorReady: handleSetProcessorReadyFromAudioInit, // Use the memoized callback
    setAudioContextState: setCurrentAudioContextState,
    setAudioGraph: handleWorkletGraphUpdate,
  });

  // Effect to listen for the processor's readiness confirmation message
  useEffect(() => {
    if (audioInitialized && workletNodeRef.current && !processorHandshakeComplete) {
      const port = workletNodeRef.current.port;
      // This messageHandler is specific to processor readiness.
      const messageHandler = (event: MessageEvent<WorkletMessage>) => { // Changed type to WorkletMessage
        if (event.data.type === WorkletMessageType.PROCESSOR_READY) {
          console.log('[App.tsx] Received PROCESSOR_READY from worklet. Setting processorHandshakeComplete to true.');
          setProcessorHandshakeComplete(true);
        }
      };
      port.addEventListener('message', messageHandler);
      console.log('[App.tsx] Attached message listener for processor readiness confirmation.');
      return () => {
        port.removeEventListener('message', messageHandler);
        console.log('[App.tsx] Removed message listener for processor readiness confirmation.');
      };
    }
  }, [audioInitialized, workletNodeRef, processorHandshakeComplete, setProcessorHandshakeComplete]);


  // This hook sends CHECK_PROCESSOR_STATUS.
  // It relies on `processorHandshakeComplete` being false initially to send the check.
  useProcessorStatusCheck({
    audioContextState: currentAudioContextState,
    workletNodeRef,
    processorReady: processorHandshakeComplete,
  });

  // Initialize processor with the graph once the handshake is complete.
  const { initMessageSent } = useProcessorInitialization({
    processorReady: processorHandshakeComplete,
    workletNodeRef,
    audioContextRef,
    audioGraph: { nodes, routingMatrix, outputChannels, masterGain },
  });

  // Effect to handle messages from the worklet node if not fully handled by hooks
  useEffect(() => {
    if (workletNodeRef.current) {
      const port = workletNodeRef.current.port;
      const messageHandler = (_event: MessageEvent<WorkletMessage>) => { // Changed type to WorkletMessage
        // console.log("[App.tsx] Received message from worklet in App component:", _event.data);
        // Potentially handle messages here that useAudioInitialization doesn't,
        // or if more complex store updates are needed.
        // For example, if NODE_ADDED from worklet needs to call specific store.addNode variant.
      };
      port.addEventListener('message', messageHandler);
      return () => {
        port.removeEventListener('message', messageHandler);
      };
    }
  }, [workletNodeRef]);


  const handleResumeAudio = useCallback(async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          setCtxRunningInStore(true);
          setLastErrorMessage(null);
          console.log('Audio context resumed.');
        } catch (e) {
          const error = e as Error;
          console.error('Error resuming audio context:', error);
          setLastErrorMessage(`Failed to resume audio: ${error.message}`);
          setCtxRunningInStore(false);
        }
      } else {
        setCtxRunningInStore(audioContextRef.current.state === 'running');
      }
    } else {
      // This case might need re-evaluation: if audioContextRef.current is null,
      // useAudioInitialization likely hasn't succeeded.
      console.warn("Attempting to resume audio, but audioContextRef is not yet available.");
      setLastErrorMessage('Audio system not initialized, cannot resume.');
      setCtxRunningInStore(false);
    }
  }, [audioContextRef, setCtxRunningInStore, setLastErrorMessage]);


  const handleAddNode = useCallback((type: NodeType) => {
    if (!workletNodeRef.current || !processorHandshakeComplete) {
      setLastErrorMessage("Audio worklet not ready or handshake not complete to add node.");
      return;
    }
    const newNodeId = addNodeToStore(type);
    const newNodeInstance = getNodeById(newNodeId);

    if (newNodeInstance) {
      console.log('[App.tsx] Adding node to worklet:', newNodeInstance);
      workletNodeRef.current.port.postMessage({
        type: MainThreadMessageType.ADD_NODE,
        payload: { nodeInstance: newNodeInstance },
      });
    } else {
      console.error('[App.tsx] Failed to retrieve new node instance from store after adding.');
      setLastErrorMessage('Error adding node: instance not found after store update.');
    }
  }, [addNodeToStore, getNodeById, workletNodeRef, processorHandshakeComplete, setLastErrorMessage]);

  const handleParameterChange = useCallback((nodeId: NodeId, parameterId: ParameterId, value: ParameterValue) => {
    if (!workletNodeRef.current || !processorHandshakeComplete) {
      setLastErrorMessage("Audio worklet not ready or handshake not complete to update parameter.");
      return;
    }
    updateParamInStore(nodeId, parameterId, value);
    workletNodeRef.current.port.postMessage({
      type: MainThreadMessageType.UPDATE_PARAMETER,
      payload: { nodeId, parameterId, value },
    });
  }, [updateParamInStore, workletNodeRef, processorHandshakeComplete, setLastErrorMessage]);

  const handleNodeSelect = useCallback((nodeId: NodeId | null) => {
    setSelectedNodeIdInStore(nodeId);
  }, [setSelectedNodeIdInStore]);

  const selectedNodeInstance = selectedNodeId ? getNodeById(selectedNodeId) : null;

  // isLoading now depends on audioInitialized, processorHandshakeComplete, and initMessageSent
  // Adjusted logic for when the LoadingOverlay should be visible
  const showLoadingOverlay =
    !audioInitialized ||
    (currentAudioContextState === 'running' &&
      (!processorHandshakeComplete || !initMessageSent));

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <LayoutShell>
        <LoadingOverlay visible={showLoadingOverlay} overlayProps={{ radius: "sm", blur: 2 }} />
        <StatusDisplay
          audioError={audioInitError}
          audioInitialized={audioInitialized}
          audioContextState={currentAudioContextState}
          processorReady={processorHandshakeComplete}
          initMessageSent={initMessageSent}
        />
        <Controls
          onAddNode={handleAddNode}
          onAudioResume={() => { void handleResumeAudio(); }} // Wrap async call
          audioContextState={currentAudioContextState}
        />
        <Pedalboard>
          <NodeList
            nodes={nodes}
            onSelectNode={handleNodeSelect}
            selectedNodeId={selectedNodeId}
          />
          {selectedNodeInstance && (
            <NodeEditor
              selectedNode={selectedNodeInstance}
              onParameterChange={handleParameterChange}
            />
          )}
        </Pedalboard>
      </LayoutShell>
    </MantineProvider>
  );
}

export default App;
