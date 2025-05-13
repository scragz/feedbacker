// src/lib/canvas-utils.ts

/**
 * Example utility function for drawing a simple grid.
 * This is a placeholder and can be expanded based on MatrixCanvas needs.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rows: number,
  cols: number
) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;

  const cellWidth = width / cols;
  const cellHeight = height / rows;

  for (let i = 0; i <= rows; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * cellHeight);
    ctx.lineTo(width, i * cellHeight);
    ctx.stroke();
  }

  for (let j = 0; j <= cols; j++) {
    ctx.beginPath();
    ctx.moveTo(j * cellWidth, 0);
    ctx.lineTo(j * cellWidth, height);
    ctx.stroke();
  }
}

// Add other canvas utility functions here as needed
// e.g., drawing cells, text, handling coordinates, etc.

export interface CanvasUtils {
  drawGrid: typeof drawGrid;
}
