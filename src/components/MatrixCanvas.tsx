import React, { useRef, useEffect, useCallback } from 'react';
import { useGraphStore } from '../stores/graph'; // Assuming graph store is set up
import { drawGrid } from '../lib/canvas-utils'; // Placeholder for canvas drawing utilities

interface MatrixCanvasProps {
  // Define props if any, e.g., dimensions, number of channels
  width?: number;
  height?: number;
  numChannels?: number; // Example: to determine grid size
}

const MatrixCanvas: React.FC<MatrixCanvasProps> = ({
  width = 600,
  height = 400,
  numChannels = 8, // Default to 8 channels, adjust as needed
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setWeight } = useGraphStore(state => ({ setWeight: state.setWeight }));

  // Placeholder for drawing logic
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    // Example: Draw a simple grid for each channel layer
    // This will need to be much more sophisticated to represent the matrix
    const channelHeight = height / numChannels;
    for (let i = 0; i < numChannels; i++) {
      ctx.save();
      ctx.translate(0, i * channelHeight);
      drawGrid(ctx, width, channelHeight, numChannels, numChannels); // Assuming numChannels x numChannels grid per layer
      // Add more drawing logic here for nodes, connections, weights etc.
      ctx.restore();
    }
    // TODO: Implement actual rendering of stacked channel grids
    // TODO: Visualize connections and weights
  }, [width, height, numChannels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    draw(context);

    // Resize handling (optional, but good practice)
    const resizeObserver = new ResizeObserver(() => {
      // Adjust canvas size if its container resizes
      // For simplicity, using fixed size for now
      draw(context);
    });
    // resizeObserver.observe(canvas.parentElement || canvas);

    return () => {
      // resizeObserver.disconnect();
    };
  }, [draw]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // TODO: Translate canvas coordinates (x, y) to matrix indices (source, target, channel)
      // This is a placeholder and needs actual logic based on the visual representation
      const sourceChannel = Math.floor((y / height) * numChannels);
      const targetChannel = Math.floor((x / width) * numChannels); // Simplified example
      const fromNodeIndex = 0; // Placeholder - determine from click
      const toNodeIndex = 1; // Placeholder - determine from click
      const weight = 0.5; // Placeholder - determine from click or UI interaction

      console.log(
        `MatrixCanvas click at (${x.toFixed(2)}, ${y.toFixed(2)}) -> translated to [srcCh: ${sourceChannel}, tgtCh: ${targetChannel}]`
      );

      // Example of calling setWeight - actual indices and weight would come from user interaction
      // setWeight(fromNodeIndex, toNodeIndex, sourceChannel, targetChannel, weight);

      // Redraw or update UI based on the click
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        draw(ctx);
      }
    },
    [height, width, numChannels, setWeight, draw]
  );

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{ border: '1px solid #ccc', cursor: 'pointer' }}
      // TODO: Add ARIA attributes for accessibility
    />
  );
};

export default MatrixCanvas;
