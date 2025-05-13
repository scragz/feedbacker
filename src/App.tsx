import { useState, useEffect, useCallback, useRef } from 'react';
import { MantineProvider, Text, MantineThemeOverride } from '@mantine/core'; // Ensure Text is imported
import Pedalboard from './components/Pedalboard/Pedalboard';
import Header from './components/Header/Header';
import Controls, { ControlsProps } from './components/Controls/Controls'; // Import ControlsProps
import NodeList from './components/NodeList/NodeList';
import NodeEditor from './components/NodeEditor/NodeEditor';
import StatusDisplay, { StatusDisplayProps } from './components/StatusDisplay/StatusDisplay'; // Import StatusDisplayProps
import { MFNWorkletNode, setupAudioWorklet } from './audio';
import type {
  AudioGraph,
  AudioNodeInstance,
  NodeType,
  MainThreadMessage,
  WorkletMessage,
  ParameterValue,
  InitProcessorMessage,
  UpdateParameterMessage,
  AddNodeMessage, // Correctly import AddNodeMessage
  NodeAddedMessage,
  NodeRemovedMessage,
  ParameterUpdatedMessage,
  GraphUpdatedMessage,
  WorkletErrorMessage,
} from './audio/schema';
import { MainThreadMessageType, WorkletMessageType, NODE_PARAMETER_DEFINITIONS } from './audio/schema';

const initialGraph: AudioGraph = {
  nodes: [],
  routingMatrix: [],
  masterGain: 0.75,
  outputChannels: 2,
};

const MAX_CHANNELS = 2; // Default to stereo, ensure this matches worklet and context

// Define Mantine theme override for dark mode
const theme: MantineThemeOverride = {
  colorScheme: 'dark',
};

function App() {
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [processorReady, setProcessorReady] = useState(false);
  const [initMessageSent, setInitMessageSent] = useState(false);
  const [checkStatusSent, setCheckStatusSent] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [audioGraph, setAudioGraph] = useState<AudioGraph>(initialGraph);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null); // Use AudioWorkletNode type

  useEffect(() => {
    let isMounted = true;
    if (!audioContextRef.current) {
      const initializeAudio = async () => {
        try {
          const context = new AudioContext();
          if (isMounted) setAudioContextState(context.state);
          context.onstatechange = () => {
            if (isMounted) setAudioContextState(context.state);
          };

          await setupAudioWorklet(context);
          // Use the correct MFNWorkletNode constructor if it's a custom class extending AudioWorkletNode
          // For now, assuming MFNWorkletNode is a type alias or setupAudioWorklet handles registration
          const mfnNode = new AudioWorkletNode(context, 'mfn-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [MAX_CHANNELS],
            processorOptions: { maxChannels: MAX_CHANNELS, sampleRate: context.sampleRate },
          });

          mfnNode.connect(context.destination);

          mfnNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
            if (!isMounted) return;
            const { type, payload } = event.data;
            console.log('[App.tsx] Received message from worklet:', type, payload);

            switch (type) {
              case WorkletMessageType.PROCESSOR_READY:
                if (isMounted) setProcessorReady(true);
                console.log('[App.tsx] Audio processor is ready.');
                break;
              case WorkletMessageType.NODE_ADDED:
                if (isMounted && payload) {
                  const nodeAddedPayload = payload as NodeAddedMessage['payload'];
                  setAudioGraph(prevGraph => ({
                    ...prevGraph,
                    nodes: [...prevGraph.nodes, nodeAddedPayload],
                  }));
                }
                break;
              case WorkletMessageType.NODE_REMOVED:
                if (isMounted && payload) {
                  const nodeRemovedPayload = payload as NodeRemovedMessage['payload'];
                  setAudioGraph(prevGraph => ({
                    ...prevGraph,
                    nodes: prevGraph.nodes.filter(n => n.id !== nodeRemovedPayload.nodeId),
                  }));
                }
                break;
              case WorkletMessageType.PARAMETER_UPDATED:
                if (isMounted && payload) {
                  const paramUpdatedPayload = payload as ParameterUpdatedMessage['payload'];
                  setAudioGraph(prevGraph => ({
                    ...prevGraph,
                    nodes: prevGraph.nodes.map(n =>
                      n.id === paramUpdatedPayload.nodeId
                        ? { ...n, parameters: { ...n.parameters, [paramUpdatedPayload.parameterId]: paramUpdatedPayload.value } }
                        : n
                    ),
                  }));
                }
                break;
              case WorkletMessageType.GRAPH_UPDATED:
                if (isMounted && payload) {
                  setAudioGraph(payload as GraphUpdatedMessage['payload']);
                }
                break;
              case WorkletMessageType.WORKLET_ERROR:
              case WorkletMessageType.NODE_ERROR:
                if (isMounted && payload) {
                  const errorPayload = payload as WorkletErrorMessage['payload'];
                  setAudioError(errorPayload.message);
                  console.error('[App.tsx] Worklet Error:', errorPayload.message);
                }
                break;
              default:
                console.warn('[App.tsx] Received unknown message type from worklet:', type);
            }
          };

          audioContextRef.current = context;
          workletNodeRef.current = mfnNode;
          if (isMounted) setAudioInitialized(true);

        } catch (error) {
          console.error('Error initializing audio:', error);
          if (isMounted) setAudioError(error instanceof Error ? error.message : String(error));
        }
      };
      void initializeAudio();
    }
    return () => {
      isMounted = false;
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        // audioContextRef.current.close(); // Consider implications before enabling
      }
    };

  }, []);

  useEffect(() => {
    if (audioContextRef.current?.state === 'running' && workletNodeRef.current && !processorReady && !checkStatusSent) {
      console.log('[App.tsx] Audio context running, sending CHECK_PROCESSOR_STATUS');
      workletNodeRef.current.port.postMessage({ type: MainThreadMessageType.CHECK_PROCESSOR_STATUS });
      setCheckStatusSent(true);
    }
  }, [audioContextState, processorReady, checkStatusSent]);

  useEffect(() => {
    if (processorReady && workletNodeRef.current && audioContextRef.current && !initMessageSent) {
      console.log('[App.tsx] Processor ready, sending INIT_PROCESSOR with graph:', audioGraph);
      const initMessage: InitProcessorMessage = {
        type: MainThreadMessageType.INIT_PROCESSOR,
        payload: {
          graph: audioGraph,
          sampleRate: audioContextRef.current.sampleRate,
          maxChannels: MAX_CHANNELS,
        },
      };
      workletNodeRef.current.port.postMessage(initMessage);
      setInitMessageSent(true);
    }
  }, [processorReady, initMessageSent, audioGraph]);

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
  }, []);

  const handleAddNode = (type: NodeType) => {
    if (!workletNodeRef.current || !audioContextRef.current) {
      setAudioError("Worklet node or audio context not available to add node.");
      return;
    }
    const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nodeParamDefinitionsMap = NODE_PARAMETER_DEFINITIONS[type];
    const defaultParameters: Record<string, ParameterValue> = {};

    if (nodeParamDefinitionsMap) {
      for (const paramKey in nodeParamDefinitionsMap) {
        const paramDef = nodeParamDefinitionsMap[paramKey];
        defaultParameters[paramDef.id] = paramDef.defaultValue;
      }
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
  }, []);

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
    onAudioResume: handleResumeAudio,
    // Add any other props Controls might need, e.g., isProcessorReady: processorReady
  };

  return (
    <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
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
    </MantineProvider>
  );
}

export default App;
