import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { MantineProvider, Stack, LoadingOverlay, ScrollArea } from '@mantine/core';
import { theme } from './theme';
import NodeControls from './components/NodeControls';
import NodeList from './components/NodeList';
import NodeInspector from './components/NodeInspector';
import StatusDisplay from './components/StatusDisplay';
import Pedalboard from './components/Pedalboard';
import LayoutShell from './components/LayoutShell';
import TransportBar from './components/TransportBar';
import MatrixCanvas from './components/MatrixCanvas';
import { ModulationPanel } from './components/ModulationPanel';

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
  type UpdateGraphMessage,
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
  routingMatrix: initializeRoutingMatrix(1, initialOutputChannels),
  outputChannels: initialOutputChannels,
  masterGain: initialMasterGain,
  isMono: true, // Default to mono mode
  chaosLevel: 0, // Default chaos level

  // Default LFO settings
  lfo1: {
    enabled: false,
    frequency: 1.0, // 1 Hz
    waveform: 'sine',
    amount: 0,
  },
  lfo2: {
    enabled: false,
    frequency: 0.5, // 0.5 Hz
    waveform: 'triangle',
    amount: 0,
  },

  // Default envelope follower settings
  envelopeFollower1: {
    enabled: false,
    attack: 0.01, // 10ms
    release: 0.1, // 100ms
    amount: 0,
    source: null,
  },
  envelopeFollower2: {
    enabled: false,
    attack: 0.05, // 50ms
    release: 0.5, // 500ms
    amount: 0,
    source: null,
  },
};

function App() {
  const appInitializationTimeRef = useRef<number>(Date.now());
  const [audioGraph, setAudioGraph] = useState<AudioGraph>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [processorReady, setProcessorReady] = useState<boolean>(false);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [globalParameters, setGlobalParameters] = useState<Record<string, number>>({
    chaos: 0,
    masterGain: initialMasterGain
  });
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isMono, setIsMono] = useState<boolean>(true); // Default to mono mode

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
    audioInitialized,
    appInitializationTime: appInitializationTimeRef.current, // Pass the ref's current value
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
          const errorMessage = e instanceof Error ? e.message : String(e);
          setAudioError(`Error resuming audio: ${errorMessage}`);
          console.error('Error resuming audio:', e);
        }
      }
    } else {
      console.warn("Attempting to resume audio, but audioContextRef is not yet available.");
      setAudioError('Audio system not initialized, cannot resume.');
    }
  }, [audioContextRef]); // Removed setAudioError from deps as it's set inside

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

  const handleParameterChange = useCallback(
    (nodeId: NodeId, parameterId: ParameterId, value: ParameterValue) => {
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
    },
    [workletNodeRef, processorReady, audioInitialized, setAudioGraph]
  );

  const handleModulationChange = useCallback(
    (
      nodeId: NodeId,
      parameterId: string,
      source: 'lfo1' | 'lfo2' | 'env1' | 'env2',
      enabled: boolean,
      amount = 0
    ) => {
      if (!workletNodeRef.current || !audioInitialized || !processorReady) {
        setAudioError('Audio system not ready. Cannot update modulation.');
        return;
      }

      setAudioGraph(prevGraph => {
        const updatedGraph = { ...prevGraph };
        const nodeIndex = updatedGraph.nodes.findIndex(n => n.id === nodeId);

        if (nodeIndex === -1) {
          console.error(`[App.tsx] Node with ID ${nodeId} not found for modulation update.`);
          return prevGraph;
        }

        // Initialize modulation object if it doesn't exist
        const node = { ...updatedGraph.nodes[nodeIndex] };
        node.modulation = node.modulation ?? {};

        // Initialize parameter modulation if it doesn't exist
        node.modulation[parameterId] = node.modulation[parameterId] ?? {};

        // Update the specific modulation source
        node.modulation[parameterId][source] = {
          enabled,
          amount
        };

        // Update the node in the graph
        updatedGraph.nodes[nodeIndex] = node;

        // Send the updated graph to the worklet
        if (workletNodeRef.current) {
          const message: UpdateGraphMessage = {
            type: MainThreadMessageType.UPDATE_GRAPH,
            payload: { graph: updatedGraph },
          };
          workletNodeRef.current.port.postMessage(message);
          console.log(`[App.tsx] Sent UPDATE_GRAPH message after modulation change for ${nodeId}.${parameterId} (${source}): ${enabled ? 'enabled' : 'disabled'}, amount: ${amount}`);
        }

        return updatedGraph;
      });
    },
    [workletNodeRef, audioInitialized, processorReady, setAudioGraph]
  );

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

  console.log('[App.tsx] Evaluating showLoadingOverlay:', {
    audioInitialized,
    audioContextState,
    processorReady,
    initMessageSent,
  });

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

  const handleMonoToggle = (value: boolean) => {
    setIsMono(value);

    // Update the audio graph with new mono setting
    setAudioGraph(prevGraph => {
      const updatedGraph = {
        ...prevGraph,
        isMono: value
      };

      // Only send the update if the processor is ready
      if (workletNodeRef.current && processorReady) {
        const message: UpdateGraphMessage = {
          type: MainThreadMessageType.UPDATE_GRAPH,
          payload: { graph: updatedGraph },
        };
        workletNodeRef.current.port.postMessage(message);
        console.log('[App.tsx] Sent UPDATE_GRAPH message after mono toggle:', updatedGraph);
      }

      return updatedGraph;
    });
  };

  const handleLFOParameterChange = (lfoNumber: 1 | 2, paramName: string, value: number | string | boolean) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot update LFO settings.');
      return;
    }

    setAudioGraph(prevGraph => {
      const lfoKey = `lfo${lfoNumber}` as const;
      const currentLfo = prevGraph[lfoKey] ?? {
        enabled: false,
        frequency: lfoNumber === 1 ? 1.0 : 0.5,
        waveform: lfoNumber === 1 ? 'sine' : 'triangle',
        amount: 0
      };

      // Create updated LFO settings with the new parameter value
      const updatedLfo = {
        ...currentLfo,
        [paramName]: value
      };

      // Create updated graph with new LFO settings
      const updatedGraph = {
        ...prevGraph,
        [lfoKey]: updatedLfo
      };

      // Send the updated graph to the worklet
      if (workletNodeRef.current) {
        const message: UpdateGraphMessage = {
          type: MainThreadMessageType.UPDATE_GRAPH,
          payload: { graph: updatedGraph },
        };
        workletNodeRef.current.port.postMessage(message);
        console.log(`[App.tsx] Sent UPDATE_GRAPH message after LFO${lfoNumber} parameter change: ${paramName} = ${value}`);
      }

      return updatedGraph;
    });
  };

  const handleEnvelopeFollowerChange = (envNumber: 1 | 2, paramName: string, value: number | string | boolean | null) => {
    if (!workletNodeRef.current || !audioInitialized || !processorReady) {
      setAudioError('Audio system not ready. Cannot update envelope follower settings.');
      return;
    }

    setAudioGraph(prevGraph => {
      const envKey = `envelopeFollower${envNumber}` as const;
      const currentEnv = prevGraph[envKey] ?? {
        enabled: false,
        attack: envNumber === 1 ? 0.01 : 0.05,
        release: envNumber === 1 ? 0.1 : 0.5,
        amount: 0,
        source: null
      };

      // Create updated envelope follower settings with the new parameter value
      const updatedEnv = {
        ...currentEnv,
        [paramName]: value
      };

      // Create updated graph with new envelope follower settings
      const updatedGraph = {
        ...prevGraph,
        [envKey]: updatedEnv
      };

      // Send the updated graph to the worklet
      if (workletNodeRef.current) {
        const message: UpdateGraphMessage = {
          type: MainThreadMessageType.UPDATE_GRAPH,
          payload: { graph: updatedGraph },
        };
        workletNodeRef.current.port.postMessage(message);
        console.log(`[App.tsx] Sent UPDATE_GRAPH message after ENV${envNumber} parameter change: ${paramName} = ${value}`);
      }

      return updatedGraph;
    });
  };

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <LayoutShell>
        <Pedalboard>
          <TransportBar
            audioContextState={audioContextState} // Pass audioContextState directly
            isRecording={isRecording}
            onPlayPause={() => void handlePlayPause()} // Ensure void return for onPlayPause
            onRecord={handleRecord}
            chaosValue={globalParameters.chaos * 100} // Assuming chaos is 0-1 in state, UI wants 0-100
            onChaosChange={handleChaosChange}
            isMono={isMono}
            onMonoToggle={handleMonoToggle}
          />
          <ModulationPanel
            lfo1={audioGraph.lfo1 ?? {
              enabled: false,
              frequency: 1.0,
              waveform: 'sine',
              amount: 0,
            }}
            lfo2={audioGraph.lfo2 ?? {
              enabled: false,
              frequency: 0.5,
              waveform: 'triangle',
              amount: 0,
            }}
            env1={audioGraph.envelopeFollower1 ?? {
              enabled: false,
              attack: 0.01,
              release: 0.1,
              amount: 0,
              source: null,
            }}
            env2={audioGraph.envelopeFollower2 ?? {
              enabled: false,
              attack: 0.05,
              release: 0.5,
              amount: 0,
              source: null,
            }}
            availableNodeIds={audioGraph.nodes.map(node => ({
              id: node.id,
              label: node.label ?? node.type
            }))}
            chaosValue={globalParameters.chaos * 100}
            onLFOChange={handleLFOParameterChange}
            onEnvChange={handleEnvelopeFollowerChange}
            onChaosChange={handleChaosChange}
          />
          <NodeControls
            onAddNode={handleAddNode}
            onAudioResume={() => void handleResumeAudio()} // Ensure void return
            audioContextState={audioContextState}
          />
          <NodeList
            nodes={audioGraph.nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleNodeSelect}
            onRemoveNode={handleRemoveNode}
          />
          <NodeInspector
            key={selectedNodeInstance?.id} // Ensure re-render on node change
            selectedNode={selectedNodeInstance}
            onParameterChange={handleParameterChange}
            onModulationChange={handleModulationChange}
          />
          <ScrollArea style={{ height: '100%', width: '100%' }}>
            <Stack justify="center">
              <MatrixCanvas
                audioGraph={audioGraph}
                onMatrixCellClick={handleMatrixCellClick}
              />
            </Stack>
          </ScrollArea>
        </Pedalboard>
      </LayoutShell>
      <LoadingOverlay
        visible={showLoadingOverlay}
        overlayProps={{ radius: 'sm', blur: 2 }}
        loaderProps={{ children: 'Initializing Audio Engine...' }}
      />
    </MantineProvider>
  );
}

export default App;
