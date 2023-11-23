'use strict';

import { createCanvas, Image } from 'canvas';

import SphericalMercator from '@mapbox/sphericalmercator';

const mercator = new SphericalMercator();

/**
 * Transforms coordinates to pixels.
 * @param {List[Number]} ll Longitude/Latitude coordinate pair.
 * @param {number} zoom Map zoom level.
 */
const precisePx = (ll, zoom) => {
  const px = mercator.px(ll, 20);
  const scale = Math.pow(2, zoom - 20);
  return [px[0] * scale, px[1] * scale];
};

/**
 * Draws a marker in canvas context.
 * @param {object} ctx Canvas context object.
 * @param {object} marker Marker object parsed by extractMarkersFromQuery.
 * @param {number} z Map zoom level.
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
 * @param {object} ctx Canvas context object.
 * @param {List[Object]} markers Marker objects parsed by extractMarkersFromQuery.
 * @param {number} z Map zoom level.
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
 * @param {object} ctx Canvas context object.
 * @param {List[Number]} path List of coordinates.
 * @param {object} query Request query parameters.
 * @param {string} pathQuery Path query parameter.
 * @param {number} z Map zoom level.
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

  // Optionally fill drawn shape with a rgba color from query
  const pathHasFill = splitPaths.filter((x) => x.startsWith('fill')).length > 0;
  if (query.fill !== undefined || pathHasFill) {
    if ('fill' in query) {
      ctx.fillStyle = query.fill || 'rgba(255,255,255,0.4)';
    }
    if (pathHasFill) {
      ctx.fillStyle = splitPaths
        .find((x) => x.startsWith('fill:'))
        .replace('fill:', '');
    }
    ctx.fill();
  }

  // Get line width from query and fall back to 1 if not provided
  const pathHasWidth =
    splitPaths.filter((x) => x.startsWith('width')).length > 0;
  if (query.width !== undefined || pathHasWidth) {
    let lineWidth = 1;
    // Get line width from query
    if ('width' in query) {
      lineWidth = Number(query.width);
    }
    // Get line width from path in query
    if (pathHasWidth) {
      lineWidth = Number(
        splitPaths.find((x) => x.startsWith('width:')).replace('width:', ''),
      );
    }
    // Get border width from query and fall back to 10% of line width
    const borderWidth =
      query.borderwidth !== undefined
        ? parseFloat(query.borderwidth)
        : lineWidth * 0.1;

    // Set rendering style for the start and end points of the path
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap
    ctx.lineCap = query.linecap || 'butt';

    // Set rendering style for overlapping segments of the path with differing directions
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin
    ctx.lineJoin = query.linejoin || 'miter';

    // In order to simulate a border we draw the path two times with the first
    // beeing the wider border part.
    if (query.border !== undefined && borderWidth > 0) {
      // We need to double the desired border width and add it to the line width
      // in order to get the desired border on each side of the line.
      ctx.lineWidth = lineWidth + borderWidth * 2;
      // Set border style as rgba
      ctx.strokeStyle = query.border;
      ctx.stroke();
    }
    ctx.lineWidth = lineWidth;
  }

  const pathHasStroke =
    splitPaths.filter((x) => x.startsWith('stroke')).length > 0;
  if (query.stroke !== undefined || pathHasStroke) {
    if ('stroke' in query) {
      ctx.strokeStyle = query.stroke;
    }
    // Path Stroke gets higher priority
    if (pathHasStroke) {
      ctx.strokeStyle = splitPaths
        .find((x) => x.startsWith('stroke:'))
        .replace('stroke:', '');
    }
  } else {
    ctx.strokeStyle = 'rgba(0,64,255,0.7)';
  }
  ctx.stroke();
};

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
    const pathQuery = Array.isArray(query.path) ? query.path.at(i) : query.path;
    drawPath(ctx, path, query, pathQuery, z);
  });

  // Await drawing of markers before rendering the canvas
  await drawMarkers(ctx, markers, z);

  return canvas.toBuffer();
};

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
