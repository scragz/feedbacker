import { create } from 'zustand';
import {
  AudioGraph,
  AudioNode,
  NodeId,
  NodeParameter,
  ParameterId,
  ProcessorMessage,
  MessageType,
  SerializedAudioGraph,
} from '../audio/schema';

interface GraphState {
  graph: AudioGraph;
  addNode: (node: AudioNode) => void;
  removeNode: (nodeId: NodeId) => void;
  updateNodeParameter: (
    nodeId: NodeId,
    paramId: ParameterId,
    value: number,
  ) => void;
  setMatrixConnection: (
    fromNodeId: NodeId,
    fromChannel: number,
    toNodeId: NodeId,
    toChannel: number,
    weight: number,
  ) => void;
  getSerializedGraph: () => SerializedAudioGraph;
  loadGraph: (serializedGraph: SerializedAudioGraph) => void; // Basic load, more sophisticated logic later
  // TODO: Add actions for more complex graph manipulations
}

const initialGraph: AudioGraph = {
  nodes: new Map(),
  connections: [], // Representing the 3D matrix connections
  nodeOrder: [],
  outputNodeId: 'output', // Assuming a global output node
  inputNodeId: 'input', // Assuming a global input node
};

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: initialGraph,

  addNode: (node) =>
    set((state) => {
      const newNodes = new Map(state.graph.nodes);
      newNodes.set(node.id, node);
      const newNodeOrder = [...state.graph.nodeOrder, node.id];
      return {
        graph: {
          ...state.graph,
          nodes: newNodes,
          nodeOrder: newNodeOrder,
        },
      };
    }),

  removeNode: (nodeId) =>
    set((state) => {
      const newNodes = new Map(state.graph.nodes);
      newNodes.delete(nodeId);
      const newNodeOrder = state.graph.nodeOrder.filter((id) => id !== nodeId);
      // Also remove connections related to this node
      const newConnections = state.graph.connections.filter(
        (conn) => conn.from.nodeId !== nodeId && conn.to.nodeId !== nodeId,
      );
      return {
        graph: {
          ...state.graph,
          nodes: newNodes,
          connections: newConnections,
          nodeOrder: newNodeOrder,
        },
      };
    }),

  updateNodeParameter: (nodeId, paramId, value) =>
    set((state) => {
      const newNodes = new Map(state.graph.nodes);
      const node = newNodes.get(nodeId);
      if (node) {
        const param = node.parameters.find((p) => p.id === paramId);
        if (param) {
          param.value = value;
          newNodes.set(nodeId, { ...node }); // Create new object to trigger re-render
        }
      }
      return { graph: { ...state.graph, nodes: newNodes } };
    }),

  setMatrixConnection: (fromNodeId, fromChannel, toNodeId, toChannel, weight) =>
    set((state) => {
      const newConnections = [
        ...state.graph.connections.filter(
          (conn) =>
            !(
              conn.from.nodeId === fromNodeId &&
              conn.from.channel === fromChannel &&
              conn.to.nodeId === toNodeId &&
              conn.to.channel === toChannel
            ),
        ),
      ];
      if (weight > 0) { // Only add connection if weight is positive
        newConnections.push({
          from: { nodeId: fromNodeId, channel: fromChannel },
          to: { nodeId: toNodeId, channel: toChannel },
          weight,
        });
      }
      return { graph: { ...state.graph, connections: newConnections } };
    }),

  getSerializedGraph: (): SerializedAudioGraph => {
    const { nodes, connections, nodeOrder, outputNodeId, inputNodeId } = get().graph;
    const serializedNodes = Array.from(nodes.values()).map(node => ({
      id: node.id,
      kernel: node.kernel,
      parameters: node.parameters.map(p => ({ ...p })), // Deep copy parameters
      position: node.position || { x: 0, y: 0 } // Ensure position exists
    }));
    return {
      nodes: serializedNodes,
      connections: JSON.parse(JSON.stringify(connections)), // Deep copy
      nodeOrder,
      outputNodeId,
      inputNodeId,
    };
  },

  loadGraph: (serializedGraph) => set(() => {
    const nodes = new Map<NodeId, AudioNode>();
    serializedGraph.nodes.forEach(sn => {
      nodes.set(sn.id, {
        id: sn.id,
        kernel: sn.kernel,
        parameters: sn.parameters.map(p => ({...p})),
        position: sn.position
      });
    });
    return {
      graph: {
        nodes,
        connections: JSON.parse(JSON.stringify(serializedGraph.connections)),
        nodeOrder: [...serializedGraph.nodeOrder],
        outputNodeId: serializedGraph.outputNodeId,
        inputNodeId: serializedGraph.inputNodeId,
      }
    };
  }),
}));

// Function to inform the AudioWorklet about graph changes
// This will be expanded in bridge.ts
export const sendGraphToProcessor = (
  processorPort: MessagePort | null,
  graph: SerializedAudioGraph,
) => {
  if (processorPort) {
    const message: ProcessorMessage = {
      type: MessageType.GRAPH_UPDATE,
      payload: graph,
    };
    processorPort.postMessage(message);
  }
};

// Function to inform the AudioWorklet about parameter changes
export const sendParameterUpdateToProcessor = (
  processorPort: MessagePort | null,
  nodeId: NodeId,
  paramId: ParameterId,
  value: number,
) => {
  if (processorPort) {
    const message: ProcessorMessage = {
      type: MessageType.PARAM_UPDATE,
      payload: { nodeId, paramId, value },
    };
    processorPort.postMessage(message);
  }
};

// Example of subscribing to graph changes to send updates to the processor
// This logic will likely live in a dedicated bridge or hook
// useGraphStore.subscribe(
//   (state) => state.graph,
//   (graph, previousGraph) => {
//     // Basic check, needs to be more sophisticated to avoid unnecessary updates
//     if (JSON.stringify(graph) !== JSON.stringify(previousGraph)) {
//       console.log('Graph changed, sending to processor');
//       // Assuming processorPort is accessible here or passed in
//       // sendGraphToProcessor(processorPort, get().getSerializedGraph());
//     }
//   }
// );
