/**
 * matrix.ts
 *
 * Utilities for handling the routing matrix.
 */
import type { RoutingMatrix, AudioGraph, AudioNodeInstance } from './schema';

/**
 * Validates the structure and dimensions of a routing matrix.
 *
 * @param matrix The routing matrix to validate.
 * @param numNodes The expected number of nodes.
 * @param numChannels The expected number of channels.
 * @returns True if the matrix is valid, false otherwise.
 */
export function isValidRoutingMatrix(
  matrix: RoutingMatrix,
  numNodes: number,
  numChannels: number,
): boolean {
  // Removed !matrix check as RoutingMatrix type implies it's an array
  if (matrix.length !== numChannels) {
    // console.error('Matrix channel dimension mismatch.');
    return false;
  }
  for (let i = 0; i < numChannels; i++) {
    if (!matrix[i] || matrix[i].length !== numNodes) {
      // console.error(`Matrix source node dimension mismatch for channel ${i}.`);
      return false;
    }
    for (let j = 0; j < numNodes; j++) {
      if (!matrix[i][j] || matrix[i][j].length !== numNodes) {
        // console.error(`Matrix destination node dimension mismatch for channel ${i}, source ${j}.`);
        return false;
      }
      // Optionally, check if gain values are within a valid range (e.g., 0-1 or -1 to 1)
      // for (let k = 0; k < numNodes; k++) {
      //   const gain = matrix[i][j][k];
      //   if (typeof gain !== 'number' || isNaN(gain)) {
      //     // console.error(`Invalid gain value at [${i}][${j}][${k}].`);
      //     return false;
      //   }
      // }
    }
  }
  return true;
}

/**
 * Creates an empty routing matrix with specified dimensions, initialized to zero.
 *
 * @param numNodes The number of nodes in the graph.
 * @param numChannels The number of channels.
 * @returns A new routing matrix filled with zeros.
 */
export function createEmptyRoutingMatrix(
  numNodes: number,
  numChannels: number,
): RoutingMatrix {
  const matrix: RoutingMatrix = [];
  for (let c = 0; c < numChannels; c++) {
    matrix[c] = [];
    for (let i = 0; i < numNodes; i++) {
      // Use Array.from to create a typed number array
      const destinationNodes: number[] = Array.from({ length: numNodes }, () => 0);
      matrix[c][i] = destinationNodes;
    }
  }
  return matrix;
}

/**
 * Performs audio routing based on the routing matrix.
 * Calculates the input for each destination node by mixing outputs from all source nodes
 * according to the gains specified in the routing matrix. This operates on a per-channel,
 * per-sample basis.
 *
 * @param sourceNodeOutputs - A Map where keys are source node IDs and values are their output buffers
 *                            (Float32Array[portIndex (0)][channelIndex][sampleIndex]) from the PREVIOUS block.
 * @param graph - The AudioGraph containing the list of nodes and the routingMatrix.
 *                `graph.routingMatrix` is structured as: `matrix[channelIndex][sourceNodeIndex][destinationNodeIndex] = gainValue`.
 *                Node indices correspond to their order in `graph.nodes`.
 * @param numChannels - The number of audio channels to process.
 * @param blockSize - The number of samples in the current processing block.
 * @param destinationNodeInputs - A Map to be populated. Keys are destination node IDs, and values
 *                                will be their calculated input buffers
 *                                (Float32Array[portIndex (0)][channelIndex][sampleIndex]) for the CURRENT block.
 *                                The buffers within this map should be pre-allocated and zeroed before calling.
 */
export function processMatrix(
  sourceNodeOutputs: Map<string, Float32Array[][]>,
  graph: AudioGraph, // graph is non-null when this is called
  numChannels: number,
  blockSize: number,
  destinationNodeInputs: Map<string, Float32Array[][]>, // Output parameter
): void {
  // graph and graph.nodes are guaranteed non-null by caller context in MFNProcessor
  if (!graph.nodes.length || blockSize === 0) {
    return;
  }

  const { nodes, routingMatrix } = graph;

  // Pre-check: Ensure routing matrix dimensions are plausible (basic check)
  // A more thorough validation could be done elsewhere or via isValidRoutingMatrix if needed here.
  if (routingMatrix.length !== numChannels ||
      (numChannels > 0 && routingMatrix[0]?.length !== nodes.length) ||
      (numChannels > 0 && nodes.length > 0 && routingMatrix[0]?.[0]?.length !== nodes.length)
     ) {
    // console.error('[processMatrix] Routing matrix dimensions do not match graph structure or numChannels.');
    // Potentially fill destinationNodeInputs with silence or throw error
    // For now, let's assume initializeGraph and onMessage handlers ensure matrix validity.
    // If matrix is invalid, this loop might behave unpredictably or throw.
  }


  nodes.forEach((destNode: AudioNodeInstance, destNodeIdx: number) => {
    const destInputBufferSet = destinationNodeInputs.get(destNode.id);

    if (!destInputBufferSet?.[0]) {
      // This should not happen if destinationNodeInputs is prepared correctly
      // console.warn(`[processMatrix] Missing input buffer for destination node: ${destNode.id}`);
      return;
    }
    const destNodeChannelBuffers = destInputBufferSet[0]; // Assuming one output port (index 0)

    for (let chan = 0; chan < numChannels; chan++) {
      if (!destNodeChannelBuffers[chan]) continue; // Should not happen if prepared

      // Ensure the destination buffer for this channel is zeroed before accumulation
      // This is important if this function is called multiple times or if buffers are reused.
      // However, the current plan is that `destinationNodeInputs` are freshly created/zeroed
      // in MFNProcessor before this call. If so, this fill(0) is redundant.
      // For safety, or if that assumption changes, uncomment:
      // destNodeChannelBuffers[chan].fill(0);


      for (let sample = 0; sample < blockSize; sample++) {
        let accumulatedSample = 0;

        nodes.forEach((srcNode: AudioNodeInstance, srcNodeIdx: number) => {
          const srcOutputBufferSet = sourceNodeOutputs.get(srcNode.id);

          if (srcOutputBufferSet?.[0]?.[chan]) {
            // graph.routingMatrix[channelIndex][sourceNodeIndex][destinationNodeIndex]
            const gain = routingMatrix[chan]?.[srcNodeIdx]?.[destNodeIdx] ?? 0;
            if (gain === 0) {
              return; // equivalent to continue in forEach
            }

            const sourceSample = srcOutputBufferSet[0][chan][sample];
            accumulatedSample += sourceSample * gain;
          }
        });
        destNodeChannelBuffers[chan][sample] = accumulatedSample;
      }
    }
  });
}
