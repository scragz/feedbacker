import { useState, useEffect, useCallback } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import { initializeAudioSystem, ensureAudioContextResumed, getAudioContext, getMFNWorkletNode } from './audio';
// Import ParameterDefinition type and createEmptyRoutingMatrix
import type { AudioGraph, AudioNodeInstance, NodeType, WorkletMessage, ParameterValue, ParameterDefinition } from './audio/schema';
import { MainThreadMessageType, NODE_PARAMETER_DEFINITIONS, WorkletMessageType as WorkletMsgTypeEnum } from './audio/schema';
import { createEmptyRoutingMatrix } from './audio/matrix'; // Added import

const MAX_CHANNELS = 8;

function App() {
  const [count, setCount] = useState(0);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);
  const [processorReady, setProcessorReady] = useState(false);
  const [initMessageSent, setInitMessageSent] = useState(false);

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
            }
          };
        } else {
          console.error('[App.tsx] MFNWorkletNode not available after audio system initialization.');
          setAudioError('MFNWorkletNode not available.');
        }

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
    const currentContext = getAudioContext();
    const currentWorkletNode = getMFNWorkletNode();

    if (currentContext && currentWorkletNode && currentContext.state === 'running' && processorReady && !initMessageSent) {
      console.log('[App.tsx] Context running, processor ready, sending INIT_PROCESSOR.');
      currentWorkletNode.port.postMessage({
        type: MainThreadMessageType.INIT_PROCESSOR,
        payload: {
          graph: audioGraph,
          sampleRate: currentContext.sampleRate,
          maxChannels: MAX_CHANNELS,
        },
      });
      setInitMessageSent(true);
    }
  }, [audioContextState, processorReady, audioGraph, initMessageSent]);

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
            // defaultValue is a required property in ParameterDefinition, so direct access is safe if paramDef is valid.
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

      for (let c = 0; c < prevGraph.outputChannels; c++) {
        for (let i = 0; i < prevGraph.nodes.length; i++) {
          for (let j = 0; j < prevGraph.nodes.length; j++) {
            const sourceValue = prevGraph.routingMatrix[c]?.[i]?.[j];
            if (sourceValue !== undefined && updatedRoutingMatrix[c]?.[i]) {
              updatedRoutingMatrix[c][i][j] = sourceValue;
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
    <>
      <h1>Feedbacker</h1>
      <div className="card">
        <button onClick={() => { setCount((c) => c + 1); }}>
          count is {count}
        </button>
        {audioError && (
          <p style={{ color: 'red' }}>Audio Error: {audioError}</p>
        )}
        {audioInitialized && !audioError && (
          <p style={{ color: 'green' }}>
            Audio system core initialized! Context State: {audioContextState}.
            {processorReady ? ' Processor Ready.' : ' Waiting for processor...'}
            {initMessageSent && ' Initial graph sent.'}
          </p>
        )}
        {!audioInitialized && !audioError && audioContextState && (
          <p>Initializing audio system... Current Context State: {audioContextState}</p>
        )}
        {audioContextState === 'suspended' && (
          <button onClick={() => { void handleResumeAudio(); }}>Resume Audio Context</button>
        )}
      </div>

      {audioInitialized && processorReady && initMessageSent && (
        <div className="audio-controls">
          <h2>Audio Graph Controls</h2>
          <button onClick={() => { handleAddNode('gain'); }}>Add Gain Node</button>
          <button onClick={() => { handleAddNode('delay'); }}>Add Delay Node</button>
          <button onClick={() => { handleAddNode('biquad'); }}>Add Biquad Filter Node</button>

          <h3>Current Nodes:</h3>
          {audioGraph.nodes.length === 0 ? (<p>No nodes in the graph.</p>) : (
            <ul>
              {audioGraph.nodes.map(node => (
                <li key={node.id}>
                  ID: {node.id}, Type: {node.type}
                  {Object.keys(node.parameters).length > 0 && (
                    <ul style={{ fontSize: '0.8em', marginLeft: '10px'}}>
                      {Object.entries(node.parameters).map(([paramId, value]) => (
                        <li key={paramId}>{paramId}: {String(value)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
