import { useState, useEffect, useCallback } from 'react';
import { MantineProvider, AppShell, LoadingOverlay } from '@mantine/core';
import { theme } from './theme';
import './App.css';

import Header from './components/Header/Header';
import Controls from './components/Controls/Controls';
import Pedalboard from './components/Pedalboard/Pedalboard';
import NodeList from './components/NodeList/NodeList';
import NodeEditor from './components/NodeEditor/NodeEditor';
import StatusDisplay from './components/StatusDisplay/StatusDisplay';

import { useAudioInitialization } from './hooks/useAudioInitialization';
import { useProcessorInitialization } from './hooks/useProcessorInitialization';

import { useGraphStore } from './stores/graph';
import { useUIStore } from './stores/ui';
import {
  type NodeId,
  type ParameterId,
  type ParameterValue,
  type NodeType,
  MainThreadMessageType,
  type AudioGraph,
  WorkletMessageType,
} from './audio/schema';
import { getAudioContext } from './audio';

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
    lastErrorMessage, // Keep this for potential direct display or logging
    // isAudioContextRunning: isCtxRunningFromStore, // Removed as Controls uses audioContextState
    selectNode: setSelectedNodeIdInStore,
    setLastErrorMessage,
    setAudioContextRunning: setCtxRunningInStore, // Keep for updating store after resume
  } = useUIStore();

  // Local state for App.tsx
  const [audioInitError, setAudioInitError] = useState<string | null>(null);
  const [localProcessorReady, setLocalProcessorReady] = useState(false);
  const [currentAudioContextState, setCurrentAudioContextState] = useState<AudioContext['state'] | null>(null);

  // This state represents the graph as known by the worklet, potentially.
  // For now, it's a placeholder for what useAudioInitialization's setAudioGraph would update.
  const [workletKnownGraph, setWorkletKnownGraph] = useState<AudioGraph>(() => useGraphStore.getState());


  const handleWorkletGraphUpdate = useCallback((newGraphOrUpdater: AudioGraph | ((prevGraph: AudioGraph) => AudioGraph)) => {
    console.warn('[App.tsx] handleWorkletGraphUpdate called by useAudioInitialization.');
    // This function is called by useAudioInitialization when the worklet sends graph updates.
    // It needs to reconcile the worklet's graph state with the Zustand store.
    // This is a simplified placeholder. A robust solution would involve:
    // 1. Transforming the AudioGraph (from worklet) to SerializedAudioGraph (for store.loadGraph)
    // 2. Or, having more granular messages from worklet (NODE_ADDED_CONFIRMED, etc.)
    //    that trigger specific store actions.
    const newGraph = typeof newGraphOrUpdater === 'function' ? newGraphOrUpdater(workletKnownGraph) : newGraphOrUpdater;
    setWorkletKnownGraph(newGraph); // Update local representation
    // Example: Potentially call a store action to sync
    // useGraphStore.getState().loadGraph(convertToSerialized(newGraph)); // convertToSerialized would need to be implemented
    console.log('[App.tsx] Worklet known graph updated:', newGraph);
  }, [workletKnownGraph]);


  const { audioContextRef, workletNodeRef, audioInitialized } = useAudioInitialization({
    setAudioError: setAudioInitError,
    setProcessorReady: setLocalProcessorReady,
    setAudioContextState: setCurrentAudioContextState,
    setAudioGraph: handleWorkletGraphUpdate,
  });

  // Initialize processor once ready
  const { initMessageSent } = useProcessorInitialization({
    processorReady: localProcessorReady,
    workletNodeRef,
    audioContextRef,
    audioGraph: { nodes, routingMatrix, outputChannels, masterGain },
  });

  // Effect to handle messages from the worklet node if not fully handled by hooks
  useEffect(() => {
    if (workletNodeRef.current) {
      const port = workletNodeRef.current.port;
      const messageHandler = (_event: MessageEvent<WorkletMessageType>) => {
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
          setCtxRunningInStore(true); // Update store
          setLastErrorMessage(null);
          console.log('Audio context resumed.');
        } catch (e) {
          const error = e as Error;
          console.error('Error resuming audio context:', error);
          setLastErrorMessage(`Failed to resume audio: ${error.message}`);
          setCtxRunningInStore(false); // Update store
        }
      } else {
        setCtxRunningInStore(audioContextRef.current.state === 'running'); // Update store based on actual state
      }
    } else {
      console.log("Attempting to re-initialize audio context for resume");
      try {
        const context = getAudioContext();
        await context.resume();
        setCtxRunningInStore(true); // Update store
      } catch (e) {
        const error = e as Error;
        setLastErrorMessage(`Failed to initialize/resume audio: ${error.message}`);
        setCtxRunningInStore(false); // Update store
      }
    }
  }, [audioContextRef, setCtxRunningInStore, setLastErrorMessage]);

  const handleAddNode = useCallback((type: NodeType) => {
    if (!workletNodeRef.current) {
      setLastErrorMessage("Audio worklet not available to add node.");
      return;
    }
    const newNodeId = addNodeToStore(type); // This adds to Zustand store
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
  }, [addNodeToStore, getNodeById, workletNodeRef, setLastErrorMessage]);

  const handleParameterChange = useCallback((nodeId: NodeId, parameterId: ParameterId, value: ParameterValue) => {
    if (!workletNodeRef.current) {
      setLastErrorMessage("Audio worklet not available to update parameter.");
      return;
    }
    updateParamInStore(nodeId, parameterId, value); // Update Zustand store
    // Send update to AudioWorklet
    workletNodeRef.current.port.postMessage({
      type: MainThreadMessageType.UPDATE_PARAMETER,
      payload: { nodeId, parameterId, value },
    });
  }, [updateParamInStore, workletNodeRef, setLastErrorMessage]);

  const handleNodeSelect = useCallback((nodeId: NodeId | null) => {
    setSelectedNodeIdInStore(nodeId);
  }, [setSelectedNodeIdInStore]);

  const selectedNodeInstance = selectedNodeId ? getNodeById(selectedNodeId) : null;


  const isLoading = !audioInitialized || !localProcessorReady || !initMessageSent;

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <AppShell
        header={{ height: 60 }}
        padding="md"
      >
        <AppShell.Header>
          <Header />
        </AppShell.Header>

        <AppShell.Main>
          <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} />
          <StatusDisplay
            audioError={audioInitError}
            audioInitialized={audioInitialized}
            audioContextState={currentAudioContextState}
            processorReady={localProcessorReady}
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
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
