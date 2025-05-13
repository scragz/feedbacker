import { useState, useEffect, useCallback } from 'react';
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

import { useAudioInitialization } from './hooks/useAudioInitialization';
import { useProcessorInitialization } from './hooks/useProcessorInitialization';
import { useProcessorStatusCheck } from './hooks/useProcessorStatusCheck';

import {
  type NodeId,
  type ParameterId,
  type ParameterValue,
  type NodeType,
  MainThreadMessageType,
  type WorkletMessage, // Keep this for event listener type if needed elsewhere
  WorkletMessageType, // Keep this for event listener type if needed elsewhere
  type AudioGraph,
  type AudioNodeInstance,
  NODE_PARAMETER_DEFINITIONS,
  type MainThreadMessage,
  type RoutingMatrix,
} from './audio/schema';

// Initial state setup directly in App.tsx
const initialOutputChannels = 2;
const initialMasterGain = 0.8;

const createInitialOutputMixerNode = (): AudioNodeInstance => {
  const nodeId = nanoid(10);
  return {
    id: nodeId,
    type: 'output_mixer',
    parameters: NODE_PARAMETER_DEFINITIONS.output_mixer // Assuming output_mixer is always defined
      ? Object.fromEntries(
          Object.entries(NODE_PARAMETER_DEFINITIONS.output_mixer).map(([paramId, def]) => [
            paramId,
            def.defaultValue,
          ]),
        )
      : {},
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

  const {
    audioContextRef,
    workletNodeRef,
    audioInitialized,
  } = useAudioInitialization({
    setAudioGraph,
    setAudioError,
    setProcessorReady,
    setAudioContextState,
  });

  // Effect to listen for the processor's readiness confirmation message
  // This remains important as useAudioInitialization sets up the listener for graph updates,
  // but explicit processor readiness confirmation might still be handled here or in the hook.
  // The hook already sets processorReady on PROCESSOR_READY message.
  // This useEffect might be redundant if useAudioInitialization fully covers it.
  // For now, let's assume useAudioInitialization handles setProcessorReady correctly.

  useEffect(() => {
    if (audioInitialized && workletNodeRef.current && !processorReady) {
      const port = workletNodeRef.current.port;
      // This messageHandler is specific to processor readiness.
      const messageHandler = (event: MessageEvent<WorkletMessage>) => {
        if (event.data.type === WorkletMessageType.PROCESSOR_READY) {
          console.log('[App.tsx] Received PROCESSOR_READY from worklet. Setting processorReady to true.');
          setProcessorReady(true);
        }
      };
      port.addEventListener('message', messageHandler);
      console.log('[App.tsx] Attached message listener for processor readiness confirmation.');
      return () => {
        port.removeEventListener('message', messageHandler);
        console.log('[App.tsx] Removed message listener for processor readiness confirmation.');
      };
    }
  }, [audioInitialized, workletNodeRef, processorReady, setProcessorReady]);

  // This hook sends CHECK_PROCESSOR_STATUS.
  // It relies on `processorReady` being false initially to send the check.
  useProcessorStatusCheck({
    audioContextState,
    workletNodeRef,
    processorReady,
  });

  const { initMessageSent } = useProcessorInitialization({
    audioInitialized, // Corrected: Pass audioInitialized instead of processorReady
    workletNodeRef,
    audioContextRef,
    audioGraph, // Pass the local audioGraph state
  });

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
    return audioGraph.nodes.find(n => n.id === nodeId) ?? null; // Changed || to ??
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
      label: type, // Or a more descriptive label
      uiPosition: { x: Math.random() * 300, y: Math.random() * 200 },
    };

    setAudioGraph(prevGraph => {
      const newNodes = [...prevGraph.nodes, newNodeInstance];
      // The routing matrix will be updated by the worklet via GRAPH_UPDATED message
      // or if this app takes full ownership, it should resize it here.
      // For now, assume worklet handles it or sends a full graph back.
      return { ...prevGraph, nodes: newNodes };
    });

    console.log('[App.tsx] Adding node to worklet:', newNodeInstance);
    const message: MainThreadMessage = {
        type: MainThreadMessageType.ADD_NODE,
        payload: { nodeInstance: newNodeInstance },
    };
    workletNodeRef.current.port.postMessage(message);

  }, [workletNodeRef, audioInitialized, processorReady, setAudioGraph]);

  const handleRemoveNode = useCallback((nodeId: NodeId) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot remove node.');
      return;
    }

    setAudioGraph(prevGraph => ({
      ...prevGraph,
      nodes: prevGraph.nodes.filter(n => n.id !== nodeId),
    }));
    setSelectedNodeId(prevSelected => prevSelected === nodeId ? null : prevSelected);

    const message: MainThreadMessage = {
        type: MainThreadMessageType.REMOVE_NODE,
        payload: { nodeId },
    };
    workletNodeRef.current.port.postMessage(message);
  }, [workletNodeRef, audioInitialized, processorReady, setAudioGraph]);

  const handleParameterChange = useCallback((nodeId: NodeId, parameterId: ParameterId, value: ParameterValue) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot change parameter.');
      return;
    }
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
  }, [workletNodeRef, audioInitialized, processorReady, setAudioGraph]);

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

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <LayoutShell
        appHeader={<Header title="MFN Web Audio Feedbacker" />}
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
            {/* MatrixCanvas could be rendered here if it needs access to App.tsx state */}
            {/* or passed audioGraph directly */}
            {/* <MatrixCanvas audioGraph={audioGraph} /> */}
          </Pedalboard>
        </Stack>
      </LayoutShell>
      <LoadingOverlay visible={showLoadingOverlay} overlayProps={{ radius: "sm", blur: 2 }} />
    </MantineProvider>
  );
}

export default App;
