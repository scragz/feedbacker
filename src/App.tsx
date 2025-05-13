import { useState, useCallback, useRef } from 'react'; // Removed useEffect
import { Text } from '@mantine/core'; // Ensure Text is imported, removed MantineProvider, MantineThemeOverride
import Pedalboard from './components/Pedalboard/Pedalboard';
import Header from './components/Header/Header';
import Controls, { ControlsProps } from './components/Controls/Controls'; // Import ControlsProps
import NodeList from './components/NodeList/NodeList';
import NodeEditor from './components/NodeEditor/NodeEditor';
import StatusDisplay, { StatusDisplayProps } from './components/StatusDisplay/StatusDisplay'; // Import StatusDisplayProps
import type {
  AudioGraph,
  AudioNodeInstance,
  NodeType,
  ParameterValue,
  UpdateParameterMessage,
  AddNodeMessage, // Correctly import AddNodeMessage
} from './audio/schema';
import { MainThreadMessageType, NODE_PARAMETER_DEFINITIONS } from './audio/schema'; // Removed WorkletMessageType
import { useAudioInitialization } from './hooks/useAudioInitialization';
import { useProcessorStatusCheck } from './hooks/useProcessorStatusCheck';
import { useProcessorInitialization } from './hooks/useProcessorInitialization';

const initialGraph: AudioGraph = {
  nodes: [],
  routingMatrix: [],
  masterGain: 0.75,
  outputChannels: 2,
};

const MAX_CHANNELS = 2; // Default to stereo, ensure this matches worklet and context

function App() {
  // const [audioInitialized, setAudioInitialized] = useState(false); // Moved to useAudioInitialization
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [processorReady, setProcessorReady] = useState(false);
  // const [initMessageSent, setInitMessageSent] = useState(false); // Moved to useProcessorInitialization
  // const [checkStatusSent, setCheckStatusSent] = useState(false); // Moved to useProcessorStatusCheck
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [audioGraph, setAudioGraph] = useState<AudioGraph>(initialGraph);

  // const audioContextRef = useRef<AudioContext | null>(null); // Moved to useAudioInitialization
  // const workletNodeRef = useRef<AudioWorkletNode | null>(null); // Moved to useAudioInitialization

  const { audioContextRef, workletNodeRef, audioInitialized } = useAudioInitialization({
    setAudioGraph,
    setAudioError,
    setProcessorReady,
    setAudioContextState,
  });

  useProcessorStatusCheck({ // Removed unused destructured variables
    audioContextState,
    workletNodeRef,
    processorReady,
  });

  useProcessorInitialization({ // Removed unused destructured variables
    processorReady,
    workletNodeRef,
    audioContextRef,
    audioGraph,
  });

  const handleResumeAudio = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('[App.tsx] Audio context resumed.');
      } catch (error) {
        console.error('Error resuming audio context:', error);
        setAudioError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [audioContextRef]); // Added audioContextRef to dependencies

  const handleAddNode = (type: NodeType) => {
    if (!workletNodeRef.current || !audioContextRef.current) {
      setAudioError("Worklet node or audio context not available to add node.");
      return;
    }
    const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nodeParamDefinitionsMap = NODE_PARAMETER_DEFINITIONS[type];
    const defaultParameters: Record<string, ParameterValue> = {};

    // Removed unnecessary conditional as NODE_PARAMETER_DEFINITIONS[type] will always exist or be empty object
    for (const paramKey in nodeParamDefinitionsMap) {
      const paramDef = nodeParamDefinitionsMap[paramKey];
      defaultParameters[paramDef.id] = paramDef.defaultValue;
    }

    const newNodeInstance: AudioNodeInstance = {
      id: newNodeId,
      type,
      parameters: defaultParameters,
    };

    setAudioGraph(prevGraph => ({
      ...prevGraph,
      nodes: [...prevGraph.nodes, newNodeInstance],
    }));

    const message: AddNodeMessage = {
      type: MainThreadMessageType.ADD_NODE,
      payload: { nodeInstance: newNodeInstance }, // Corrected payload structure
    };
    workletNodeRef.current.port.postMessage(message);
    console.log('[App.tsx] Sent ADD_NODE message for new node:', newNodeInstance);
  };

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    console.log('[App.tsx] Selected node:', nodeId);
  }, []);

  const handleParameterUpdate = useCallback((nodeId: string, paramId: string, value: ParameterValue) => {
    if (workletNodeRef.current) {
      console.log(`[App.tsx] Updating parameter: Node ${nodeId}, Param ${paramId}, Value ${value}`);
      const message: UpdateParameterMessage = {
        type: MainThreadMessageType.UPDATE_PARAMETER,
        payload: {
          nodeId,
          parameterId: paramId,
          value,
        },
      };
      workletNodeRef.current.port.postMessage(message);
      setAudioGraph(prevGraph => ({
        ...prevGraph,
        nodes: prevGraph.nodes.map(n =>
          n.id === nodeId
            ? { ...n, parameters: { ...n.parameters, [paramId]: value } }
            : n
        ),
      }));
    } else {
      setAudioError("Worklet node not available to update parameter.");
    }
  }, [workletNodeRef]); // Added workletNodeRef to dependencies

  const selectedNode = audioGraph.nodes.find(node => node.id === selectedNodeId) ?? null;

  // Props for StatusDisplay
  const statusDisplayProps: StatusDisplayProps = {
    error: audioError,
    status: audioContextState,
    onResume: handleResumeAudio,
  };

  // Props for Controls
  const controlsProps: ControlsProps = {
    onAddNode: handleAddNode,
    audioContextState: audioContextState,
    onAudioResume: () => { void handleResumeAudio(); }, // Ensure void return for onAudioResume
    // Add any other props Controls might need, e.g., isProcessorReady: processorReady
  };

  return (
    <>
      <Pedalboard>
        <Header />
        <StatusDisplay {...statusDisplayProps} />
        {!audioInitialized ? (
          <Text>Initializing Audio...</Text>
        ) : !processorReady && audioContextRef.current?.state === 'running' ? (
          <Text>Audio Initialized. Waiting for Processor Ready Signal...</Text>
        ) : !processorReady ? (
           <Text>Audio Initialized. Waiting for audio context to run to check processor status...</Text>
        ) : (
          <>
            <Controls {...controlsProps} />
            <NodeList
              nodes={audioGraph.nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
            />
            {selectedNode && (
              <NodeEditor
                key={selectedNode.id}
                selectedNode={selectedNode}
                onParameterChange={handleParameterUpdate}
              />
            )}
          </>
        )}
      </Pedalboard>
    </>
  );
}

export default App;
