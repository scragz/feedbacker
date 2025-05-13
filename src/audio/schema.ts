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
  /** Update a specific parameter of a node. */
  UPDATE_PARAMETER = 'UPDATE_PARAMETER',
  /** Request an offline render of the current graph. */
  RENDER_OFFLINE = 'RENDER_OFFLINE',
  /** Notify the processor of the number of output channels. */
  SET_OUTPUT_CHANNELS = 'SET_OUTPUT_CHANNELS',
  /** Control message for playback (e.g. play/pause, though typically handled by AudioContext) */
  TRANSPORT_CONTROL = 'TRANSPORT_CONTROL', // Example, might not be needed if AudioContext handles it
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
  | 'noise' // Example
  | 'input_mixer' // Special node for graph input
  | 'output_mixer'; // Special node for graph output

/**
 * Generic structure for defining a parameter of an audio node.
 */
export interface ParameterDefinition<T = number> {
  id: string; // Unique identifier for the parameter (e.g., 'frequency', 'gain')
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
 * Describes an instance of an audio node in the graph.
 */
export interface AudioNodeInstance {
  id: string; // Unique ID for this node instance in the graph
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
  /**
   * Adjacency matrix for connections, or a list of explicit connections.
   * For an MFN, the routingMatrix handles connections, but explicit connections
   * might be useful for defining a primary signal flow before feedback.
   * For now, we'll rely on the routingMatrix.
   */
  // connections: { sourceNodeId: string; destNodeId: string; outputPort?: string; inputPort?: string }[];
  routingMatrix: RoutingMatrix;
  outputChannels: number; // Number of output channels for the graph
  masterGain: number; // Overall master gain
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

export interface UpdateParameterMessage {
  type: MainThreadMessageType.UPDATE_PARAMETER;
  payload: {
    nodeId: string;
    parameterId: string;
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

export type MainThreadMessage =
  | InitProcessorMessage
  | UpdateGraphMessage
  | UpdateParameterMessage
  | RenderOfflineMessage
  | SetOutputChannelsMessage;

// --- Worklet to Main Thread ---

export interface ProcessorReadyMessage {
  type: WorkletMessageType.PROCESSOR_READY;
  payload?: {
    // any initial data if needed
  };
}

export interface DataAvailableMessage<T = unknown> {
  type: WorkletMessageType.DATA_AVAILABLE;
  payload: {
    dataType: string; // e.g., 'offlineRenderComplete', 'analysisData'
    data: T; // The actual data, e.g., an ArrayBuffer for audio
  };
}

export interface WorkletErrorMessage {
  type: WorkletMessageType.WORKLET_ERROR;
  payload: {
    message: string;
    error?: unknown; // Can include the error object itself
  };
}

export interface NodeErrorMessage { // Added interface for NODE_ERROR message
  type: WorkletMessageType.NODE_ERROR;
  payload: {
    nodeId: string;
    error: string;
  };
}

export interface MeterUpdateMessage {
  type: WorkletMessageType.METER_UPDATE;
  payload: {
    levels: number[][]; // channel -> [rms, peak] or similar
  };
}

export type WorkletMessage =
  | ProcessorReadyMessage
  | DataAvailableMessage
  | WorkletErrorMessage
  | NodeErrorMessage // Added to union type
  | MeterUpdateMessage;

// === Example Parameter Definitions for Specific Node Types ===
// These could be further refined or generated.

export interface GainParams {
  gain: ParameterDefinition<number>; // Typically 0-1, or dB
}

export interface DelayParams {
  delayTime: ParameterDefinition<number>; // In seconds
  feedback: ParameterDefinition<number>; // 0-1
  mix: ParameterDefinition<number>; // 0-1 (dry/wet)
}

export type BiquadFilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass';

export interface BiquadParams {
  type: ParameterDefinition<BiquadFilterType>;
  frequency: ParameterDefinition<number>; // Hz
  Q: ParameterDefinition<number>; // Quality factor
  gain: ParameterDefinition<number>; // dB (for lowshelf, highshelf, peaking)
}

// Add more specific parameter interfaces as new node types are defined.

/**
 * A map of all known parameter definitions for each node type.
 * Useful for UI generation and validation.
 */
export type NodeParameterDefinitions = {
  [K in NodeType]?: K extends 'gain'
    ? GainParams
    : K extends 'delay'
    ? DelayParams
    : K extends 'biquad'
    ? BiquadParams
    // Add other node types here
    : Record<string, ParameterDefinition<any>>;
};

// Placeholder for now, to be populated as kernels are defined.
export const NODE_PARAMETER_DEFINITIONS: NodeParameterDefinitions = {
  gain: {
    gain: { id: 'gain', label: 'Gain', type: 'float', minValue: 0, maxValue: 1, defaultValue: 0.7, unit: '' },
  },
  delay: {
    delayTime: { id: 'delayTime', label: 'Delay Time', type: 'float', minValue: 0, maxValue: 2, defaultValue: 0.5, unit: 's' },
    feedback: { id: 'feedback', label: 'Feedback', type: 'float', minValue: 0, maxValue: 1, defaultValue: 0.3, unit: '' },
    mix: { id: 'mix', label: 'Mix', type: 'float', minValue: 0, maxValue: 1, defaultValue: 0.5, unit: '' },
  },
  biquad: {
    type: { id: 'type', label: 'Filter Type', type: 'enum', defaultValue: 'lowpass', enumValues: ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']},
    frequency: { id: 'frequency', label: 'Frequency', type: 'float', minValue: 20, maxValue: 20000, defaultValue: 1000, unit: 'Hz' },
    Q: { id: 'Q', label: 'Q', type: 'float', minValue: 0.0001, maxValue: 100, defaultValue: 1, unit: '' },
    gain: { id: 'gain', label: 'Gain (shelf/peak)', type: 'float', minValue: -40, maxValue: 40, defaultValue: 0, unit: 'dB' },
  }
  // ... other nodes
};

console.log('Audio schema loaded.'); // For quick verification during development
