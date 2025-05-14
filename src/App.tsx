import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MantineProvider, LoadingOverlay, Stack, ScrollArea } from '@mantine/core';
import { theme } from './theme';
import { nanoid } from 'nanoid';

import LayoutShell from './components/LayoutShell/LayoutShell';
import Header from './components/Header/Header';
import TransportBar from './components/TransportBar/TransportBar';
import Controls from './components/Controls/Controls';
import Pedalboard from './components/Pedalboard/Pedalboard';
import NodeList from './components/NodeList/NodeList';
import NodeInspector from './components/NodeInspector/NodeInspector';
import StatusDisplay from './components/StatusDisplay/StatusDisplay';
import MatrixCanvas from './components/MatrixCanvas'; // Added import

import { useAudioInitialization } from './hooks/useAudioInitialization';
import { useProcessorInitialization } from './hooks/useProcessorInitialization';
import { useProcessorStatusCheck } from './hooks/useProcessorStatusCheck';

import {
  type NodeId,
  type ParameterId,
  type ParameterValue,
  type NodeType,
  MainThreadMessageType,
  type AudioGraph,
  type AudioNodeInstance,
  NODE_PARAMETER_DEFINITIONS,
  type MainThreadMessage,
  type RoutingMatrix,
  type UpdateGraphMessage, // Added import
} from './audio/schema';

// Initial state setup directly in App.tsx
const initialOutputChannels = 2;
const initialMasterGain = 0.8;

const createInitialOutputMixerNode = (): AudioNodeInstance => {
  const nodeId = nanoid(10);
  const paramsDefinition = NODE_PARAMETER_DEFINITIONS.output_mixer; // Assuming this always exists
  return {
    id: nodeId,
    type: 'output_mixer',
    // Directly use paramsDefinition if it's guaranteed to exist
    parameters: Object.fromEntries(
      Object.entries(paramsDefinition).map(([paramId, def]) => [
        paramId,
        def.defaultValue,
      ])
    ),
    label: 'Output Mixer',
    uiPosition: { x: 50, y: 50 },
  };
};

const initialOutputMixer = createInitialOutputMixerNode();

const initializeRoutingMatrix = (nodeCount: number, channelCount: number): RoutingMatrix => {
  const matrix: RoutingMatrix = [];
  for (let i = 0; i < channelCount; i++) {
    matrix[i] = [];
    for (let j = 0; j < nodeCount; j++) {
      const row: number[] = Array<number>(nodeCount).fill(0); // Explicitly typed array
      matrix[i][j] = row;
    }
  }
  return matrix;
};

const initialGraph: AudioGraph = {
  nodes: [initialOutputMixer],
  routingMatrix: initializeRoutingMatrix(1, initialOutputChannels), // 1 initial node
  outputChannels: initialOutputChannels,
  masterGain: initialMasterGain,
};

function App() {
  const [audioGraph, setAudioGraph] = useState<AudioGraph>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [processorReady, setProcessorReady] = useState<boolean>(false);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [globalParameters, setGlobalParameters] = useState<Record<string, number>>({ chaos: 0 });
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [appStatus, setAppStatus] = useState<string>('Initializing application...');
  const [appWorkletError, setAppWorkletError] = useState<WorkletErrorPayload | null>(null);

  // Memoized callback for when the processor is ready
  const handleProcessorReadyAppCallback = useCallback(() => {
    console.log('App.tsx: onProcessorReady callback (from useAudioInitialization) triggered.');
    // App-specific logic to run after processor is marked ready can go here.
    // The core setProcessorReady(true) is handled directly by useAudioInitialization.
  }, []);

  const handleGraphUpdateMessage = useCallback((graph: AudioGraph) => {
    setAudioGraph(graph);
  }, [setAudioGraph]);

  const handleParameterUpdateMessage = useCallback(({ nodeId, parameterId, value }: ParameterUpdatePayload) => {
    setAudioGraph(prevGraph => ({
      ...prevGraph,
      nodes: prevGraph.nodes.map(n =>
        n.id === nodeId
          ? { ...n, parameters: { ...n.parameters, [parameterId]: value } }
          : n
      ),
    }));
  }, [setAudioGraph]);

  const handleWorkletErrorMessage = useCallback((error: WorkletErrorPayload) => {
    console.error('[App] Received WORKLET_ERROR:', error.message);
    setAppStatus(`Worklet Error: ${error.message}`);
    setAppWorkletError(error);
  }, [setAppStatus, setAppWorkletError]); // Added setAppWorkletError

  const {
    audioContextRef, // Corrected: was audioContext
    workletNodeRef,
    audioInitialized,
  } = useAudioInitialization({
    // State setters for the hook to update App.tsx state
    setAudioGraph: setAudioGraph,
    setAudioError: setAudioError,
    setProcessorReady: setProcessorReady,
    setAudioContextState: setAudioContextState,
  });

  const {
    initMessageSent,
  } = useProcessorInitialization({
    audioInitialized,
    workletNodeRef,
    audioContextRef,
    audioGraph,
  });

  useProcessorStatusCheck({
    audioContextState,
    workletNodeRef,
    processorReady,
  });

  // Effect to clear selectedNodeId if it's no longer in the graph
  useEffect(() => {
    if (selectedNodeId && !audioGraph.nodes.find(n => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [audioGraph, selectedNodeId]); // Removed setSelectedNodeId from deps as it causes loop if used directly

  const handleResumeAudio = useCallback(async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          setAudioError(null);
          console.log('Audio context resumed.');
        } catch (e) {
          const error = e as Error;
          console.error('Error resuming audio context:', error);
          setAudioError(`Failed to resume audio: ${error.message}`);
        }
      }
    } else {
      console.warn("Attempting to resume audio, but audioContextRef is not yet available.");
      setAudioError('Audio system not initialized, cannot resume.');
    }
  }, [audioContextRef]);

  const getNodeById = useCallback((nodeId: NodeId | null): AudioNodeInstance | null => {
    if (!nodeId) return null;
    return audioGraph.nodes.find(n => n.id === nodeId) ?? null;
  }, [audioGraph.nodes]);

  const handleAddNode = useCallback((type: NodeType) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot add node.');
      console.warn('handleAddNode: Audio system not ready.');
      return;
    }

    const newNodeId: NodeId = nanoid(10);
    const nodeParamsDefinition = NODE_PARAMETER_DEFINITIONS[type];
    const defaultParameters: Record<ParameterId, ParameterValue> = {};
    for (const paramId in nodeParamsDefinition) {
      if (Object.prototype.hasOwnProperty.call(nodeParamsDefinition, paramId)) {
        defaultParameters[paramId] = nodeParamsDefinition[paramId].defaultValue;
      }
    }

    const newNodeInstance: AudioNodeInstance = {
      id: newNodeId,
      type,
      parameters: defaultParameters,
      label: type,
      uiPosition: { x: Math.random() * 300, y: Math.random() * 200 },
    };

    // DO NOT update local state optimistically. Wait for GRAPH_UPDATED from worklet.
    // setAudioGraph(prevGraph => {
    //   const newNodes = [...prevGraph.nodes, newNodeInstance];
    //   return { ...prevGraph, nodes: newNodes };
    // });

    console.log('[App.tsx] Requesting worklet to add node:', newNodeInstance);
    const message: MainThreadMessage = {
        type: MainThreadMessageType.ADD_NODE,
        payload: { nodeInstance: newNodeInstance },
    };
    workletNodeRef.current.port.postMessage(message);

  }, [workletNodeRef, audioInitialized, processorReady, setAudioError]); // Removed setAudioGraph from deps

  const handleRemoveNode = useCallback((nodeId: NodeId) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot remove node.');
      return;
    }

    // DO NOT update local state optimistically. Wait for GRAPH_UPDATED from worklet.
    // setAudioGraph(prevGraph => ({
    //   ...prevGraph,
    //   nodes: prevGraph.nodes.filter(n => n.id !== nodeId),
    // }));
    // setSelectedNodeId(prevSelected => prevSelected === nodeId ? null : prevSelected);

    console.log('[App.tsx] Requesting worklet to remove node:', nodeId);
    const message: MainThreadMessage = {
        type: MainThreadMessageType.REMOVE_NODE,
        payload: { nodeId },
    };
    workletNodeRef.current.port.postMessage(message);
  }, [workletNodeRef, audioInitialized, processorReady, setAudioError]); // Removed setAudioGraph & setSelectedNodeId from deps

  const handleParameterChange = useCallback((nodeId: NodeId, parameterId: ParameterId, value: ParameterValue) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot change parameter.');
      return;
    }
    // Optimistically update local state for responsiveness for parameter changes.
    // The worklet will also send PARAMETER_UPDATED, which useAudioInitialization handles,
    // potentially causing a re-set, but this is usually fine for params.
    setAudioGraph(prevGraph => ({
      ...prevGraph,
      nodes: prevGraph.nodes.map(n =>
        n.id === nodeId
          ? { ...n, parameters: { ...n.parameters, [parameterId]: value } }
          : n
      ),
    }));

    const message: MainThreadMessage = {
      type: MainThreadMessageType.UPDATE_PARAMETER,
      payload: { nodeId, parameterId, value },
    };
    workletNodeRef.current.port.postMessage(message);
  }, [workletNodeRef, audioInitialized, processorReady, setAudioGraph, setAudioError]);

  const handleGlobalParameterChange = useCallback((parameterId: string, value: number) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot change global parameter.');
      return;
    }
    setGlobalParameters(prev => ({ ...prev, [parameterId]: value }));

    const message: MainThreadMessage = {
      type: MainThreadMessageType.SET_GLOBAL_PARAMETER,
      payload: { parameterId, value },
    };
    workletNodeRef.current.port.postMessage(message);
  }, [workletNodeRef, audioInitialized, processorReady]);

  const handleNodeSelect = useCallback((nodeId: NodeId | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectedNodeInstance = getNodeById(selectedNodeId);

  const showLoadingOverlay =
    !audioInitialized ||
    (audioContextState === 'running' &&
      (!processorReady || !initMessageSent));

  const handlePlayPause = async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'running') {
        await audioContextRef.current.suspend();
        console.log('Audio context suspended.');
      } else if (audioContextRef.current.state === 'suspended') {
        await handleResumeAudio();
      }
    } else {
      setAudioError('Audio system not initialized.');
    }
  };

  const handleRecord = () => {
    setIsRecording(prev => !prev);
    setAudioError(`Recording ${!isRecording ? 'started' : 'stopped'} (placeholder).`);
  };

  const handleChaosChange = (value: number) => {
    handleGlobalParameterChange('chaos', value / 100); // Normalize to 0-1 for worklet
    console.log('Chaos value changed (0-100 for UI, 0-1 for worklet):', value);
  };

  const handleMatrixCellClick = useCallback(
    (channelIndex: number, sourceNodeId: NodeId, targetNodeId: NodeId, newWeight: number) => {
      if (!workletNodeRef.current || !audioInitialized || !processorReady) {
        setAudioError('Audio system not ready. Cannot update matrix.');
        return;
      }

      setAudioGraph(prevGraph => {
        const newMatrix = prevGraph.routingMatrix.map(channelMatrix =>
          channelMatrix.map(row => [...row])
        );

        const sourceNodeIndex = prevGraph.nodes.findIndex(n => n.id === sourceNodeId);
        const targetNodeIndex = prevGraph.nodes.findIndex(n => n.id === targetNodeId);

        if (sourceNodeIndex === -1 || targetNodeIndex === -1) {
          console.error('[App.tsx] handleMatrixCellClick: Invalid node ID for matrix update.');
          return prevGraph;
        }

        // Assuming channelIndex, sourceNodeIndex, and targetNodeIndex are valid
        // and newMatrix is structured correctly based on prevGraph.
        // If these assumptions hold, direct assignment is safe.
        newMatrix[channelIndex][sourceNodeIndex][targetNodeIndex] = newWeight;

        const updatedGraph = { ...prevGraph, routingMatrix: newMatrix };

        const message: UpdateGraphMessage = {
          type: MainThreadMessageType.UPDATE_GRAPH,
          payload: { graph: updatedGraph },
        };
        workletNodeRef.current?.port.postMessage(message);
        console.log('[App.tsx] Sent UPDATE_GRAPH message after matrix cell click:', updatedGraph);

        return updatedGraph;
      });
    },
    [workletNodeRef, audioInitialized, processorReady, setAudioGraph]
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <LayoutShell
        appHeader={<Header title="Feedbacker" />}
        transportBar={(
          <TransportBar
            audioContextState={audioContextState}
            onPlayPause={() => { void handlePlayPause(); }}
            onRecord={handleRecord}
            chaosValue={globalParameters.chaos * 100} // Scale back to 0-100 for UI
            onChaosChange={handleChaosChange}
            isRecording={isRecording}
          />
        )}
      >
        <Stack gap="md">
          <StatusDisplay
            audioError={audioError} // Use local audioError state
            audioInitialized={audioInitialized}
            audioContextState={audioContextState}
            processorReady={processorReady} // Use local processorReady state
            initMessageSent={initMessageSent}
          />
          <Controls
            onAddNode={handleAddNode}
            onAudioResume={() => { void handleResumeAudio(); }}
            audioContextState={audioContextState}
          />
          <ScrollArea style={{ height: 'calc(30vh - 60px)', minHeight: 150 }}>
            <NodeList
              nodes={audioGraph.nodes} // Use nodes from local audioGraph state
              onSelectNode={handleNodeSelect}
              selectedNodeId={selectedNodeId}
              onRemoveNode={handleRemoveNode} // Pass remove handler
            />
          </ScrollArea>
          {selectedNodeInstance && (
            <NodeInspector
              key={selectedNodeInstance.id} // Add key for re-rendering on node change
              selectedNode={selectedNodeInstance}
              onParameterChange={handleParameterChange}
            />
          )}
          <Pedalboard>
            <MatrixCanvas audioGraph={audioGraph} onMatrixCellClick={handleMatrixCellClick} />
          </Pedalboard>
        </Stack>
      </LayoutShell>
      <LoadingOverlay visible={showLoadingOverlay} overlayProps={{ radius: "sm", blur: 2 }} />
    </MantineProvider>
  );
}

export default App;
