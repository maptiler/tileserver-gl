'use strict';

import { createCanvas, Image } from 'canvas';
import { SphericalMercator } from '@mapbox/sphericalmercator';

const mercator = new SphericalMercator();

/**
 * Transforms coordinates to pixels.
 * @param {Array<number>} ll - Longitude/Latitude coordinate pair.
 * @param {number} zoom - Map zoom level.
 * @returns {Array<number>} Pixel coordinates as [x, y].
 */
const precisePx = (ll, zoom) => {
  const px = mercator.px(ll, 20);
  const scale = Math.pow(2, zoom - 20);
  return [px[0] * scale, px[1] * scale];
};

/**
 * Draws a marker in canvas context.
 * @param {CanvasRenderingContext2D} ctx - Canvas context object.
 * @param {object} marker - Marker object parsed by extractMarkersFromQuery.
 * @param {number} z - Map zoom level.
 * @returns {Promise<void>} A promise that resolves when the marker is drawn.
 */
const drawMarker = (ctx, marker, z) => {
  return new Promise((resolve) => {
    const img = new Image();
    const pixelCoords = precisePx(marker.location, z);

    const getMarkerCoordinates = (imageWidth, imageHeight, scale) => {
      // Images are placed with their top-left corner at the provided location
      // within the canvas but we expect icons to be centered and above it.

      // Substract half of the images width from the x-coordinate to center
      // the image in relation to the provided location
      let xCoordinate = pixelCoords[0] - imageWidth / 2;
      // Substract the images height from the y-coordinate to place it above
      // the provided location
      let yCoordinate = pixelCoords[1] - imageHeight;

      // Since image placement is dependent on the size offsets have to be
      // scaled as well. Additionally offsets are provided as either positive or
      // negative values so we always add them
      if (marker.offsetX) {
        xCoordinate = xCoordinate + marker.offsetX * scale;
      }
      if (marker.offsetY) {
        yCoordinate = yCoordinate + marker.offsetY * scale;
      }

      return {
        x: xCoordinate,
        y: yCoordinate,
      };
    };

    const drawOnCanvas = () => {
      // Check if the images should be resized before beeing drawn
      const defaultScale = 1;
      const scale = marker.scale ? marker.scale : defaultScale;

      // Calculate scaled image sizes
      const imageWidth = img.width * scale;
      const imageHeight = img.height * scale;

      // Pass the desired sizes to get correlating coordinates
      const coords = getMarkerCoordinates(imageWidth, imageHeight, scale);

      // Draw the image on canvas
      if (scale != defaultScale) {
        ctx.drawImage(img, coords.x, coords.y, imageWidth, imageHeight);
      } else {
        ctx.drawImage(img, coords.x, coords.y);
      }
      // Resolve the promise when image has been drawn
      resolve();
    };

    img.onload = drawOnCanvas;
    img.onerror = (err) => {
      throw err;
    };
    img.src = marker.icon;
  });
};

/**
 * Draws a list of markers onto a canvas.
 * Wraps drawing of markers into list of promises and awaits them.
 * It's required because images are expected to load asynchronous in canvas js
 * even when provided from a local disk.
 * @param {CanvasRenderingContext2D} ctx - Canvas context object.
 * @param {Array<object>} markers - Marker objects parsed by extractMarkersFromQuery.
 * @param {number} z - Map zoom level.
 * @returns {Promise<void>} A promise that resolves when all markers are drawn.
 */
const drawMarkers = async (ctx, markers, z) => {
  const markerPromises = [];

  for (const marker of markers) {
    // Begin drawing marker
    markerPromises.push(drawMarker(ctx, marker, z));
  }

  // Await marker drawings before continuing
  await Promise.all(markerPromises);
};

/**
 * Draws a list of coordinates onto a canvas and styles the resulting path.
 * @param {CanvasRenderingContext2D} ctx - Canvas context object.
 * @param {Array<Array<number>>} path - List of coordinate pairs.
 * @param {object} query - Request query parameters.
 * @param {string} pathQuery - Path query parameter string.
 * @param {number} z - Map zoom level.
 * @returns {void}
 */
const drawPath = (ctx, path, query, pathQuery, z) => {
  const splitPaths = pathQuery.split('|');

  if (!path || path.length < 2) {
    return null;
  }

  ctx.beginPath();

  // Transform coordinates to pixel on canvas and draw lines between points
  for (const pair of path) {
    const px = precisePx(pair, z);
    ctx.lineTo(px[0], px[1]);
  }

  // Check if first coordinate matches last coordinate
  if (
    path[0][0] === path[path.length - 1][0] &&
    path[0][1] === path[path.length - 1][1]
  ) {
    ctx.closePath();
  }

  // --- NEW: Helper to extract an option from splitPaths ---
  const getInlineOption = (optionName) => {
    const found = splitPaths.find((x) => x.startsWith(`${optionName}:`));
    return found ? found.replace(`${optionName}:`, '') : undefined;
  };
  // --------------------------------------------------------

  // --- FILL Logic ---
  const inlineFill = getInlineOption('fill');
  const pathHasFill = inlineFill !== undefined;
  if (query.fill !== undefined || pathHasFill) {
    if (pathHasFill) {
      ctx.fillStyle = inlineFill;
    } else if ('fill' in query) {
      ctx.fillStyle = query.fill || 'rgba(255,255,255,0.4)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; // Default if only pathHasFill is true but value is empty
    }
    ctx.fill();
  }

  // --- WIDTH & BORDER Logic ---
  const inlineWidth = getInlineOption('width');
  const pathHasWidth = inlineWidth !== undefined;
  const inlineBorder = getInlineOption('border');
  const inlineBorderWidth = getInlineOption('borderwidth');
  const pathHasBorder = inlineBorder !== undefined;

  let lineWidth = 1;
  // Prioritize inline width over global width
  if (pathHasWidth) {
    lineWidth = Number(inlineWidth);
  } else if ('width' in query) {
    lineWidth = Number(query.width);
  }

  // Get border width, prioritized by inline > global query > default (10% of line width)
  let borderWidth = lineWidth * 0.1; // Default
  if (pathHasBorder) {
    borderWidth = parseFloat(inlineBorderWidth) || lineWidth * 0.1;
  } else if (query.borderwidth !== undefined) {
    borderWidth = parseFloat(query.borderwidth);
  }

  // Set rendering style for the start and end points of the path
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap
  ctx.lineCap = query.linecap || 'butt';

  // Set rendering style for overlapping segments of the path with differing directions
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin
  ctx.lineJoin = query.linejoin || 'miter';

  // The final border color, prioritized by inline over global query
  const finalBorder = pathHasBorder ? inlineBorder : query.border;

  // In order to simulate a border we draw the path two times with the first
  // beeing the wider border part.
  if (finalBorder !== undefined && borderWidth > 0) {
    // We need to double the desired border width and add it to the line width
    // in order to get the desired border on each side of the line.
    ctx.lineWidth = lineWidth + borderWidth * 2;
    // Set border style as rgba
    ctx.strokeStyle = finalBorder;
    ctx.stroke();
  }

  // Set line width for the main stroke
  ctx.lineWidth = lineWidth;

  // --- STROKE Logic ---
  const inlineStroke = getInlineOption('stroke');
  const pathHasStroke = inlineStroke !== undefined;

  if (pathHasStroke) {
    ctx.strokeStyle = inlineStroke;
  } else if ('stroke' in query) {
    ctx.strokeStyle = query.stroke;
  } else {
    ctx.strokeStyle = 'rgba(0,64,255,0.7)';
  }
  ctx.stroke();
};
// ... (rest of the file: renderOverlay, renderWatermark, renderAttribution are unchanged)
/**
 * Renders an overlay with paths and markers on a map tile.
 * @param {number} z - Map zoom level.
 * @param {number} x - Longitude of center point.
 * @param {number} y - Latitude of center point.
 * @param {number} bearing - Map bearing in degrees.
 * @param {number} pitch - Map pitch in degrees.
 * @param {number} w - Width of the canvas.
 * @param {number} h - Height of the canvas.
 * @param {number} scale - Scale factor for rendering.
 * @param {Array<Array<Array<number>>>} paths - Array of path coordinate arrays.
 * @param {Array<object>} markers - Array of marker objects.
 * @param {object} query - Request query parameters.
 * @returns {Promise<Buffer|null>} A promise that resolves with the canvas buffer or null if no overlay is needed.
 */
export const renderOverlay = async (
  z,
  x,
  y,
  bearing,
  pitch,
  w,
  h,
  scale,
  paths,
  markers,
  query,
) => {
  if ((!paths || paths.length === 0) && (!markers || markers.length === 0)) {
    return null;
  }

  const center = precisePx([x, y], z);

  const mapHeight = 512 * (1 << z);
  const maxEdge = center[1] + h / 2;
  const minEdge = center[1] - h / 2;
  if (maxEdge > mapHeight) {
    center[1] -= maxEdge - mapHeight;
  } else if (minEdge < 0) {
    center[1] -= minEdge;
  }

  const canvas = createCanvas(scale * w, scale * h);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  if (bearing) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-bearing / 180) * Math.PI);
    ctx.translate(-center[0], -center[1]);
  } else {
    // optimized path
    ctx.translate(-center[0] + w / 2, -center[1] + h / 2);
  }

  // Draw provided paths if any
  paths.forEach((path, i) => {
    // Fix: We must determine which path query string belongs to the current path.
    // If query.path is an array, we use the corresponding index. Otherwise, we use the single string.
    const pathQuery = Array.isArray(query.path) ? query.path.at(i) : query.path;
    drawPath(ctx, path, query, pathQuery, z);
  });

  // Await drawing of markers before rendering the canvas
  await drawMarkers(ctx, markers, z);

  return canvas.toBuffer();
};

/**
 * Renders a watermark on a canvas.
 * @param {number} width - Width of the canvas.
 * @param {number} height - Height of the canvas.
 * @param {number} scale - Scale factor for rendering.
 * @param {string} text - Watermark text to render.
 * @returns {object} The canvas with the rendered attribution.
 */
export const renderWatermark = (width, height, scale, text) => {
  const canvas = createCanvas(scale * width, scale * height);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.font = '10px sans-serif';
  ctx.strokeWidth = '1px';
  ctx.strokeStyle = 'rgba(255,255,255,.4)';
  ctx.strokeText(text, 5, height - 5);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillText(text, 5, height - 5);

  return canvas;
};

/**
 * Renders an attribution box on a canvas.
 * @param {number} width - Width of the canvas.
 * @param {number} height - Height of the canvas.
 * @param {number} scale - Scale factor for rendering.
 * @param {string} text - Attribution text to render.
 * @returns {object} The canvas with the rendered attribution.
 */
export const renderAttribution = (width, height, scale, text) => {
  const canvas = createCanvas(scale * width, scale * height);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.font = '10px sans-serif';
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = 14;

  const padding = 6;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillRect(
    width - textWidth - padding,
    height - textHeight - padding,
    textWidth + padding,
    textHeight + padding,
  );
  ctx.fillStyle = 'rgba(0,0,0,.8)';
  ctx.fillText(text, width - textWidth - padding / 2, height - textHeight + 8);

  return canvas;
};
