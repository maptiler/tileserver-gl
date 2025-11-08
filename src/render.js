'use strict';

import { createCanvas, Image } from 'canvas';
import { SphericalMercator } from '@mapbox/sphericalmercator';

const mercator = new SphericalMercator();

// Constants
const CONSTANTS = {
  DEFAULT_LINE_WIDTH: 1,
  DEFAULT_BORDER_WIDTH_RATIO: 0.1, // 10% of line width
  DEFAULT_FILL_COLOR: 'rgba(255,255,255,0.4)',
  DEFAULT_STROKE_COLOR: 'rgba(0,64,255,0.7)',
  MAX_LINE_WIDTH: 500,
  MAX_BORDER_WIDTH: 250,
  MARKER_LOAD_TIMEOUT: 5000,
};

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
 * Validates if a string is a valid color value.
 * @param {string} color - Color string to validate.
 * @returns {boolean} True if valid color.
 */
const isValidColor = (color) => {
  if (!color || typeof color !== 'string') {
    return false;
  }

  // Allow 'none' and 'transparent' keywords
  if (color === 'none' || color === 'transparent') {
    return true;
  }

  // Basic validation for common formats
  const hexPattern = /^#([0-9A-Fa-f]{3}){1,2}$/; // 3 or 6 digits
  const hexAlphaPattern = /^#([0-9A-Fa-f]{8})$/; // 8 digits with alpha
  const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
  const rgbaPattern = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
  const namedColors = [
    'red',
    'blue',
    'green',
    'yellow',
    'black',
    'white',
    'gray',
    'grey',
    'orange',
    'purple',
    'pink',
    'brown',
    'cyan',
    'magenta',
  ];

  return (
    hexPattern.test(color) ||
    hexAlphaPattern.test(color) ||
    rgbPattern.test(color) ||
    rgbaPattern.test(color) ||
    namedColors.includes(color.toLowerCase())
  );
};

/**
 * Safely parses a numeric value with bounds checking.
 * @param {string|number} value - Value to parse.
 * @param {number} defaultValue - Default value if parsing fails.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number} Parsed and bounded value.
 */
const safeParseNumber = (
  value,
  defaultValue,
  min = -Infinity,
  max = Infinity,
) => {
  const parsed = Number(value);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, parsed));
};

/**
 * Draws a marker in canvas context.
 * @param {CanvasRenderingContext2D} ctx - Canvas context object.
 * @param {object} marker - Marker object parsed by extractMarkersFromQuery.
 * @param {number} z - Map zoom level.
 * @returns {Promise<void>} A promise that resolves when the marker is drawn.
 */
const drawMarker = (ctx, marker, z) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const pixelCoords = precisePx(marker.location, z);

    // Add timeout to prevent hanging on slow/failed image loads
    const timeout = setTimeout(() => {
      reject(new Error(`Marker image load timeout: ${marker.icon}`));
    }, CONSTANTS.MARKER_LOAD_TIMEOUT);

    const getMarkerCoordinates = (imageWidth, imageHeight, scale) => {
      // Images are placed with their top-left corner at the provided location
      // within the canvas but we expect icons to be centered and above it.

      // Subtract half of the image's width from the x-coordinate to center
      // the image in relation to the provided location
      let xCoordinate = pixelCoords[0] - imageWidth / 2;

      // Subtract the image's height from the y-coordinate to place it above
      // the provided location
      let yCoordinate = pixelCoords[1] - imageHeight;

      // Since image placement is dependent on the size, offsets have to be
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
      clearTimeout(timeout);

      try {
        // Check if the image should be resized before being drawn
        const defaultScale = 1;
        const scale = marker.scale ? marker.scale : defaultScale;

        // Calculate scaled image sizes
        const imageWidth = img.width * scale;
        const imageHeight = img.height * scale;

        // Pass the desired sizes to get correlating coordinates
        const coords = getMarkerCoordinates(imageWidth, imageHeight, scale);

        // Draw the image on canvas
        if (scale !== defaultScale) {
          ctx.drawImage(img, coords.x, coords.y, imageWidth, imageHeight);
        } else {
          ctx.drawImage(img, coords.x, coords.y);
        }

        // Resolve the promise when image has been drawn
        resolve();
      } catch (error) {
        reject(new Error(`Failed to draw marker: ${error.message}`));
      }
    };

    img.onload = drawOnCanvas;
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load marker image: ${marker.icon}`));
    };
    img.src = marker.icon;
  });
};

/**
 * Draws a list of markers onto a canvas.
 * Wraps drawing of markers into list of promises and awaits them.
 * It's required because images are expected to load asynchronously in canvas js
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
  // Use Promise.allSettled to continue even if some markers fail
  const results = await Promise.allSettled(markerPromises);

  // Log any failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`Marker ${index} failed to render:`, result.reason);
    }
  });
};

/**
 * Extracts an option value from a path query string.
 * @param {Array<string>} splitPaths - Path string split by pipe character.
 * @param {string} optionName - Name of the option to extract.
 * @returns {string|undefined} Option value or undefined if not found.
 */
const getInlineOption = (splitPaths, optionName) => {
  const found = splitPaths.find((x) => x.startsWith(`${optionName}:`));
  return found ? found.replace(`${optionName}:`, '') : undefined;
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
  if (!path || path.length < 2) {
    return;
  }

  const splitPaths = pathQuery.split('|');

  // Start the path - transform coordinates to pixels on canvas and draw lines between points
  ctx.beginPath();

  for (const [i, pair] of path.entries()) {
    const px = precisePx(pair, z);
    if (i === 0) {
      ctx.moveTo(px[0], px[1]);
    } else {
      ctx.lineTo(px[0], px[1]);
    }
  }

  // Check if first coordinate matches last coordinate (closed path)
  if (
    path[0][0] === path[path.length - 1][0] &&
    path[0][1] === path[path.length - 1][1]
  ) {
    ctx.closePath();
  }

  // --- FILL Logic ---
  const inlineFill = getInlineOption(splitPaths, 'fill');
  const pathHasFill = inlineFill !== undefined;

  if (query.fill !== undefined || pathHasFill) {
    let fillColor;

    if (pathHasFill) {
      fillColor = inlineFill;
    } else if ('fill' in query) {
      fillColor = query.fill || CONSTANTS.DEFAULT_FILL_COLOR;
    } else {
      fillColor = CONSTANTS.DEFAULT_FILL_COLOR;
    }

    // Validate color before using
    if (isValidColor(fillColor)) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    } else {
      console.warn(`Invalid fill color: ${fillColor}, using default`);
      ctx.fillStyle = CONSTANTS.DEFAULT_FILL_COLOR;
      ctx.fill();
    }
  }

  // --- WIDTH & BORDER Logic ---
  const inlineWidth = getInlineOption(splitPaths, 'width');
  const pathHasWidth = inlineWidth !== undefined;
  const inlineBorder = getInlineOption(splitPaths, 'border');
  const inlineBorderWidth = getInlineOption(splitPaths, 'borderwidth');
  const pathHasBorder = inlineBorder !== undefined;

  // Parse line width with validation
  let lineWidth = CONSTANTS.DEFAULT_LINE_WIDTH;
  if (pathHasWidth) {
    lineWidth = safeParseNumber(
      inlineWidth,
      CONSTANTS.DEFAULT_LINE_WIDTH,
      0,
      CONSTANTS.MAX_LINE_WIDTH,
    );
  } else if ('width' in query) {
    lineWidth = safeParseNumber(
      query.width,
      CONSTANTS.DEFAULT_LINE_WIDTH,
      0,
      CONSTANTS.MAX_LINE_WIDTH,
    );
  }

  // Get border width with validation
  // Default: 10% of line width
  let borderWidth = lineWidth * CONSTANTS.DEFAULT_BORDER_WIDTH_RATIO;
  if (pathHasBorder && inlineBorderWidth) {
    borderWidth = safeParseNumber(
      inlineBorderWidth,
      borderWidth,
      0,
      CONSTANTS.MAX_BORDER_WIDTH,
    );
  } else if (query.borderwidth !== undefined) {
    borderWidth = safeParseNumber(
      query.borderwidth,
      borderWidth,
      0,
      CONSTANTS.MAX_BORDER_WIDTH,
    );
  }

  // Set rendering style for the start and end points of the path
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap
  const validLineCaps = ['butt', 'round', 'square'];
  ctx.lineCap = validLineCaps.includes(query.linecap) ? query.linecap : 'butt';

  // Set rendering style for overlapping segments of the path with differing directions
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin
  const validLineJoins = ['miter', 'round', 'bevel'];
  ctx.lineJoin = validLineJoins.includes(query.linejoin)
    ? query.linejoin
    : 'miter';

  // The final border color, prioritized by inline over global query
  const finalBorder = pathHasBorder ? inlineBorder : query.border;

  // In order to simulate a border we draw the path two times with the first
  // being the wider border part.
  if (finalBorder !== undefined && borderWidth > 0) {
    // Validate border color
    if (isValidColor(finalBorder)) {
      // We need to double the desired border width and add it to the line width
      // in order to get the desired border on each side of the line.
      ctx.lineWidth = lineWidth + borderWidth * 2;
      ctx.strokeStyle = finalBorder;
      ctx.stroke();
    } else {
      console.warn(`Invalid border color: ${finalBorder}, skipping border`);
    }
  }

  // Set line width for the main stroke
  ctx.lineWidth = lineWidth;

  // --- STROKE Logic ---
  const inlineStroke = getInlineOption(splitPaths, 'stroke');
  const pathHasStroke = inlineStroke !== undefined;

  let strokeColor;
  if (pathHasStroke) {
    strokeColor = inlineStroke;
  } else if ('stroke' in query) {
    strokeColor = query.stroke;
  } else {
    strokeColor = CONSTANTS.DEFAULT_STROKE_COLOR;
  }

  // Validate stroke color
  if (isValidColor(strokeColor)) {
    ctx.strokeStyle = strokeColor;
  } else {
    console.warn(`Invalid stroke color: ${strokeColor}, using default`);
    ctx.strokeStyle = CONSTANTS.DEFAULT_STROKE_COLOR;
  }

  ctx.stroke();
};

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
    // Optimized path
    ctx.translate(-center[0] + w / 2, -center[1] + h / 2);
  }

  // Draw provided paths if any
  paths.forEach((path, i) => {
    const pathQuery = Array.isArray(query.path) ? query.path.at(i) : query.path;
    try {
      drawPath(ctx, path, query, pathQuery, z);
    } catch (error) {
      console.error(`Error drawing path ${i}:`, error);
    }
  });

  // Await drawing of markers before rendering the canvas
  try {
    await drawMarkers(ctx, markers, z);
  } catch (error) {
    console.error('Error drawing markers:', error);
  }

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
