/**
 * matrix.ts
 *
 * Utilities for handling the routing matrix.
 */
import type { RoutingMatrix } // AudioGraph
from './schema';

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
