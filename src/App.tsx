import './App.css';
import { Flex } from '@mantine/core';
import { useEffect, useState } from 'react';

// Component Imports (assuming default exports)
import Pedalboard from './components/Pedalboard/Pedalboard';
import Controls from './components/Controls/Controls';
import StatusDisplay from './components/StatusDisplay/StatusDisplay';
import NodeEditor from './components/NodeEditor/NodeEditor';
import { LayoutShell } from './components/LayoutShell/LayoutShell';

// Hook Imports
import { useAudioInitialization } from './hooks/useAudioInitialization';
import { useProcessorInitialization } from './hooks/useProcessorInitialization';
import { useProcessorStatusCheck } from './hooks/useProcessorStatusCheck';

// Store Imports
import { useGraphStore } from './stores/graph';
import { useUIStore } from './stores/ui';

// Bridge Imports
import {
  initAudioBridge,
  sendInitRequestToProcessor,
  sendParameterUpdateToProcessor,
  resumeAudioContext, // Assuming this function uses the initialized audioContextRef from the bridge
} from './lib/bridge';

import type { AudioGraph, NodeId, ParameterId, AudioNode as AudioNodeType, SerializedAudioGraph, AudioContextState, MFNWorkletNode } from './audio/schema'; // Ensure MFNWorkletNode is exported or defined

const INITIAL_CHANNELS = 2; // Or get from a config

function App() {
  const {
    graph,
    addNode: addNodeToStore,
    removeNode: removeNodeFromStore, // Assuming this exists
    updateNodeParameter: updateParamInStore,
    loadGraph: loadGraphInStore,
    getSerializedGraph,
  } = useGraphStore();

  const {
    selectedNodeId,
    isAudioContextRunning,
    lastErrorMessage,
    selectNode, // Assuming this exists
    setAudioContextRunning,
    setLastErrorMessage,
  } = useUIStore();

  // Local state for hooks and bridge coordination
  // This state is passed to useAudioInitialization, which calls these setters
  const [processorReady, setProcessorReady] = useState(false);
  const [currentAudioContextState, setCurrentAudioContextState] =
    useState<AudioContextState | null>(null);

  // This is a workaround for the setAudioGraph prop of useAudioInitialization
  // The hook's internal graph updates might not be directly compatible with Zustand's model.
  // Ideally, the hook/bridge would directly call store actions.
  const [_, setLocalGraphForHook] = useState<AudioGraph>(graph);


  const {
    audioContextRef,
    workletNodeRef,
    audioInitialized,
    // error: audioInitError, // This error is set via setAudioError -> setLastErrorMessage
  } = useAudioInitialization({
    setAudioGraph: setLocalGraphForHook, // The hook will call this
    setAudioError: setLastErrorMessage, // Hook calls this to update UI store
    setProcessorReady, // Hook calls this
    setAudioContextState: setCurrentAudioContextState, // Hook calls this
  });

  // Initialize the bridge when audio context and processor port are ready
  useEffect(() => {
    const audioCtx = audioContextRef.current;
    const port = workletNodeRef.current?.port;

    if (audioCtx && port) {
      initAudioBridge(audioCtx, port);
      // Send the first INIT message via the bridge
      // This might conflict if useProcessorInitialization also sends an INIT message.
      // The bridge should be the single source of truth for sending messages.
      if (audioInitialized && processorReady) { // Ensure processor is ready from its own message
         console.log("[App.tsx] Bridge initialized, sending initial INIT request via bridge.");
         sendInitRequestToProcessor(INITIAL_CHANNELS, audioCtx.sampleRate);
      }
    }
  }, [audioContextRef, workletNodeRef, audioInitialized, processorReady]);


  // useProcessorInitialization hook
   const { initMessageSent /*, error: procInitError */ } = useProcessorInitialization({
    processorReady,
    workletNodeRef,
    audioContextRef,
    audioGraph: graph, // Pass the graph from the Zustand store
  });
  // Note: procInitError should also be handled, e.g., via setLastErrorMessage

  // useProcessorStatusCheck hook
  // const { checkStatusSent /*, error: statusCheckError */ } = useProcessorStatusCheck({
  //   audioContextState: currentAudioContextState,
  //   workletNodeRef,
  //   processorReady,
  // });
  // Note: statusCheckError should also be handled

  const handleAddNode = (type: AudioNodeType['kernel']) => {
    const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const newNode: AudioNodeType = {
      id: newNodeId,
      kernel: type,
      parameters: [], // Define default parameters based on type
      position: { x: Math.random() * 400, y: Math.random() * 200 }, // Random position
    };
    if (type === 'gain') {
      newNode.parameters.push({ id: 'gain', value: 1, min: 0, max: 2, label: 'Gain' });
    } else if (type === 'delay') {
      newNode.parameters.push({ id: 'delayTime', value: 0.5, min: 0, max: 2, label: 'Delay Time' });
      newNode.parameters.push({ id: 'feedback', value: 0.5, min: 0, max: 1, label: 'Feedback' });
    } else if (type === 'biquad') {
      newNode.parameters.push({ id: 'frequency', value: 1000, min: 20, max: 20000, label: 'Frequency' });
      newNode.parameters.push({ id: 'Q', value: 1, min: 0.0001, max: 100, label: 'Q' });
      newNode.parameters.push({ id: 'type', value: 0, min: 0, max: 7, label: 'Filter Type' }); // Assuming 0 is lowpass, etc.
    }
    addNodeToStore(newNode);
    // The bridge will pick up this change from store subscription and send GRAPH_UPDATE
  };

  const handleParameterChange = (nodeId: NodeId, paramId: ParameterId, value: number) => {
    updateParamInStore(nodeId, paramId, value);
    // The bridge will pick up this change for PARAM_UPDATE, or we can send it directly
    // if (workletNodeRef.current?.port) {
    //   sendParameterUpdateToProcessor(workletNodeRef.current.port, nodeId, paramId, value);
    // }
  };

  const selectedNodeInstance = selectedNodeId ? graph.nodes.get(selectedNodeId) : null;

  // Combine error messages
  const displayError = lastErrorMessage; // procInitError and statusCheckError could be combined here

  // Determine status message
  let currentStatusMessage = "Initializing...";
  if (audioInitError) currentStatusMessage = `Audio Init Error: ${audioInitError}`;
  else if (!audioInitialized) currentStatusMessage = "Initializing Audio System...";
  else if (!processorReady) currentStatusMessage = "Audio Initialized. Waiting for Processor...";
  else if (!initMessageSent) currentStatusMessage = "Processor Ready. Sending initial configuration...";
  else currentStatusMessage = "System Ready.";


  return (
    <LayoutShell>
      <Flex direction="column" style={{ height: '100%' }}>
        <StatusDisplay
          audioError={displayError}
          audioInitialized={audioInitialized}
          audioContextState={currentAudioContextState}
          processorReady={processorReady}
          initMessageSent={initMessageSent}
          // message={currentStatusMessage} // StatusDisplay might construct its own message
        />
        <Controls
          onAddNode={handleAddNode}
          audioContextState={currentAudioContextState}
          onAudioResume={async () => {
            if (audioContextRef.current) {
              await resumeAudioContext(); // Uses bridge's internal audioContextRef
              setCurrentAudioContextState(audioContextRef.current.state);
              setAudioContextRunning(audioContextRef.current.state === 'running');
            }
          }}
        />

        <Flex style={{ flexGrow: 1, overflow: 'hidden', position: 'relative' /* For positioning nodes */ }}>
          <Pedalboard
            nodes={Array.from(graph.nodes.values())}
            connections={graph.connections}
            nodeOrder={graph.nodeOrder}
            // onNodeSelect={selectNode} // Assuming Pedalboard can call this
            // onNodeMove, onConnect, etc.
          />
          {selectedNodeInstance && workletNodeRef.current?.port && (
            <NodeEditor
              selectedNode={selectedNodeInstance}
              onParameterChange={handleParameterChange}
              // processorPort={workletNodeRef.current.port} // Pass port if NodeEditor sends messages directly
            />
          )}
        </Flex>
      </Flex>
    </LayoutShell>
  );
}

export default App;

// Helper to get initial graph from store for useState, if needed
// const initialGraphFromStore = useGraphStore.getState().graph;

// Placeholder for audioInitError if useAudioInitialization hook is changed to return it directly
const audioInitError = null;
