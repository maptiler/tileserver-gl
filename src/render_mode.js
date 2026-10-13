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

/**
 * Calculates the TileServer zoom MapLibre Native effectively uses for a
 * static-map overlay. Horizontal world copies can wrap, but the world must
 * fill the viewport vertically. The 256px zoom-zero render has a dedicated
 * resize path in serve_rendered.
 * @param {number} zoom Requested TileServer zoom level.
 * @param {number} logicalWidth Unscaled request width in pixels.
 * @param {number} logicalHeight Unscaled request height in pixels.
 * @returns {number} Effective TileServer zoom level.
 */
export function getStaticOverlayZoom(zoom, logicalWidth, logicalHeight) {
  const minimumViewportZoom = Math.log2(logicalHeight / 256);
  if (zoom === 0 && logicalWidth === 256) {
    return Math.max(0, minimumViewportZoom);
  }
  return Math.max(1, zoom, minimumViewportZoom);
}
