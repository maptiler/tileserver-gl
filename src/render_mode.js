'use strict';

/**
 * Converts a TileServer zoom level to the zoom expected by MapLibre Native.
 * @param {number} zoom TileServer zoom level.
 * @param {number} logicalWidth Unscaled request width in pixels.
 * @param {'tile'|'static'} mode Rendering mode.
 * @returns {number} MapLibre Native zoom level.
 */
export function getMapLibreRenderZoom(zoom, logicalWidth, mode) {
  if (mode === 'static') {
    return Math.max(0, zoom - 1);
  }

  if (mode === 'tile') {
    return Math.max(0, logicalWidth === 512 ? zoom : zoom - 1);
  }

  throw new Error(`Unsupported render mode: ${mode}`);
}
