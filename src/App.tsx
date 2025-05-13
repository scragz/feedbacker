import { useState, useEffect, useCallback } from 'react';
import { initializeAudioSystem, ensureAudioContextResumed, getAudioContext, getMFNWorkletNode } from './audio';
import type { AudioGraph, AudioNodeInstance, NodeType, ParameterValue, ParameterDefinition, WorkletMessage } from './audio/schema';
import { MainThreadMessageType, NODE_PARAMETER_DEFINITIONS, WorkletMessageType as WorkletMsgTypeEnum } from './audio/schema';
import { createEmptyRoutingMatrix } from './audio/matrix';

import Pedalboard from './components/Pedalboard/Pedalboard';
import Header from './components/Header/Header';
import Controls from './components/Controls/Controls';
import NodeList from './components/NodeList/NodeList';
import NodeEditor from './components/NodeEditor/NodeEditor';
import StatusDisplay from './components/StatusDisplay/StatusDisplay';

const MAX_CHANNELS = 8;

function App() {
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [processorReady, setProcessorReady] = useState(false);
  const [initMessageSent, setInitMessageSent] = useState(false);
  const [checkStatusSent, setCheckStatusSent] = useState(false);

  const [audioGraph, setAudioGraph] = useState<AudioGraph>(() => {
    const initialNodes: AudioNodeInstance[] = [
      { id: 'system_input', type: 'input_mixer', parameters: {} },
      { id: 'system_output', type: 'output_mixer', parameters: {} },
    ];
    const numChannels = 2;
    return {
      nodes: initialNodes,
      routingMatrix: createEmptyRoutingMatrix(initialNodes.length, numChannels),
      outputChannels: numChannels,
      masterGain: 1.0,
    };
  });

  useEffect(() => {
    const initAudio = async () => {
      try {
        await initializeAudioSystem();
        setAudioInitialized(true);
        const context = getAudioContext();
        setAudioContextState(context.state);
        console.log('[App.tsx] Audio system core initialized.');

        const workletNode = getMFNWorkletNode();
        if (workletNode) {
          workletNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
            if (event.data.type === WorkletMsgTypeEnum.PROCESSOR_READY) {
              setProcessorReady(true);
              console.log('[App.tsx] MFNProcessor reported READY.');
            } else if (event.data.type === WorkletMsgTypeEnum.NODE_ERROR) { // Removed redundant payload check
              console.error(`[App.tsx] Node Error from Worklet: Node ID ${event.data.payload.nodeId}, Message: ${event.data.payload.error}`);
              setAudioError(`Node Error: ${event.data.payload.nodeId} - ${event.data.payload.error}`);
            } else if (event.data.type === WorkletMsgTypeEnum.WORKLET_ERROR) { // Removed redundant payload check
              console.error(`[App.tsx] General Worklet Error: ${event.data.payload.message}`);
              setAudioError(`Worklet Error: ${event.data.payload.message}`);
            }
          };
        } else {
          console.error('[App.tsx] MFNWorkletNode not available after audio system initialization.');
          setAudioError('MFNWorkletNode not available.');
        }

        const context = getAudioContext(); // Re-get context in case it was recreated
        context.onstatechange = () => {
          setAudioContextState(context.state);
          console.log(`[App.tsx] AudioContext state changed to: ${context.state}`);
        };

      } catch (error) {
        console.error('[App.tsx] Failed to initialize audio system:', error);
        setAudioError((error as Error).message || 'Unknown audio initialization error');
        try {
          const context = getAudioContext();
          setAudioContextState(context.state);
        } catch (contextError) {
          console.warn('[App.tsx] Could not get AudioContext state after init error:', contextError);
        }
      }
    };

    void initAudio();

    return () => {
      try {
        const context = getAudioContext();
        context.onstatechange = null;
        const workletNode = getMFNWorkletNode();
        if (workletNode) {
          workletNode.port.onmessage = null;
        }
      } catch (e) {
        console.warn('[App.tsx] Could not clean up audio context listener:', e);
      }
    };
  }, []);

  useEffect(() => {
    if (audioInitialized && audioContextState === 'running' && !checkStatusSent) {
      const currentWorkletNode = getMFNWorkletNode();
      if (currentWorkletNode) { // Explicit check for worklet node
        console.log('[App.tsx] Context running, audio initialized, sending CHECK_PROCESSOR_STATUS.');
        currentWorkletNode.port.postMessage({
          type: MainThreadMessageType.CHECK_PROCESSOR_STATUS,
        });
        setCheckStatusSent(true);
      } else {
        console.warn('[App.tsx] CHECK_PROCESSOR_STATUS not sent: WorkletNode not available yet.');
      }
    }
  }, [audioContextState, checkStatusSent, audioInitialized]);

  useEffect(() => {
    if (audioInitialized && audioContextState === 'running' && processorReady && !initMessageSent) {
      const currentContext = getAudioContext(); // Ensure we have the latest context reference
      const currentWorkletNode = getMFNWorkletNode();
      if (currentContext && currentWorkletNode) { // Explicit checks
        console.log('[App.tsx] Processor ready, sending INIT_PROCESSOR.');
        currentWorkletNode.port.postMessage({
          type: MainThreadMessageType.INIT_PROCESSOR,
          payload: {
            graph: audioGraph,
            sampleRate: currentContext.sampleRate,
      setInitMessageSent(true);
    }
  }, [processorReady, audioGraph, initMessageSent, audioContextState, audioInitialized]);

  const handleResumeAudio = useCallback(async () => {
    try {
      await ensureAudioContextResumed();
      const context = getAudioContext();
      setAudioContextState(context.state);
      if (context.state === 'running') {
        setAudioError(null);
      }
    } catch (err) {
      console.warn('[App.tsx] Error resuming audio context on click:', err);
      setAudioError((err as Error).message || 'Failed to resume audio context.');
      try {
        const context = getAudioContext();
        setAudioContextState(context.state);
      } catch (contextError) {
        console.warn('[App.tsx] Could not get AudioContext state after resume error:', contextError);
      }
    }
  }, []);

  const handleAddNode = (type: NodeType) => {
    if (!audioInitialized || !processorReady || !initMessageSent) {
      setAudioError("Audio system not ready to add nodes (or initial graph not sent).");
      console.warn('[App.tsx] Add node aborted: audio system not ready.', { audioInitialized, processorReady, initMessageSent });
      return;
    }
    const workletNode = getMFNWorkletNode();
    if (!workletNode) {
      setAudioError("MFNWorkletNode not available to add nodes.");
      console.warn('[App.tsx] Add node aborted: MFNWorkletNode not found.');
      return;
    }

    setAudioGraph(prevGraph => {
      const newNodeId = `${type}_node_${Date.now()}`;
      const newNodeParams: Record<string, ParameterValue | undefined> = {};

      const nodeParamDefinitionsGroup = NODE_PARAMETER_DEFINITIONS[type];
      if (nodeParamDefinitionsGroup) {
        const params = nodeParamDefinitionsGroup as Record<string, ParameterDefinition<ParameterValue>>;
        for (const paramKey in params) {
          if (Object.prototype.hasOwnProperty.call(params, paramKey)) {
            const paramDef = params[paramKey];
            newNodeParams[paramDef.id] = paramDef.defaultValue;
          }
        }
      }

      const newNode: AudioNodeInstance = {
        id: newNodeId,
        type: type,
        parameters: newNodeParams,
      };

      const updatedNodes = [...prevGraph.nodes, newNode];
      const newNumNodes = updatedNodes.length;

      const updatedRoutingMatrix = createEmptyRoutingMatrix(newNumNodes, prevGraph.outputChannels);

      // Preserve existing connections in the larger matrix
      for (let c = 0; c < prevGraph.outputChannels; c++) {
        for (let i = 0; i < prevGraph.nodes.length; i++) { // Iterate up to old number of nodes
          for (let j = 0; j < prevGraph.nodes.length; j++) { // Iterate up to old number of nodes
            if (prevGraph.routingMatrix[c]?.[i]?.[j] !== undefined) {
               updatedRoutingMatrix[c][i][j] = prevGraph.routingMatrix[c][i][j];
            }
          }
        }
      }

      const updatedGraph: AudioGraph = {
        ...prevGraph,
        nodes: updatedNodes,
        routingMatrix: updatedRoutingMatrix,
      };

      console.log('[App.tsx] Adding node, sending UPDATE_GRAPH:', updatedGraph);
      workletNode.port.postMessage({
        type: MainThreadMessageType.UPDATE_GRAPH,
        payload: {
          graph: updatedGraph,
        },
      });

      return updatedGraph;
    });
  };

  return (
    <Pedalboard>
      <Header />
      <StatusDisplay
        audioError={audioError}
        audioInitialized={audioInitialized}
        audioContextState={audioContextState}
        processorReady={processorReady}
        initMessageSent={initMessageSent}
      />
      {/* Render controls only when the full audio pipeline is ready */}
      {audioInitialized && processorReady && initMessageSent && (
        <>
          <Controls
            onAddNode={handleAddNode}
            audioContextState={audioContextState}
            onAudioResume={() => { void handleResumeAudio(); }} // MODIFIED: Wrap async call
          />
          <NodeList nodes={audioGraph.nodes} />
          <NodeEditor />
        </>
      )}
    </Pedalboard>
  );
}

export default App;
