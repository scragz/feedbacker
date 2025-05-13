import React, { useRef, useEffect, useCallback } from 'react';
import { type AudioGraph, type NodeId } from '../audio/schema';
import { drawGrid } from '../lib/canvas-utils';

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

    if (numNodes === 0 || numEffectiveChannels === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No nodes or channels to display', width / 2, height / 2);
      return;
    }

    const channelStripHeight = height / numEffectiveChannels;
    const cellWidth = width / numNodes;

    for (let ch = 0; ch < numEffectiveChannels; ch++) {
      ctx.save();
      ctx.translate(0, ch * channelStripHeight);
      drawGrid(ctx, width, channelStripHeight, numNodes, numNodes);

      for (let sourceIdx = 0; sourceIdx < numNodes; sourceIdx++) {
        for (let targetIdx = 0; targetIdx < numNodes; targetIdx++) {
          const weight = routingMatrix[ch]?.[sourceIdx]?.[targetIdx] ?? 0;
          if (weight > 0) {
            ctx.fillStyle = `rgba(0, 255, 0, ${weight})`;
            const cellHeight = channelStripHeight / numNodes;
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
  }, [width, height, routingMatrix, numEffectiveChannels, numNodes]);

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

      const channelStripHeight = height / numEffectiveChannels;
      const clickedChannelIndex = Math.floor(y / channelStripHeight);

      if (clickedChannelIndex < 0 || clickedChannelIndex >= numEffectiveChannels) return;

      const yInChannel = y - clickedChannelIndex * channelStripHeight;
      const cellHeightInChannelStrip = channelStripHeight / numNodes;
      const cellWidthGlobal = width / numNodes;

      const clickedSourceNodeIndex = Math.floor(yInChannel / cellHeightInChannelStrip);
      const clickedTargetNodeIndex = Math.floor(x / cellWidthGlobal);

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
