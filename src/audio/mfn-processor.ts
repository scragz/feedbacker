/**
 * mfn-processor.ts
 * AudioWorkletProcessor for the Multichannel Feedback Network.
 */

import './types';
// Import the global declarations for AudioWorklet scope
import './mfn-globals.d';

import {
  type AudioGraph,
  type AudioNodeInstance,
  type NodeId,
  type MainThreadMessage,
  MainThreadMessageType,
  WorkletMessageType,
  type InitProcessorMessage,
  type UpdateGraphMessage,
  type AddNodeMessage,
  type RemoveNodeMessage,
  type UpdateParameterMessage,
  type SetGlobalParameterMessage,
  type RoutingMatrix,
  NODE_PARAMETER_DEFINITIONS,
  type ParameterDefinition,
  type ParameterValue,
} from './schema';
import { kernelRegistry } from '../lib/kernel-registry';
import type { DSPKernel, NodeState } from './nodes/dsp-kernel';
import { passthroughKernel } from './nodes/passthrough';
import { LFOProcessor } from './nodes/lfo';
import { EnvelopeFollower } from './nodes/envelope-follower';

// Make TypeScript aware of the global variables
declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
};

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void;

const DEFAULT_BLOCK_SIZE = 128;
const DEFAULT_OUTPUT_CHANNELS = 2;

class MfnProcessor extends AudioWorkletProcessor {
  private graph: AudioGraph | null = null;
  private kernels: Map<NodeId, DSPKernel> = new Map<NodeId, DSPKernel>();
  private nodeStates: Map<NodeId, NodeState> = new Map<NodeId, NodeState>();
  private previousKernelOutputBuffers: Map<NodeId, Float32Array[]> = new Map<NodeId, Float32Array[]>();
  private nodeOrder: NodeId[] = [];

  // Access the sampleRate directly as it's available in the AudioWorklet scope
  // We know sampleRate exists in the AudioWorklet context
  private sampleRateInternal = 44100;
  private maxOutputChannels = DEFAULT_OUTPUT_CHANNELS;
  private chaosValue = 0; // Added internal state for chaos

  // Global LFO and envelope follower processors
  private lfo1: LFOProcessor;
  private lfo2: LFOProcessor;
  private envelopeFollower1: EnvelopeFollower;
  private envelopeFollower2: EnvelopeFollower;

  // Store current LFO values for each processing block
  private lfo1Value = 0;
  private lfo2Value = 0;

  private currentBlockOutputChannels = DEFAULT_OUTPUT_CHANNELS;
  private currentBlockSize = DEFAULT_BLOCK_SIZE;

  private logCounter = 0;
  private readonly logThrottle = 200;

  private isInitialized = false;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);

    // Initialize sampleRateInternal from the global sampleRate available in AudioWorklet scope
    // TypeScript won't recognize this in class fields, but it exists at runtime
    this.sampleRateInternal = sampleRate;

    if (options?.processorOptions) {
      const processorOpts = options.processorOptions as MFNProcessorOptions;
      if (processorOpts.sampleRate !== undefined) {
        this.sampleRateInternal = processorOpts.sampleRate;
      }
      if (processorOpts.maxChannels !== undefined) {
        this.maxOutputChannels = processorOpts.maxChannels;
      }
    }

    // Initialize global LFOs and envelope followers
    this.lfo1 = new LFOProcessor(1, 'sine', 0, this.sampleRateInternal); // Changed amount from 1 to 0
    this.lfo2 = new LFOProcessor(0.5, 'triangle', 0, this.sampleRateInternal); // Changed amount from 1 to 0
    this.envelopeFollower1 = new EnvelopeFollower(0.01, 0.1, 0, this.sampleRateInternal); // Changed amount from 1 to 0
    this.envelopeFollower2 = new EnvelopeFollower(0.05, 0.5, 0, this.sampleRateInternal); // Changed amount from 1 to 0

    this.port.onmessage = this.handleMessage.bind(this);
    console.log('[MFNProcessor] Initialized. Sample Rate:', this.sampleRateInternal, 'Max Channels:', this.maxOutputChannels);
  }

  private handleMessage(event: MessageEvent<MainThreadMessage>): void {
    const { type, payload } = event.data;
    // console.log(`[MFNProcessor] Received message: ${type}`, payload);

    try {
      switch (type) {
        case MainThreadMessageType.INIT_PROCESSOR:
          this._initProcessor(payload);
          break;
        case MainThreadMessageType.UPDATE_GRAPH:
          this._updateGraph(payload);
          break;
        case MainThreadMessageType.ADD_NODE:
          this._addNode(payload);
          break;
        case MainThreadMessageType.REMOVE_NODE:
          this._removeNode(payload);
          break;
        case MainThreadMessageType.UPDATE_PARAMETER:
          this._updateParameter(payload);
          break;
        case MainThreadMessageType.SET_GLOBAL_PARAMETER:
          this._setGlobalParameter(payload);
          break;
        case MainThreadMessageType.CHECK_PROCESSOR_STATUS: // Added case
          this._checkProcessorStatus();
          break;
        default:
          console.warn(`[MFNProcessor] Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error(`[MFNProcessor] Error handling message ${type}:`, error);
      this.port.postMessage({
        type: WorkletMessageType.WORKLET_ERROR,
        payload: { message: `Error in ${type}: ${(error as Error).message}` },
      });
    }
  }

  private _initProcessor(payload: InitProcessorMessage['payload']): void {
    console.log('[MFNProcessor] Initializing with graph:', payload.graph);
    this.sampleRateInternal = payload.sampleRate;
    this.maxOutputChannels = payload.maxChannels;
    this.graph = payload.graph;

    // Update chaos value
    this.chaosValue = this.graph.chaosLevel ?? 0;

    // Configure global LFOs from graph settings
    if (this.graph.lfo1) {
      this.lfo1.setFrequency(this.graph.lfo1.frequency);
      this.lfo1.setWaveform(this.graph.lfo1.waveform);
      this.lfo1.setAmount(this.graph.lfo1.amount);
      this.lfo1.setEnabled(this.graph.lfo1.enabled);
    }

    if (this.graph.lfo2) {
      this.lfo2.setFrequency(this.graph.lfo2.frequency);
      this.lfo2.setWaveform(this.graph.lfo2.waveform);
      this.lfo2.setAmount(this.graph.lfo2.amount);
      this.lfo2.setEnabled(this.graph.lfo2.enabled);
    }

    // Configure envelope followers from graph settings
    if (this.graph.envelopeFollower1) {
      this.envelopeFollower1.setAttackTime(this.graph.envelopeFollower1.attack, this.sampleRateInternal);
      this.envelopeFollower1.setReleaseTime(this.graph.envelopeFollower1.release, this.sampleRateInternal);
      this.envelopeFollower1.setAmount(this.graph.envelopeFollower1.amount);
      this.envelopeFollower1.setEnabled(this.graph.envelopeFollower1.enabled);
      this.envelopeFollower1.setSource(this.graph.envelopeFollower1.source);
    }

    if (this.graph.envelopeFollower2) {
      this.envelopeFollower2.setAttackTime(this.graph.envelopeFollower2.attack, this.sampleRateInternal);
      this.envelopeFollower2.setReleaseTime(this.graph.envelopeFollower2.release, this.sampleRateInternal);
      this.envelopeFollower2.setAmount(this.graph.envelopeFollower2.amount);
      this.envelopeFollower2.setEnabled(this.graph.envelopeFollower2.enabled);
      this.envelopeFollower2.setSource(this.graph.envelopeFollower2.source);
    }

    this._buildGraphInternals();
    this.isInitialized = true;
    // Though PROCESSOR_READY doesn't send the graph, let's log what the graph state is after init.
    console.log('[MFNProcessor] After _initProcessor, graph nodes count:', this.graph.nodes.length);
    this.port.postMessage({ type: WorkletMessageType.PROCESSOR_READY });
    console.log('[MFNProcessor] Processor ready.');
  }

  private _updateGraph(payload: UpdateGraphMessage['payload']): void {
    if (!this.isInitialized) {
      console.warn('[MFNProcessor] Received UPDATE_GRAPH before initialization. Graph will be set, but ensure INIT_PROCESSOR provides all necessary context (sampleRate, maxChannels).');
      this.graph = payload.graph;
    } else {
      this.graph = payload.graph;
    }
    console.log('[MFNProcessor] Updating graph with payload:', payload.graph);
    this._buildGraphInternals();
    console.log('[MFNProcessor] After _updateGraph and _buildGraphInternals, sending GRAPH_UPDATED. Nodes count:', this.graph.nodes.length, 'Node IDs:', this.graph.nodes.map(n => n.id).join(', '));
    this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
  }

  private _buildGraphInternals(): void {
    if (!this.graph) {
      console.warn('[MFNProcessor] _buildGraphInternals called with no graph.');
      return;
    }

    this.kernels.clear();
    this.nodeStates.clear();
    this.previousKernelOutputBuffers.clear();
    this.nodeOrder = this.graph.nodes.map(n => n.id);

    const defaultNodeChannelCount = this.graph.outputChannels;

    for (const node of this.graph.nodes) {
      // const kernel = kernelRegistry[node.type] ?? passthroughKernel; // Old way
      const kernel = kernelRegistry.getKernel(node.type) ?? passthroughKernel; // New way
      this.kernels.set(node.id, kernel);

      const initialState: NodeState = {};
      if (node.type === 'delay') {
        initialState.delayBuffer = new Float32Array(this.sampleRateInternal * 2);
        initialState.writePosition = 0;
      }
      this.nodeStates.set(node.id, initialState);

      const nodeChannelCount = node.channelCount ?? defaultNodeChannelCount;
      const prevOutputs: Float32Array[] = Array.from(
        { length: nodeChannelCount },
        // this.currentBlockSize might not be set before the first process call, so default is safer
        () => new Float32Array(this.currentBlockSize || DEFAULT_BLOCK_SIZE).fill(0)
      );
      this.previousKernelOutputBuffers.set(node.id, prevOutputs);
    }

    if (this.graph.routingMatrix.length === 0) { // Corrected: routingMatrix is AudioGraph member, so not null
      console.log('[MFNProcessor] Routing matrix is empty, creating default.');
      this._createDefaultRoutingMatrix();
    } else {
      const numNodes = this.graph.nodes.length;
      const expectedChannels = this.graph.outputChannels;
      if (this.graph.nodes.length > 0 && (
          this.graph.routingMatrix.length !== expectedChannels ||
          this.graph.routingMatrix[0]?.length !== numNodes ||
          this.graph.routingMatrix[0]?.[0]?.length !== numNodes )) {
        console.warn('[MFNProcessor] Routing matrix dimensions mismatch graph. Recreating default matrix.');
        this._createDefaultRoutingMatrix();
      }
    }
    console.log('[MFNProcessor] Graph internals rebuilt. Kernels:', this.kernels.size, 'Node order:', this.nodeOrder, 'Matrix:', this.graph.routingMatrix);
  }

  private _getNodeIndex(nodeId: NodeId): number {
    return this.nodeOrder.indexOf(nodeId);
  }

  private _addNode(payload: AddNodeMessage['payload']): void {
    if (!this.graph) {
      console.log('[MFNProcessor] No graph exists, creating a new one for ADD_NODE.');
      this.graph = {
        nodes: [],
        routingMatrix: [] as RoutingMatrix,
        outputChannels: this.maxOutputChannels,
        masterGain: 1.0,
      };
      this.nodeOrder = [];
    }

    const { nodeInstance } = payload;
    if (this.kernels.has(nodeInstance.id)) {
      console.warn(`[MFNProcessor] Node with ID ${nodeInstance.id} already exists. Ignoring ADD_NODE.`);
      return;
    }

    console.log(`[MFNProcessor] Before adding node ${nodeInstance.id}, current nodes count: ${this.graph.nodes.length}, IDs: ${this.graph.nodes.map(n => n.id).join(', ')}`);
    this.graph.nodes.push(nodeInstance);
    this.nodeOrder.push(nodeInstance.id);
    console.log(`[MFNProcessor] After adding node ${nodeInstance.id} to array, current nodes count: ${this.graph.nodes.length}, IDs: ${this.graph.nodes.map(n => n.id).join(', ')}`);


    const kernel = kernelRegistry.getKernel(nodeInstance.type) ?? passthroughKernel;
    this.kernels.set(nodeInstance.id, kernel);
    this.nodeStates.set(nodeInstance.id, {});

    const nodeChannelCount = nodeInstance.channelCount ?? this.graph.outputChannels;

    const prevOutputs: Float32Array[] = Array.from(
      { length: nodeChannelCount },
      () => new Float32Array(this.currentBlockSize || DEFAULT_BLOCK_SIZE).fill(0)
    );
    this.previousKernelOutputBuffers.set(nodeInstance.id, prevOutputs);

    this._resizeAndAdaptRoutingMatrixForAddedNode(nodeInstance);

    console.log(`[MFNProcessor] Node ${nodeInstance.id} added. Sending GRAPH_UPDATED. Nodes count: ${this.graph.nodes.length}, Node IDs: ${this.graph.nodes.map(n => n.id).join(', ')}`);
    this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
  }

  private _resizeAndAdaptRoutingMatrixForAddedNode(addedNode: AudioNodeInstance): void {
    if (!this.graph) return;

    const oldNumNodes = this.graph.nodes.length - 1; // Assuming node already added to graph.nodes
    const newNumNodes = this.graph.nodes.length;
    const numChannels = this.graph.outputChannels; // No ?? needed

    const newMatrixCorrected: RoutingMatrix = Array.from({ length: numChannels }, () =>
        Array.from({ length: newNumNodes }, () => Array(newNumNodes).fill(0) as number[])
    );

    // if (oldNumNodes > 0 && this.graph.routingMatrix && this.graph.routingMatrix.length === numChannels) {
    // The this.graph.routingMatrix check is implicitly handled by oldMatrixSourceNodes > 0 or oldMatrixDestNodes > 0 if matrix can be empty array
    // The .length === numChannels check is also implicitly handled if we assume a valid prior state or handle reconstruction if not.
    if (oldNumNodes > 0) { // Simplified: if there were nodes before, try to copy their connections
      const oldMatrixChannels = this.graph.routingMatrix.length;
      const oldMatrixSourceNodes = this.graph.routingMatrix[0]?.length ?? 0;
      const oldMatrixDestNodes = this.graph.routingMatrix[0]?.[0]?.length ?? 0;

      if (oldMatrixChannels === numChannels && oldMatrixSourceNodes === oldNumNodes && oldMatrixDestNodes === oldNumNodes) {
        for (let c = 0; c < numChannels; c++) {
          for (let i = 0; i < oldNumNodes; i++) {
            for (let j = 0; j < oldNumNodes; j++) {
              // No need for undefined check if matrix is guaranteed to be filled with numbers
              newMatrixCorrected[c][i][j] = this.graph.routingMatrix[c][i][j];
            }
          }
        }
      } else {
        console.warn('[MFNProcessor] _resizeAndAdaptRoutingMatrixForAddedNode: Old matrix dimensions mismatch or invalid. Starting with a fresh zeroed matrix for new size.');
      }
    }
    this.graph.routingMatrix = newMatrixCorrected;

    const addedNodeIndex = this._getNodeIndex(addedNode.id);
    if (addedNodeIndex === -1) {
        console.error("[MFNProcessor] _resizeAndAdaptRoutingMatrixForAddedNode: Added node not found in nodeOrder. This shouldn't happen.");
        return;
    }

    const outputMixerNode = this.graph.nodes.find(n => n.type === 'output_mixer');
    // Important: get outputMixerIndex from the *current* nodeOrder, which includes the addedNode
    const outputMixerIndex = outputMixerNode ? this._getNodeIndex(outputMixerNode.id) : -1;

    if (outputMixerNode && outputMixerIndex !== -1) { // Output mixer exists in the graph
      if (addedNode.id !== outputMixerNode.id) { // The added node is NOT the output mixer
        // Connect the new node's output to the output_mixer's input
        for (let c = 0; c < numChannels; c++) {
          this.graph.routingMatrix[c][addedNodeIndex][outputMixerIndex] = 1.0;
        }
        console.log(`[MFNProcessor] Default Route: Connected new node ${addedNode.id} (idx ${addedNodeIndex}) output to ${outputMixerNode.id} (idx ${outputMixerIndex}) input.`);
      } else { // The added node IS the output mixer itself
        // Connect all OTHER existing non-mixer nodes to this newly added output_mixer
        for (let i = 0; i < newNumNodes; i++) {
          // If node 'i' is not the output_mixer itself AND its type is not 'output_mixer' (defensive)
          if (i !== addedNodeIndex && this.graph.nodes[i].type !== 'output_mixer') {
            for (let c = 0; c < numChannels; c++) {
              this.graph.routingMatrix[c][i][addedNodeIndex] = 1.0; // Source i to Dest addedNode (which is the output_mixer)
            }
            console.log(`[MFNProcessor] Default Route: Connected existing node ${this.graph.nodes[i].id} (idx ${i}) output to new ${addedNode.id} (idx ${addedNodeIndex}) input.`);
          }
        }
      }
    } else { // No output_mixer in the graph
      console.log(`[MFNProcessor] Default Route: No output_mixer. Added node ${addedNode.id} (idx ${addedNodeIndex}). Routing matrix not auto-connected for this node. Outputs will be summed.`);
    }
    // console.log('[MFNProcessor] _resizeAndAdaptRoutingMatrixForAddedNode completed. Matrix:', JSON.parse(JSON.stringify(this.graph.routingMatrix)));
  }

  private _removeNode(payload: RemoveNodeMessage['payload']): void {
    if (!this.graph) {
      console.error('[MFNProcessor] Cannot remove node: graph not initialized.');
      return;
    }
    const { nodeId } = payload;
    const nodeIndex = this._getNodeIndex(nodeId);

    if (nodeIndex === -1) {
      console.warn(`[MFNProcessor] Node with ID ${nodeId} not found. Ignoring REMOVE_NODE.`);
      return;
    }
    console.log(`[MFNProcessor] Before removing node ${nodeId}, current nodes count: ${this.graph.nodes.length}, IDs: ${this.graph.nodes.map(n => n.id).join(', ')}`);
    this.graph.nodes.splice(nodeIndex, 1);
    this.nodeOrder.splice(nodeIndex, 1);
    console.log(`[MFNProcessor] After removing node ${nodeId} from array, current nodes count: ${this.graph.nodes.length}, IDs: ${this.graph.nodes.map(n => n.id).join(', ')}`);


    this.kernels.delete(nodeId);
    this.nodeStates.delete(nodeId);
    this.previousKernelOutputBuffers.delete(nodeId);

    this._createDefaultRoutingMatrix();

    console.log(`[MFNProcessor] Node ${nodeId} removed. Sending GRAPH_UPDATED. Nodes count: ${this.graph.nodes.length}, Node IDs: ${this.graph.nodes.map(n => n.id).join(', ')}`);
    this.port.postMessage({ type: WorkletMessageType.GRAPH_UPDATED, payload: this.graph });
  }

  private _updateParameter(payload: UpdateParameterMessage['payload']): void {
    if (!this.graph) return;
    const { nodeId, parameterId, value } = payload;
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (node) {
      // node.parameters is already initialized as {} in AudioNodeInstance, so ?? {} is not strictly needed
      // if it can be undefined by other means, then it's fine.
      // Assuming it's always present as per schema for existing nodes:
      node.parameters[parameterId] = value;
      this.port.postMessage({
        type: WorkletMessageType.PARAMETER_UPDATED,
        payload: { nodeId, parameterId, value },
      });
    } else {
      console.warn(`[MFNProcessor] Node ${nodeId} not found for parameter update.`);
    }
  }

  private _setGlobalParameter(payload: SetGlobalParameterMessage['payload']): void {
    if (!this.graph) return;
    const { parameterId, value } = payload;
    if (parameterId === 'masterGain' && typeof value === 'number') {
        this.graph.masterGain = value;
        console.log(`[MFNProcessor] Master gain updated to ${value}.`);
        // It might be good to send GRAPH_UPDATED if masterGain is part of the graph state
        // that the main thread might want to be aware of for UI syncing.
        // However, if it's purely an audio processing param, this is fine.
        // For now, let's assume App.tsx handles its own masterGain UI if needed
        // and this message is primarily for the worklet's internal gain.
    } else if (parameterId === 'chaos' && typeof value === 'number') {
        this.chaosValue = value;
        console.log(`[MFNProcessor] Chaos value updated to ${this.chaosValue}.`);
    } else {
        console.warn(`[MFNProcessor] Unknown global parameter: ${parameterId}`);
    }
  }

  // Added method
  private _checkProcessorStatus(): void {
    this.port.postMessage({
      type: WorkletMessageType.PROCESSOR_STATUS,
      payload: {
        isInitialized: this.isInitialized,
        graphNodeCount: this.graph ? this.graph.nodes.length : null,
      },
    });
  }

  /**
   * Calculate modulated parameter values based on node's modulation settings
   * and the current state of global LFOs and envelope followers
   */
  private _calculateModulatedParameters(
    node: AudioNodeInstance,
    nodeParamDefs: Record<string, ParameterDefinition<ParameterValue>>
  ): Record<string, ParameterValue> {
    // Start with a copy of the original parameters
    const modulated: Record<string, ParameterValue> = { ...node.parameters } as Record<string, ParameterValue>;

    // Skip if node has no modulation or chaos is zero and no modulators are active
    if (!node.modulation ||
        (this.chaosValue === 0 &&
         !this.lfo1.isEnabled() &&
         !this.lfo2.isEnabled() &&
         !this.envelopeFollower1.isEnabled() &&
         !this.envelopeFollower2.isEnabled())) {
      return modulated;
    }

    // Get current modulator values
    const lfo1Value = this.lfo1Value;
    const lfo2Value = this.lfo2Value;
    const env1Value = this.envelopeFollower1.getCurrentValue();
    const env2Value = this.envelopeFollower2.getCurrentValue();

    // Process each parameter that has modulation configured
    for (const [paramId, paramMods] of Object.entries(node.modulation)) {
      // Get the original parameter value and its definition
      const originalValue = node.parameters[paramId];
      const paramDef = nodeParamDefs[paramId];

      // Skip if not a numeric parameter
      if (typeof originalValue !== 'number') continue;
      // Skip if no parameter definition exists
      if (paramDef === undefined) continue;

      // Base amount is the parameter value (already checked that it's a number)
      const baseValue = originalValue;
      let totalModulation = 0;

      // Calculate the modulation range based on parameter definition
      const minValue = typeof paramDef.minValue === 'number' ? paramDef.minValue : 0;
      const maxValue = typeof paramDef.maxValue === 'number' ? paramDef.maxValue : 1;
      const range = maxValue - minValue;

      // Calculate chaos-scaled modulation for each source
      if (paramMods.lfo1?.enabled) {
        // Scale modulation by chaos value (0-100)
        const chaosScale = 1 + (this.chaosValue / 100) * 3; // Max 4x at chaos 100
        totalModulation += lfo1Value * paramMods.lfo1.amount * chaosScale;
      }

      if (paramMods.lfo2?.enabled) {
        const chaosScale = 1 + (this.chaosValue / 100) * 3;
        totalModulation += lfo2Value * paramMods.lfo2.amount * chaosScale;
      }

      if (paramMods.env1?.enabled) {
        const chaosScale = 1 + (this.chaosValue / 100) * 2;
        totalModulation += env1Value * paramMods.env1.amount * chaosScale;
      }

      if (paramMods.env2?.enabled) {
        const chaosScale = 1 + (this.chaosValue / 100) * 2;
        totalModulation += env2Value * paramMods.env2.amount * chaosScale;
      }

      // Apply extra chaos to certain parameter types
      const extraChaosParams = [
        'frequency', 'q', 'resonance', 'feedback', 'distortion', 'drive'
      ];

      if (this.chaosValue > 0 && extraChaosParams.some(term => paramId.toLowerCase().includes(term))) {
        // Add additional direct chaos modulation to sensitive parameters
        const chaosMod = (Math.random() * 2 - 1) * (this.chaosValue / 100) * 0.2;
        totalModulation += chaosMod;
      }

      // Calculate modulated value
      let modulatedValue: number;

      if (paramDef.scale === 'logarithmic' && baseValue > 0) {
        // For logarithmic parameters, modulate in logarithmic space
        const logBase = Math.log10(baseValue);
        const logMin = Math.log10(Math.max(0.000001, minValue)); // Avoid log(0)
        const logMax = Math.log10(maxValue);
        const logRange = logMax - logMin;

        // Apply modulation in log space
        const modulatedLog = logBase + totalModulation * logRange * 0.5;
        modulatedValue = Math.pow(10, modulatedLog);
      } else {
        // Linear modulation
        modulatedValue = baseValue + totalModulation * range * 0.5;
      }

      // Clamp to parameter range
      modulatedValue = Math.max(minValue, Math.min(maxValue, modulatedValue));

      // For integer parameters, round to nearest integer
      if (paramDef.type === 'integer') {
        modulatedValue = Math.round(modulatedValue);
      }

      // Apply the modulated value
      modulated[paramId] = modulatedValue;
    }

    return modulated;
  }

  private _createDefaultRoutingMatrix(): void {
    if (!this.graph || this.graph.nodes.length === 0) {
      if (this.graph) this.graph.routingMatrix = [] as RoutingMatrix;
      console.log('[MFNProcessor] _createDefaultRoutingMatrix: No graph or no nodes, matrix cleared.');
      return;
    }

    const numNodes = this.graph.nodes.length;
    const numChannels = this.graph.outputChannels; // No ?? needed

    this.graph.routingMatrix = Array.from({ length: numChannels }, () =>
      Array.from({ length: numNodes }, () => Array(numNodes).fill(0) as number[])
    );

    const outputMixerNode = this.graph.nodes.find(n => n.type === 'output_mixer');
    const outputMixerIndex = outputMixerNode ? this._getNodeIndex(outputMixerNode.id) : -1;

    if (outputMixerIndex !== -1) { // Output mixer exists
      // Route all OTHER nodes to the output_mixer
      for (let i = 0; i < numNodes; i++) {
        if (i !== outputMixerIndex) { // If it's not the output_mixer itself
          for (let c = 0; c < numChannels; c++) {
            this.graph.routingMatrix[c][i][outputMixerIndex] = 1.0; // Source i to Dest output_mixer
          }
        }
      }
      console.log('[MFNProcessor] _createDefaultRoutingMatrix: Output_mixer found. Non-mixer nodes routed to it.');
    } else { // No output_mixer, but other nodes exist
      console.log('[MFNProcessor] _createDefaultRoutingMatrix: No output_mixer. Routing matrix is zeros. Node outputs will be summed directly in process().');
    }
    // console.log('[MFNProcessor] _createDefaultRoutingMatrix completed. Matrix:', JSON.parse(JSON.stringify(this.graph.routingMatrix)));
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    if (!this.isInitialized || !this.graph || this.graph.nodes.length === 0) {
      // Fill outputs with silence if not ready
      for (const output of outputs) {
        for (const channelData of output) {
          channelData.fill(0);
        }
      }
      return true;
    }

    this.currentBlockOutputChannels = outputs[0]?.length ?? DEFAULT_OUTPUT_CHANNELS;
    this.currentBlockSize = outputs[0]?.[0]?.length ?? DEFAULT_BLOCK_SIZE;

    const masterGain = this.graph.masterGain;
    const numNodes = this.graph.nodes.length;
    const nodeInstances = this.graph.nodes;

    // Log global parameters for debugging
    if (this.logCounter % this.logThrottle === 0) {
        console.log(`[MFNProcessor process] Master Gain: ${masterGain}, Chaos: ${this.chaosValue}`);
    }

    const currentKernelOutputBuffers: Map<NodeId, Float32Array[]> = new Map<NodeId, Float32Array[]>();
    for (const node of nodeInstances) {
      const nodeEffectiveChannelCount = node.channelCount ?? this.currentBlockOutputChannels;
      currentKernelOutputBuffers.set(
        node.id,
        Array.from({ length: nodeEffectiveChannelCount }, () => new Float32Array(this.currentBlockSize).fill(0))
      );
    }

    for (let destNodeOrderIdx = 0; destNodeOrderIdx < numNodes; destNodeOrderIdx++) {
      const destNode = nodeInstances[destNodeOrderIdx];
      const destNodeId = destNode.id;
      const destNodeEffectiveChannelCount = destNode.channelCount ?? this.currentBlockOutputChannels;
      const kernel = this.kernels.get(destNodeId);
      const state = this.nodeStates.get(destNodeId) ?? {};

      if (!kernel) continue;

      const mixedInputsForDestNode: Float32Array[] = Array.from(
        { length: destNodeEffectiveChannelCount },
        () => new Float32Array(this.currentBlockSize).fill(0)
      );

      for (let inputChannelIdx = 0; inputChannelIdx < destNodeEffectiveChannelCount; inputChannelIdx++) {
        for (let sourceNodeOrderIdx = 0; sourceNodeOrderIdx < numNodes; sourceNodeOrderIdx++) {
          const sourceNode = nodeInstances[sourceNodeOrderIdx];
          const sourceNodeId = sourceNode.id;
          const sourceNodeEffectiveChannelCount = sourceNode.channelCount ?? this.currentBlockOutputChannels;

          if (inputChannelIdx < sourceNodeEffectiveChannelCount) {
            const gain = this.graph.routingMatrix[inputChannelIdx]?.[sourceNodeOrderIdx]?.[destNodeOrderIdx] ?? 0;
            if (gain > 0) {
              const sourceOutputBufferFromPreviousBlock = this.previousKernelOutputBuffers.get(sourceNodeId)?.[inputChannelIdx];
              if (sourceOutputBufferFromPreviousBlock) {
                for (let s = 0; s < this.currentBlockSize; s++) {
                  mixedInputsForDestNode[inputChannelIdx][s] += sourceOutputBufferFromPreviousBlock[s] * gain;
                }
              }
            }
          }
        }
      }

      // Process global LFOs and envelope followers
      if (this.lfo1.isEnabled()) {
        this.lfo1Value = this.lfo1.process();
      }

      if (this.lfo2.isEnabled()) {
        this.lfo2Value = this.lfo2.process();
      }

      // Process envelope followers using input from relevant nodes
      if (this.envelopeFollower1.isEnabled() && this.envelopeFollower1.isForSource(destNodeId)) {
        // Use the first channel of mixed inputs as the envelope source
        for (let s = 0; s < this.currentBlockSize; s++) {
          this.envelopeFollower1.process(Math.abs(mixedInputsForDestNode[0][s]));
        }
      }

      if (this.envelopeFollower2.isEnabled() && this.envelopeFollower2.isForSource(destNodeId)) {
        // Use the first channel of mixed inputs as the envelope source
        for (let s = 0; s < this.currentBlockSize; s++) {
          this.envelopeFollower2.process(Math.abs(mixedInputsForDestNode[0][s]));
        }
      }

      // Get parameter definitions for this node type
      const nodeType = destNode.type;
      const paramDefs = NODE_PARAMETER_DEFINITIONS[nodeType];

      // Calculate modulated parameters for this node if needed
      const hasModulation = destNode.modulation && Object.keys(destNode.modulation).length > 0;
      const modulatedParams = (hasModulation || this.chaosValue > 0)
        ? this._calculateModulatedParameters(destNode, paramDefs)
        : destNode.parameters;

      const kernelSpecificOutputs = currentKernelOutputBuffers.get(destNodeId);
      if (kernelSpecificOutputs === undefined) {
        // This should ideally not happen if currentKernelOutputBuffers is populated correctly for all nodes
        if (this.logCounter % (this.logThrottle * 10) === 0) {
            console.warn(`[MFNProcessor process] Missing currentKernelOutputBuffers for node ${destNodeId}. Skipping kernel processing for this node.`);
        }
        continue;
      }
      // Corrected kernel call arguments with modulated parameters
      kernel(
        mixedInputsForDestNode,
        kernelSpecificOutputs,
        modulatedParams, // Use modulated parameters
        state, // Corrected: Pass node state
        this.sampleRateInternal, // Corrected: Pass sample rate
        this.currentBlockSize, // Corrected: Pass block size
        destNodeEffectiveChannelCount // Corrected: Pass channel count
      );
    }

    const finalOutputBuffers = outputs[0]; // Assuming outputs[0] is the main output

    // Clear final output buffers before summing
    for (const channelData of finalOutputBuffers) {
      channelData.fill(0);
    }

    let outputMixerFound = false;
    const outputMixerNode = nodeInstances.find(n => n.type === 'output_mixer');

    if (outputMixerNode) {
      outputMixerFound = true;
      const outputMixerBuffers = currentKernelOutputBuffers.get(outputMixerNode.id);
      if (outputMixerBuffers) {
        for (let i = 0; i < Math.min(finalOutputBuffers.length, outputMixerBuffers.length); i++) {
          for (let s = 0; s < this.currentBlockSize; s++) {
            finalOutputBuffers[i][s] = outputMixerBuffers[i][s]; // Directly take output_mixer's output
          }
        }
      } else {
        if (this.logCounter % this.logThrottle === 0) {
            console.warn(`[MFNProcessor process] Output mixer node (${outputMixerNode.id}) found, but its buffers are not in currentKernelOutputBuffers.`);
        }
      }
    } else {
      // Fallback: if no output_mixer, sum all node outputs (excluding any other potential mixers if that logic was more complex)
      // This simple sum might not be ideal for complex graphs without an explicit mixer.
      if (this.logCounter % this.logThrottle === 0) {
        console.log('[MFNProcessor process] No output_mixer node found. Summing all node outputs directly (if any).');
      }
      for (const node of nodeInstances) {
        const nodeOutputBuffers = currentKernelOutputBuffers.get(node.id);
        if (nodeOutputBuffers) {
          for (let i = 0; i < Math.min(finalOutputBuffers.length, nodeOutputBuffers.length); i++) {
            for (let s = 0; s < this.currentBlockSize; s++) {
              finalOutputBuffers[i][s] += nodeOutputBuffers[i][s]; // Summing
            }
          }
        }
      }
    }

    // Log a snippet of pre-gain output for the first channel
    if (this.logCounter % this.logThrottle === 0 && finalOutputBuffers[0] && finalOutputBuffers[0].length > 5) {
        console.log(`[MFNProcessor process] OutputMixerFound: ${outputMixerFound}. Pre-MasterGain Output (Ch0, 5 samples): ${finalOutputBuffers[0].slice(0, 5).join(', ')}`);
    }

    // Apply master gain
    for (const channelBuffer of finalOutputBuffers) {
      for (let s = 0; s < this.currentBlockSize; s++) {
        channelBuffer[s] *= masterGain;
      }
    }

    // Apply mono mode if enabled
    if (this.graph.isMono && finalOutputBuffers.length > 1) {
      // Compute mono signal as average of all channels
      const monoBuffer = new Float32Array(this.currentBlockSize);
      for (let s = 0; s < this.currentBlockSize; s++) {
        let monoSample = 0;
        let channelCount = 0;
        for (const channelBuffer of finalOutputBuffers) {
          monoSample += channelBuffer[s];
          channelCount++;
        }
        monoBuffer[s] = monoSample / channelCount;
      }

      // Copy mono signal to all output channels
      for (const channelBuffer of finalOutputBuffers) {
        for (let s = 0; s < this.currentBlockSize; s++) {
          channelBuffer[s] = monoBuffer[s];
        }
      }

      if (this.logCounter % this.logThrottle === 0) {
        console.log('[MFNProcessor process] Mono mode applied. All channels set to the same signal.');
      }
    }

    // Log a snippet of post-gain output for the first channel
    if (this.logCounter % this.logThrottle === 0 && finalOutputBuffers[0] && finalOutputBuffers[0].length > 5) {
        console.log(`[MFNProcessor process] Post-MasterGain Output (Ch0, 5 samples): ${finalOutputBuffers[0].slice(0, 5).join(', ')}`);
    }


    this.previousKernelOutputBuffers = new Map(currentKernelOutputBuffers); // Save current outputs for next block's feedback

    this.logCounter++;
    return true;
  }
}

registerProcessor('mfn-processor', MfnProcessor);
export {}; // Ensures this is a module
