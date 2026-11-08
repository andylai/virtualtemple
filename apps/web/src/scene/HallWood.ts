import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** One small repeating texture keeps planks and grain out of the draw-call budget. */
const TILE_SIZE = 512;
const TILE_METRES = 4;
const BOARD_ROWS = 10;
const BOARD_LENGTH = TILE_SIZE / 2;
const WALNUT_SHADES = ['#795139', '#775038', '#7d543b', '#7b5138', '#754e36', '#80563d'];
const SEAM_COLOUR = '#503321';
const GRAIN_COLOURS = ['#4e302410', '#d7a27418', '#ad774c20'];
const GRAIN_LINES = 15;

/** Breaks up repeating planks with staggered joints and subdued, deterministic wood grain. */
export function hallWoodTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    const rowHeight = TILE_SIZE / BOARD_ROWS;
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      const y = row * rowHeight;
      const offset = (row % 2) * (BOARD_LENGTH / 2);
      for (let column = -1; column < 2; column += 1) {
        const x = column * BOARD_LENGTH + offset;
        ctx.fillStyle = WALNUT_SHADES[(row * 3 + ((column + 2) % 2)) % WALNUT_SHADES.length]!;
        ctx.fillRect(x, y, BOARD_LENGTH, rowHeight);
        ctx.fillStyle = SEAM_COLOUR;
        ctx.fillRect(x, y, 1, rowHeight);
      }
      ctx.fillStyle = SEAM_COLOUR;
      ctx.fillRect(0, y, TILE_SIZE, 1);
      for (let line = 0; line < GRAIN_LINES; line += 1) {
        const start = (line * 37 + row * 97) % TILE_SIZE;
        const grainY = y + ((line * 13) % (rowHeight - 3)) + 2;
        ctx.fillStyle = GRAIN_COLOURS[line % GRAIN_COLOURS.length]!;
        ctx.fillRect(start, grainY, 28 + ((line * 19) % 120), 1);
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.setScalar(1 / TILE_METRES);
  return texture;
}
