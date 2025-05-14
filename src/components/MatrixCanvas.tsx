import React, { useRef, useEffect, useCallback } from 'react';
import { type AudioGraph, type NodeId } from '../audio/schema';
import { drawGrid } from '../lib/canvas-utils';

const LABEL_SIZE = 60; // Space for labels (e.g., 60px for "Source:" and node names)
const CELL_LABEL_SIZE = 20; // Space for individual row/column labels if needed, or just general padding
const PADDING = 5;

interface MatrixCanvasProps {
  width?: number;
  height?: number;
  audioGraph: AudioGraph;
  onMatrixCellClick?: (
    channelIndex: number,
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    newWeight: number
  ) => void;
}

const MatrixCanvas: React.FC<MatrixCanvasProps> = ({
  width = 600,
  height = 400,
  audioGraph,
  onMatrixCellClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const nodes = audioGraph.nodes;
  const routingMatrix = audioGraph.routingMatrix;

  const numEffectiveChannels = routingMatrix.length > 0 ? routingMatrix.length : audioGraph.outputChannels;
  const numNodes = nodes.length;

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#333'; // Background for the whole canvas
    ctx.fillRect(0, 0, width, height);


    if (numNodes === 0 || numEffectiveChannels === 0) {
      ctx.fillStyle = '#ccc';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No nodes or channels to display', width / 2, height / 2);
      return;
    }

    // Calculate dimensions for the actual grid area, leaving space for labels
    const topLabelAreaHeight = CELL_LABEL_SIZE;
    const leftLabelAreaWidth = LABEL_SIZE;

    const channelStripHeight = height / numEffectiveChannels;
    // Usable height within a channel strip for the grid itself (after accounting for top labels for that strip)
    const gridAreaHeightPerChannel = channelStripHeight - topLabelAreaHeight;
    // Usable width for the grid itself (after accounting for left labels for that strip)
    const gridAreaWidth = width - leftLabelAreaWidth;


    const cellWidth = numNodes > 0 ? gridAreaWidth / numNodes : 0;
    const cellHeight = numNodes > 0 ? gridAreaHeightPerChannel / numNodes : 0;


    for (let ch = 0; ch < numEffectiveChannels; ch++) {
      ctx.save();
      // Overall translation for this channel strip
      ctx.translate(0, ch * channelStripHeight);

      // Draw Channel Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Channel ${ch}`, PADDING, topLabelAreaHeight / 2 + PADDING);


      // Translate for the grid portion of this channel strip
      ctx.translate(leftLabelAreaWidth, topLabelAreaHeight);

      // Draw Grid
      drawGrid(ctx, gridAreaWidth, gridAreaHeightPerChannel, numNodes, numNodes);

      // Draw Node Labels (Columns - Targets, and Rows - Sources)
      ctx.fillStyle = '#ddd';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < numNodes; i++) {
        const node = nodes[i];
        const nodeLabel = node.label ?? node.id; // Changed from || to ??
        // Column labels (Targets) - drawn above the grid
        ctx.fillText(nodeLabel.substring(0, 8), i * cellWidth + cellWidth / 2, -topLabelAreaHeight / 2);
        // Row labels (Sources) - drawn to the left of the grid
        ctx.textAlign = 'right';
        ctx.fillText(nodeLabel.substring(0, 8), -PADDING, i * cellHeight + cellHeight / 2);
        ctx.textAlign = 'center'; // Reset for next column label
      }


      // Draw Connections
      for (let sourceIdx = 0; sourceIdx < numNodes; sourceIdx++) {
        for (let targetIdx = 0; targetIdx < numNodes; targetIdx++) {
          const weight = routingMatrix[ch]?.[sourceIdx]?.[targetIdx] ?? 0;
          if (weight > 0) {
            ctx.fillStyle = `rgba(0, 255, 0, ${weight})`;
            ctx.fillRect(
              targetIdx * cellWidth + 1,
              sourceIdx * cellHeight + 1,
              cellWidth - 2,
              cellHeight - 2
            );
          }
        }
      }
      ctx.restore();
    }
  }, [width, height, nodes, routingMatrix, numEffectiveChannels, numNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    draw(context);
  }, [draw]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || numNodes === 0 || numEffectiveChannels === 0 || !onMatrixCellClick) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const topLabelAreaHeight = CELL_LABEL_SIZE;
      const leftLabelAreaWidth = LABEL_SIZE;
      const channelStripHeight = height / numEffectiveChannels;

      const clickedChannelIndex = Math.floor(y / channelStripHeight);
      if (clickedChannelIndex < 0 || clickedChannelIndex >= numEffectiveChannels) return;

      // Coordinates relative to the start of the current channel strip's drawable area
      const yInChannelStrip = y - clickedChannelIndex * channelStripHeight;

      // Adjust for labels within the channel strip to get coordinates relative to the grid
      const xInGrid = x - leftLabelAreaWidth;
      const yInGrid = yInChannelStrip - topLabelAreaHeight;

      const gridAreaHeightPerChannel = channelStripHeight - topLabelAreaHeight;
      const gridAreaWidth = width - leftLabelAreaWidth;

      const cellWidthInGrid = numNodes > 0 ? gridAreaWidth / numNodes : 0;
      const cellHeightInGrid = numNodes > 0 ? gridAreaHeightPerChannel / numNodes : 0;

      if (cellWidthInGrid <= 0 || cellHeightInGrid <= 0) return; // Avoid division by zero or negative

      const clickedSourceNodeIndex = Math.floor(yInGrid / cellHeightInGrid);
      const clickedTargetNodeIndex = Math.floor(xInGrid / cellWidthInGrid);

      // Check if the click was outside the actual grid area (in the label areas)
      if (xInGrid < 0 || yInGrid < 0 || xInGrid > gridAreaWidth || yInGrid > gridAreaHeightPerChannel) {
        console.log("Clicked in label area, ignoring.");
        return;
      }

      if (
        clickedSourceNodeIndex < 0 || clickedSourceNodeIndex >= numNodes ||
        clickedTargetNodeIndex < 0 || clickedTargetNodeIndex >= numNodes
      ) {
        return;
      }

      const sourceNode = nodes[clickedSourceNodeIndex];
      const targetNode = nodes[clickedTargetNodeIndex];

      if (!sourceNode || !targetNode) {
        console.error('Source or target node not found for click event', {sourceNode, targetNode, clickedSourceNodeIndex, clickedTargetNodeIndex, nodes});
        return;
      }

      const currentWeight = routingMatrix[clickedChannelIndex]?.[clickedSourceNodeIndex]?.[clickedTargetNodeIndex] ?? 0;
      const newWeight = currentWeight > 0 ? 0 : 1;

      console.log(
        `MatrixCanvas Click: Channel: ${clickedChannelIndex}, Source: ${sourceNode.id} (idx ${clickedSourceNodeIndex}), Target: ${targetNode.id} (idx ${clickedTargetNodeIndex}), New W: ${newWeight}`
      );

      onMatrixCellClick(clickedChannelIndex, sourceNode.id, targetNode.id, newWeight);
    },
    [height, width, nodes, routingMatrix, numEffectiveChannels, numNodes, onMatrixCellClick]
  );

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{ border: '1px solid #ccc', cursor: 'pointer' }}
    />
  );
};

export default MatrixCanvas;
