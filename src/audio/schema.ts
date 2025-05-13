/**
 * schema.ts
 *
 * Defines shared types and interfaces for communication between the main thread
 * and the AudioWorklet, as well as for structuring the audio graph and its
 * components.
 */

// === Message Types for Main Thread <-> AudioWorklet Communication ===

/**
 * Messages sent from the Main Thread to the AudioWorkletProcessor.
 */
export enum MainThreadMessageType {
  /** Initialize the processor with necessary audio graph and parameters. */
  INIT_PROCESSOR = 'INIT_PROCESSOR',
  /** Update the entire audio graph structure (nodes, connections). */
  UPDATE_GRAPH = 'UPDATE_GRAPH',
  /** Add a new node to the graph. */
  ADD_NODE = 'ADD_NODE', // ADDED
  /** Update a specific parameter of a node. */
  UPDATE_PARAMETER = 'UPDATE_PARAMETER',
  /** Request an offline render of the current graph. */
  RENDER_OFFLINE = 'RENDER_OFFLINE',
  /** Notify the processor of the number of output channels. */
  SET_OUTPUT_CHANNELS = 'SET_OUTPUT_CHANNELS',
  /** Control message for playback (e.g. play/pause, though typically handled by AudioContext) */
  TRANSPORT_CONTROL = 'TRANSPORT_CONTROL', // Example, might not be needed if AudioContext handles it
  /** Message from main thread to check if processor is alive and ready. */
  CHECK_PROCESSOR_STATUS = 'CHECK_PROCESSOR_STATUS',
}

/**
 * Messages sent from the AudioWorkletProcessor to the Main Thread.
 */
export enum WorkletMessageType {
  /** Indicates the processor is initialized and ready. */
  PROCESSOR_READY = 'PROCESSOR_READY',
  /** Provides data from the worklet, e.g., analysis or recorded audio. */
  DATA_AVAILABLE = 'DATA_AVAILABLE',
  /** Reports an error from the worklet. */
  WORKLET_ERROR = 'WORKLET_ERROR',
  /** Reports an error specific to an audio node's processing. */
  NODE_ERROR = 'NODE_ERROR', // Added for specific node errors
  /** Reports current RMS or peak levels for visualization. */
  METER_UPDATE = 'METER_UPDATE', // Example for VU meters
  /** Confirms a node was added and provides its (potentially modified) instance. */
  NODE_ADDED = 'NODE_ADDED', // ADDED
  /** Confirms a node was removed. */
  NODE_REMOVED = 'NODE_REMOVED', // ADDED
  /** Confirms a parameter was updated. */
  PARAMETER_UPDATED = 'PARAMETER_UPDATED', // ADDED
  /** Provides the full updated graph from the worklet. */
  GRAPH_UPDATED = 'GRAPH_UPDATED', // ADDED
}

// === Audio Node and Parameter Descriptors ===

/**
 * Defines the type of a DSP kernel/node.
 * These should correspond to the available kernels in `audio/nodes/`.
 */
export type NodeType =
  | 'gain'
  | 'delay'
  | 'biquad'
  | 'oscillator' // Example
  | 'noise' // MODIFIED: Ensured noise is part of the type
  | 'input_mixer' // Special node for graph input
  | 'output_mixer'; // Special node for graph output

/**
 * Generic structure for defining a parameter of an audio node.
 */
export interface ParameterDefinition<T = number> {
  id: ParameterId; // Unique identifier for the parameter (e.g., 'frequency', 'gain')
  label: string; // User-friendly label
  type: 'float' | 'integer' | 'boolean' | 'enum';
  minValue?: number;
  maxValue?: number;
  defaultValue: T;
  currentValue?: T; // Can be set by the UI or processor
  enumValues?: string[]; // For 'enum' type
  unit?: string; // e.g., 'Hz', 'dB', 's'
}

// Helper type for parameter values
export type ParameterValue = string | number | boolean;

/**
 * Defines the structure for parameter definitions for each node type.
 * This will be an object where keys are NodeType and values are objects
 * mapping parameter IDs to their definitions.
 */
export type NodeParameterDefinitions = Record<NodeType, Record<string, ParameterDefinition<ParameterValue>>>;

// ADDED: Explicit type aliases for NodeId and ParameterId
export type NodeId = string;
export type ParameterId = string;

/**
 * Describes an instance of an audio node in the graph.
 */
export interface AudioNodeInstance {
  id: NodeId; // Unique ID for this node instance in the graph
  type: NodeType; // Type of DSP kernel to use
  label?: string; // Optional user-defined label for the node
  parameters: Record<string, ParameterValue | undefined>; // Current parameter values { paramId: value }
  // Position for UI, not used by worklet directly but useful for graph state
  uiPosition?: { x: number; y: number };
}

// === Routing Matrix ===

/**
 * The routing matrix defines how the output of each node (source)
 * is mixed into the input of every other node (destination) *for each channel*.
 *
 * Structure: `matrix[channelIndex][sourceNodeIndex][destinationNodeIndex] = gainValue (0.0 to 1.0)`
 *
 * Node indices correspond to the order of nodes in the `AudioGraph.nodes` array.
 * We can also use node IDs for a more robust mapping if preferred, but indices are simpler for the worklet.
 */
export type RoutingMatrix = number[][][]; // channel -> sourceNode -> destNode -> weight

// === Audio Graph Structure ===

/**
 * Represents the entire audio processing graph.
 */
export interface AudioGraph {
  nodes: AudioNodeInstance[];
  routingMatrix: RoutingMatrix; // Ensure this is used instead of 'connections'
  outputChannels: number; // Number of output channels for the graph
  masterGain: number; // Overall master gain, ensure this is used instead of 'masterVolume'
}

// === Message Payloads ===

// --- Main Thread to Worklet ---

export interface InitProcessorMessage {
  type: MainThreadMessageType.INIT_PROCESSOR;
  payload: {
    graph: AudioGraph;
    sampleRate: number;
    maxChannels: number; // Max channels the worklet should be prepared to handle
  };
}

export interface UpdateGraphMessage {
  type: MainThreadMessageType.UPDATE_GRAPH;
  payload: {
    graph: AudioGraph;
  };
}

export interface AddNodeMessage { // ADDED
  type: MainThreadMessageType.ADD_NODE;
  payload: { nodeInstance: AudioNodeInstance }; // Changed payload structure
}

export interface UpdateParameterMessage {
  type: MainThreadMessageType.UPDATE_PARAMETER;
  payload: {
    nodeId: NodeId;
    parameterId: ParameterId;
    value: ParameterValue | undefined; // Ensure this matches
  };
}

export interface RenderOfflineMessage {
  type: MainThreadMessageType.RENDER_OFFLINE;
  payload: {
    durationSeconds: number; // How long to render
    // Potentially other settings like target sample rate if different
  };
}

export interface SetOutputChannelsMessage {
  type: MainThreadMessageType.SET_OUTPUT_CHANNELS;
  payload: {
    outputChannels: number;
  };
}

/**
 * ADDED: Interface for the new message type
 */
export interface CheckProcessorStatusMessage {
  type: MainThreadMessageType.CHECK_PROCESSOR_STATUS;
  payload?: null; // No payload needed for this message
}

// ADDED: Interface for ADD_NODE message
export interface AddNodeMessage {
  type: MainThreadMessageType.ADD_NODE;
  payload: { nodeInstance: AudioNodeInstance }; // Ensured payload is an object
}

export type MainThreadMessage =
  | InitProcessorMessage
  | UpdateGraphMessage
  | AddNodeMessage // ADDED
  | UpdateParameterMessage
  | RenderOfflineMessage
  | SetOutputChannelsMessage
  /**
   * ADDED: New message type to the union
   */
  | CheckProcessorStatusMessage;

// --- Worklet to Main Thread ---

export interface ProcessorReadyMessage {
  type: WorkletMessageType.PROCESSOR_READY;
  payload?: {
    // any initial data if needed
    message?: string; // Optional: for consistency if other messages have it
  };
}

export interface NodeAddedMessage { // ADDED
  type: WorkletMessageType.NODE_ADDED;
  payload: AudioNodeInstance;
}

export interface NodeRemovedMessage { // ADDED
  type: WorkletMessageType.NODE_REMOVED;
  payload: { nodeId: NodeId };
}

export interface ParameterUpdatedMessage { // ADDED
  type: WorkletMessageType.PARAMETER_UPDATED;
  payload: {
    nodeId: NodeId;
    parameterId: ParameterId;
    value: ParameterValue;
  };
}

export interface GraphUpdatedMessage { // ADDED
  type: WorkletMessageType.GRAPH_UPDATED;
  payload: AudioGraph;
}

export interface WorkletErrorMessage { // To ensure consistency for error payloads
  type: WorkletMessageType.WORKLET_ERROR | WorkletMessageType.NODE_ERROR;
  payload: {
    message: string;
    nodeId?: NodeId; // Optional, if error is specific to a node
  };
}


export interface DataAvailableMessage<T = unknown> { // Ensure T is defined here
  type: WorkletMessageType.DATA_AVAILABLE;
  payload: {
    dataType: string; // e.g., 'offlineRenderComplete', 'analysisData'
    data: T; // The actual data, e.g., an ArrayBuffer for audio
    message?: string; // Optional: for consistency
  };
}

// Add other specific message types if needed, e.g., for METER_UPDATE

export type WorkletMessage =
  | ProcessorReadyMessage
  | DataAvailableMessage
  | WorkletErrorMessage // Use the more specific error type
  | NodeAddedMessage // ADDED
  | NodeRemovedMessage // ADDED
  | ParameterUpdatedMessage // ADDED
  | GraphUpdatedMessage; // ADDED
  // Add MeterUpdateMessage etc. if they have specific payloads


// Placeholder for actual node parameter definitions
// This would typically be in its own file or a more structured part of your audio engine code.
export const NODE_PARAMETER_DEFINITIONS: NodeParameterDefinitions = {
  gain: {
    gain: { id: 'gain', label: 'Gain', type: 'float', defaultValue: 1, minValue: 0, maxValue: 2, unit: '' },
  },
  delay: {
    delayTime: { id: 'delayTime', label: 'Delay Time', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 2, unit: 's' },
    feedback: { id: 'feedback', label: 'Feedback', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, unit: '' },
  },
  biquad: {
    frequency: { id: 'frequency', label: 'Frequency', type: 'float', defaultValue: 1000, minValue: 20, maxValue: 20000, unit: 'Hz' },
    q: { id: 'q', label: 'Q', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 20, unit: '' },
    type: { id: 'type', label: 'Filter Type', type: 'enum', defaultValue: 'lowpass', enumValues: ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf', 'peaking'] },
    gain: { id: 'gain', label: 'Gain (Shelving/Peaking)', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, unit: 'dB' },
  },
  oscillator: {
    frequency: { id: 'frequency', label: 'Frequency', type: 'float', defaultValue: 440, minValue: 20, maxValue: 20000, unit: 'Hz' },
    type: { id: 'type', label: 'Waveform', type: 'enum', defaultValue: 'sine', enumValues: ['sine', 'square', 'sawtooth', 'triangle'] },
    gain: { id: 'gain', label: 'Gain', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, unit: '' },
  },
  noise: { // ADDED: noise type definition
    type: { id: 'type', label: 'Noise Type', type: 'enum', defaultValue: 'white', enumValues: ['white', 'pink', 'brownian'] },
    gain: { id: 'gain', label: 'Gain', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, unit: '' },
  },
  input_mixer: { // Input mixer might not have user-configurable params other than channel routing
    masterGain: { id: 'masterGain', label: 'Input Master Gain', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1 }
  },
  output_mixer: { // Output mixer might not have user-configurable params other than channel routing
    masterGain: { id: 'masterGain', label: 'Output Master Gain', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1 }
  },
};

// Example of a specific parameter definition for a gain node
export const GainNodeParams: Record<string, ParameterDefinition> = {
  gain: { id: 'gain', label: 'Gain', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, unit: 'linear' },
};

// Example for a delay node
export const DelayNodeParams: Record<string, ParameterDefinition> = {
  delayTime: { id: 'delayTime', label: 'Delay Time', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 2.0, unit: 's' },
  feedback: { id: 'feedback', label: 'Feedback', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 0.95, unit: '' },
  mix: { id: 'mix', label: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, unit: '' },
};

console.log('Audio schema loaded.'); // For quick verification during development
