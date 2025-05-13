import { create } from 'zustand';
import {
  type AudioGraph,
  type AudioNodeInstance,
  type NodeType,
  NODE_PARAMETER_DEFINITIONS,
  type RoutingMatrix,
  type NodeId,
  type ParameterId,
  type ParameterValue,
} from '../audio/schema';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';

// Define the initial output mixer node
const initialOutputMixerNodeId = nanoid(10);
const initialOutputMixerNode: AudioNodeInstance = {
  id: initialOutputMixerNodeId,
  type: 'output_mixer',
  parameters: NODE_PARAMETER_DEFINITIONS.output_mixer
    ? Object.fromEntries(
        Object.entries(NODE_PARAMETER_DEFINITIONS.output_mixer).map(([paramId, def]) => [
          paramId,
          def.defaultValue,
        ]),
      )
    : {}, // Fallback to empty if output_mixer is somehow not in definitions
  label: 'Output Mixer',
  uiPosition: { x: 50, y: 50 }, // Default position
};

export interface SerializedAudioGraph {
  nodes: AudioNodeInstance[];
  connections: { from: NodeId; to: NodeId; weight: number; channel: number }[];
  outputChannels: number;
  masterGain: number;
  nodeOrder?: NodeId[];
}

export interface GraphState extends AudioGraph {
  getNodeById: (nodeId: NodeId) => AudioNodeInstance | undefined;
  getNodeIndex: (nodeId: NodeId) => number;
  addNode: (type: NodeType, id?: NodeId, uiPosition?: { x: number; y: number }) => NodeId;
  removeNode: (nodeId: NodeId) => void;
  updateNodeParameter: (nodeId: NodeId, parameterId: ParameterId, value: ParameterValue) => void;
  setMatrixValue: (channel: number, sourceNodeId: NodeId, destNodeId: NodeId, weight: number) => void;
  setConnectionWeightById: (
    fromNodeId: NodeId,
    toNodeId: NodeId,
    channelIndex: number,
    weight: number,
  ) => void;
  getSerializedGraph: () => SerializedAudioGraph;
  loadGraph: (serializedGraph: SerializedAudioGraph) => void;
  _resizeRoutingMatrix: (newNodeCount: number, oldNodeCount: number, oldMatrix: RoutingMatrix) => RoutingMatrix;
  _initializeRoutingMatrix: (nodeCount: number, channelCount: number) => RoutingMatrix;
}

const initialOutputChannels = 2;
const initialMasterGain = 0.8;

// Initial nodes array now includes the output mixer
const initialNodes: AudioNodeInstance[] = [initialOutputMixerNode];

const initializeRoutingMatrix = (nodeCount: number, channelCount: number): RoutingMatrix => {
  const matrix: RoutingMatrix = [];
  for (let i = 0; i < channelCount; i++) {
    matrix[i] = [];
    for (let j = 0; j < nodeCount; j++) {
      // Ensure the inner array is correctly typed as number[]
      const row: number[] = Array(nodeCount).fill(0) as number[];
      matrix[i][j] = row;
    }
  }
  return matrix;
};

export const useGraphStore = create(
  immer<GraphState>((set, get) => ({
    nodes: initialNodes, // Use the new initialNodes array
    routingMatrix: initializeRoutingMatrix(initialNodes.length, initialOutputChannels), // Initialize matrix based on initialNodes
    outputChannels: initialOutputChannels,
    masterGain: initialMasterGain,

    _initializeRoutingMatrix: initializeRoutingMatrix,

    _resizeRoutingMatrix: (newNodeCount, oldNodeCount, oldMatrix) => {
      const currentGraphState = get();
      const newMatrix = currentGraphState._initializeRoutingMatrix(newNodeCount, currentGraphState.outputChannels);
      const copyCount = Math.min(newNodeCount, oldNodeCount);
      for (let ch = 0; ch < currentGraphState.outputChannels; ch++) {
        for (let r = 0; r < copyCount; r++) {
          for (let c = 0; c < copyCount; c++) {
            newMatrix[ch][r][c] = oldMatrix[ch]?.[r]?.[c] ?? 0;
          }
        }
      }
      return newMatrix;
    },

    getNodeById: (nodeId) => get().nodes.find((node: AudioNodeInstance) => node.id === nodeId),

    getNodeIndex: (nodeId) => get().nodes.findIndex((node: AudioNodeInstance) => node.id === nodeId),

    addNode: (type, id, uiPosition) => {
      const newNodeId: NodeId = id ?? nanoid(10);
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
        uiPosition: uiPosition ?? { x: Math.random() * 300, y: Math.random() * 200 },
      };

      set((state: GraphState) => {
        state.nodes.push(newNodeInstance);
        const oldNodeCount = state.nodes.length - 1;
        state.routingMatrix = state._resizeRoutingMatrix(state.nodes.length, oldNodeCount, state.routingMatrix);
      });
      return newNodeId;
    },

    removeNode: (nodeId) => {
      set((state: GraphState) => {
        const nodeIndexToRemove = state.getNodeIndex(nodeId);
        if (nodeIndexToRemove === -1) {
          console.warn(`Node with ID ${nodeId} not found for removal.`);
          return;
        }

        const oldNodes = [...state.nodes];
        state.nodes.splice(nodeIndexToRemove, 1);

        const oldNodeCount = oldNodes.length;
        const newNodeCount = state.nodes.length;
        const oldMatrix = state.routingMatrix;
        const newMatrix = state._initializeRoutingMatrix(newNodeCount, state.outputChannels);

        for (let ch = 0; ch < state.outputChannels; ch++) {
          let newR = 0;
          for (let r = 0; r < oldNodeCount; r++) {
            if (r === nodeIndexToRemove) continue;
            let newC = 0;
            for (let c = 0; c < oldNodeCount; c++) {
              if (c === nodeIndexToRemove) continue;
              newMatrix[ch][newR][newC] = oldMatrix[ch]?.[r]?.[c] ?? 0;
              newC++;
            }
            newR++;
          }
        }
        state.routingMatrix = newMatrix;
      });
    },

    updateNodeParameter: (nodeId, parameterId, value) => {
      set((state: GraphState) => {
        const node = state.nodes.find((n: AudioNodeInstance) => n.id === nodeId);
        if (node) {
          if (Object.prototype.hasOwnProperty.call(node.parameters, parameterId)) {
            node.parameters[parameterId] = value;
          } else {
            console.warn(
              `Parameter ${parameterId} not found on node ${nodeId}. Available:`,
              Object.keys(node.parameters),
            );
          }
        } else {
          console.warn(`Node ${nodeId} not found for parameter update.`);
        }
      });
    },

    setMatrixValue: (channel, sourceNodeId, destNodeId, weight) => {
      set((state: GraphState) => {
        const sourceIndex = state.getNodeIndex(sourceNodeId);
        const destIndex = state.getNodeIndex(destNodeId);
        if (sourceIndex !== -1 && destIndex !== -1 && channel >= 0 && channel < state.outputChannels) {
            // Direct assignment is safe if indices are validated and matrix is initialized correctly.
            state.routingMatrix[channel][sourceIndex][destIndex] = Math.max(0, Math.min(1, weight));
        } else {
          console.warn(`Invalid matrix indices/node IDs for setMatrixValue. Chan:${channel}, Src:${sourceNodeId}(${sourceIndex}), Dest:${destNodeId}(${destIndex})`);
        }
      });
    },

    setConnectionWeightById: (fromNodeId, toNodeId, channelIndex, weight) => {
        const graph = get();
        const fromIndex = graph.getNodeIndex(fromNodeId);
        const toIndex = graph.getNodeIndex(toNodeId);

        if (fromIndex === -1 || toIndex === -1) {
          console.warn("setConnectionWeightById: Invalid nodeId", {fromNodeId, toNodeId, fromIndex, toIndex});
          return;
        }
        if (channelIndex < 0 || channelIndex >= graph.outputChannels) {
            console.warn("setConnectionWeightById: Invalid channelIndex", {channelIndex, outputChannels: graph.outputChannels });
            return;
        }

        set((state: GraphState) => {
            // Direct assignment after checks
            state.routingMatrix[channelIndex][fromIndex][toIndex] = Math.max(0, Math.min(1, weight));
        });
    },

    getSerializedGraph: (): SerializedAudioGraph => {
      const state = get();
      const connections: SerializedAudioGraph['connections'] = [];
      state.routingMatrix.forEach((channelMatrix, channelIndex: number) => {
        channelMatrix.forEach((sourceRow, sourceNodeIndex: number) => {
          sourceRow.forEach((weightVal, destNodeIndex: number) => {
            if (weightVal > 0) {
              const sourceNode = state.nodes[sourceNodeIndex];
              const destNode = state.nodes[destNodeIndex];
              connections.push({
                from: sourceNode.id,
                to: destNode.id,
                weight: weightVal,
                channel: channelIndex,
              });
            }
          });
        });
      });
      return {
        nodes: JSON.parse(JSON.stringify(state.nodes)) as AudioNodeInstance[],
        connections,
        outputChannels: state.outputChannels,
        masterGain: state.masterGain,
        nodeOrder: state.nodes.map((n: AudioNodeInstance) => n.id),
      };
    },

    loadGraph: (serializedGraph) => {
      set((state: GraphState) => {
        state.nodes = [];
        state.outputChannels = serializedGraph.outputChannels;
        state.masterGain = serializedGraph.masterGain;

        const nodeOrder = serializedGraph.nodeOrder ?? serializedGraph.nodes.map((n: AudioNodeInstance) => n.id);
        const tempNodeMap = new Map<NodeId, AudioNodeInstance>(
            serializedGraph.nodes.map((n: AudioNodeInstance) => [n.id, n])
        );

        const loadedNodes: AudioNodeInstance[] = [];
        nodeOrder.forEach(nodeId => {
            const nodeData = tempNodeMap.get(nodeId);
            if (nodeData) {
                const nodeParamsDefinition = NODE_PARAMETER_DEFINITIONS[nodeData.type];
                const defaultParameters: Record<ParameterId, ParameterValue> = {};
                for (const paramId in nodeParamsDefinition) {
                    if (Object.prototype.hasOwnProperty.call(nodeParamsDefinition, paramId)) {
                        defaultParameters[paramId] = nodeParamsDefinition[paramId].defaultValue;
                    }
                }
                const newNodeInstance: AudioNodeInstance = {
                    id: nodeData.id,
                    type: nodeData.type,
                    parameters: { ...defaultParameters, ...nodeData.parameters },
                    label: nodeData.label ?? nodeData.type,
                    uiPosition: nodeData.uiPosition ?? { x: Math.random() * 300, y: Math.random() * 200 },
                };
                loadedNodes.push(newNodeInstance);
            }
        });
        state.nodes = loadedNodes;
        state.routingMatrix = state._initializeRoutingMatrix(state.nodes.length, state.outputChannels);

        serializedGraph.connections.forEach(conn => {
          const fromIndex = state.getNodeIndex(conn.from);
          const toIndex = state.getNodeIndex(conn.to);
          const graphChannel = conn.channel;

          if (fromIndex !== -1 && toIndex !== -1 && graphChannel >= 0 && graphChannel < state.outputChannels) {
              // Direct assignment after checks
              state.routingMatrix[graphChannel][fromIndex][toIndex] = conn.weight;
          } else {
            console.warn("loadGraph: Invalid connection data or indices out of bounds", conn, {fromIndex, toIndex, graphChannel, outputChannels: state.outputChannels});
          }
        });
      });
    },
  })),
);
