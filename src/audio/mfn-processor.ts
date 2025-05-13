import {
  MainThreadMessageType,
  WorkletMessageType,
  type AudioGraph,
  type InitProcessorMessage,
  type MainThreadMessage,
  type UpdateGraphMessage,
  type UpdateParameterMessage,
} from './schema';

// Augment the global scope to include MFNProcessor for registerProcessor
declare global {
  interface AudioWorkletProcessor {
    port: MessagePort;
  }
  function registerProcessor(name: string, processorCtor: (new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor) & { parameterDescriptors?: AudioParamDescriptor[] }): void;
}

class MFNProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph | null = null;
  private sampleRate: number = 0;
  private maxChannels: number = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.port.onmessage = this.handleMessage.bind(this);
    console.log('[MFNProcessor] Initialized and ready for messages.');
    // Optionally, send a ready message back to the main thread
    this.port.postMessage({ type: WorkletMessageType.PROCESSOR_READY });
  }

  static get parameterDescriptors(): AudioParamDescriptor[] {
    // This can be used if your processor has its own AudioParams.
    // For an MFN, parameters are typically managed within the graph nodes.
    return [];
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const { type, payload } = event.data;
    console.log(`[MFNProcessor] Received message: ${type}`, payload);

    switch (type) {
      case MainThreadMessageType.INIT_PROCESSOR:
        this.initialize(payload as InitProcessorMessage['payload']);
        break;
      case MainThreadMessageType.UPDATE_GRAPH:
        this.updateGraph(payload as UpdateGraphMessage['payload']);
        break;
      case MainThreadMessageType.UPDATE_PARAMETER:
        this.updateParameter(payload as UpdateParameterMessage['payload']);
        break;
      case MainThreadMessageType.RENDER_OFFLINE:
        // Placeholder for offline rendering logic
        console.log('[MFNProcessor] RENDER_OFFLINE received, not yet implemented.');
        // This would typically trigger a different processing mode.
        break;
      default:
        console.warn(`[MFNProcessor] Unknown message type: ${type}`);
    }
  }

  private initialize(payload: InitProcessorMessage['payload']): void {
    this.graph = payload.graph;
    this.sampleRate = payload.sampleRate;
    this.maxChannels = payload.maxChannels;
    console.log('[MFNProcessor] Initialized with graph:', this.graph, `Sample Rate: ${this.sampleRate}, Max Channels: ${this.maxChannels}`);
    // Further initialization logic here, e.g., allocating buffers based on maxChannels
  }

  private updateGraph(payload: UpdateGraphMessage['payload']): void {
    this.graph = payload.graph;
    console.log('[MFNProcessor] Graph updated:', this.graph);
    // Logic to reconfigure internal state based on new graph
  }

  private updateParameter(payload: UpdateParameterMessage['payload']): void {
    if (!this.graph) return;
    const node = this.graph.nodes.find(n => n.id === payload.nodeId);
    if (node) {
      if (node.parameters[payload.parameterId] !== undefined) {
        node.parameters[payload.parameterId] = payload.value;
        console.log(`[MFNProcessor] Parameter updated for node ${payload.nodeId}: ${payload.parameterId} = ${payload.value}`);
      } else {
        console.warn(`[MFNProcessor] Parameter ${payload.parameterId} not found on node ${payload.nodeId}`);
      }
    } else {
      console.warn(`[MFNProcessor] Node ${payload.nodeId} not found for parameter update`);
    }
    // Logic to apply parameter change to the DSP kernel
  }

  process(
    inputs: Float32Array[][], // Each input can have multiple channels, each channel is a Float32Array
    outputs: Float32Array[][], // Each output can have multiple channels
    parameters: Record<string, Float32Array> // For AudioParams defined in parameterDescriptors
  ): boolean {
    // For now, just pass through the first input to the first output if available.
    // This is a placeholder until actual DSP logic is implemented in Step 5.
    const input = inputs[0];
    const output = outputs[0];

    if (!this.graph || this.graph.nodes.length === 0) {
      // If no graph or nodes, output silence or pass through
      if (input && output) {
        for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
          output[channel].set(input[channel]);
        }
      }
      return true; // Keep processor alive
    }

    // TODO: Step 5 will implement the core DSP loop here.
    // For now, let's just log that we are processing.
    // console.log('[MFNProcessor] Processing...');

    // Example: Pass-through for testing
    if (input && output) {
      const numChannels = Math.min(input.length, output.length, this.maxChannels || 2);
      for (let i = 0; i < numChannels; i++) {
        if (input[i] && output[i]) {
          output[i].set(input[i]);
        }
      }
    }

    return true; // Keep processor alive
  }
}

try {
  registerProcessor('mfn-processor', MFNProcessor);
} catch (e) {
  console.error('Failed to register MFNProcessor', e);
  // Post error message back if port is available, though it might be too early
  // if (globalThis.postMessage) globalThis.postMessage({ type: 'WORKLET_ERROR', payload: { message: 'Failed to register processor' } });
}
