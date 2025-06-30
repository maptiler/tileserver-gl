'use strict';

// SECTION START
//
// The order of the two imports below is important.
// For an unknown reason, if the order is reversed, rendering can crash.
// This happens on ARM:
//  > terminate called after throwing an instance of 'std::runtime_error'
//  > what():  Cannot read GLX extensions.
import { Image, createCanvas } from 'canvas';
import '@maplibre/maplibre-gl-native';
//
// SECTION END

import advancedPool from 'advanced-pool';
import path from 'path';
import url from 'url';
import sharp from 'sharp';
import clone from 'clone';
import Color from 'color';
import express from 'express';
import sanitize from 'sanitize-filename';
import { SphericalMercator } from '@mapbox/sphericalmercator';
import mlgl from '@maplibre/maplibre-gl-native';
import polyline from '@mapbox/polyline';
import proj4 from 'proj4';
import axios from 'axios';
import {
  allowedScales,
  allowedTileSizes,
  getFontsPbf,
  listFonts,
  getTileUrls,
  isValidHttpUrl,
  fixTileJSONCenter,
  fetchTileData,
  readFile,
} from './utils.js';
import { openPMtiles, getPMtilesInfo } from './pmtiles_adapter.js';
import { renderOverlay, renderWatermark, renderAttribution } from './render.js';
import fsp from 'node:fs/promises';
import { existsP, gunzipP } from './promises.js';
import { openMbTilesWrapper } from './mbtiles_wrapper.js';

const FLOAT_PATTERN = '[+-]?(?:\\d+|\\d*\\.\\d+)';

const staticTypeRegex = new RegExp(
  `^` +
    `(?:` +
    // Format 1: {lon},{lat},{zoom}[@{bearing}[,{pitch}]]
    `(?<lon>${FLOAT_PATTERN}),(?<lat>${FLOAT_PATTERN}),(?<zoom>${FLOAT_PATTERN})` +
    `(?:@(?<bearing>${FLOAT_PATTERN})(?:,(?<pitch>${FLOAT_PATTERN}))?)?` +
    `|` +
    // Format 2: {minx},{miny},{maxx},{maxy}
    `(?<minx>${FLOAT_PATTERN}),(?<miny>${FLOAT_PATTERN}),(?<maxx>${FLOAT_PATTERN}),(?<maxy>${FLOAT_PATTERN})` +
    `|` +
    // Format 3: auto
    `(?<auto>auto)` +
    `)` +
    `$`,
);

const PATH_PATTERN =
  /^((fill|stroke|width)\:[^\|]+\|)*(enc:.+|-?\d+(\.\d*)?,-?\d+(\.\d*)?(\|-?\d+(\.\d*)?,-?\d+(\.\d*)?)+)/;
const httpTester = /^https?:\/\//i;

const mercator = new SphericalMercator();

mlgl.on('message', (e) => {
  if (e.severity === 'WARNING' || e.severity === 'ERROR') {
    console.log('mlgl:', e);
  }
});

/**
 * Lookup of sharp output formats by file extension.
 */
const extensionToFormat = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
};

/**
 * Cache of response data by sharp output format and color.  Entry for empty
 * string is for unknown or unsupported formats.
 */
const cachedEmptyResponses = {
  '': Buffer.alloc(0),
};

/**
 * Create an appropriate mlgl response for http errors.
 * @param {string} format The format (a sharp format or 'pbf').
 * @param {string} color The background color (or empty string for transparent).
 * @param {Function} callback The mlgl callback.
 * @returns {void}
 */
function createEmptyResponse(format, color, callback) {
  if (!format || format === 'pbf') {
    callback(null, { data: cachedEmptyResponses[''] });
    return;
  }

  if (format === 'jpg') {
    format = 'jpeg';
  }
  if (!color) {
    color = 'rgba(255,255,255,0)';
  }

  const cacheKey = `${format},${color}`;
  const data = cachedEmptyResponses[cacheKey];
  if (data) {
    callback(null, { data: data });
    return;
  }

  // create an "empty" response image
  try {
    color = new Color(color);
    const array = color.array();
    const channels = array.length === 4 && format !== 'jpeg' ? 4 : 3;
    sharp(Buffer.from(array), {
      raw: {
        width: 1,
        height: 1,
        channels,
      },
    })
      .toFormat(format)
      .toBuffer((err, buffer, info) => {
        if (err) {
          console.error('Error creating image with Sharp:', err);
          callback(err, null);
          return;
        }
        cachedEmptyResponses[cacheKey] = buffer;
        callback(null, { data: buffer });
      });
  } catch (error) {
    console.error('Error during image processing setup:', error);
    callback(error, null);
  }
}

/**
 * Parses coordinate pair provided to pair of floats and ensures the resulting
 * pair is a longitude/latitude combination depending on lnglat query parameter.
 * @param {Array<string>} coordinatePair Coordinate pair.
 * @param coordinates
 * @param {object} query Request query parameters.
 * @returns {Array<number>|null} Parsed coordinate pair as [longitude, latitude] or null if invalid
 */
function parseCoordinatePair(coordinates, query) {
  const firstCoordinate = parseFloat(coordinates[0]);
  const secondCoordinate = parseFloat(coordinates[1]);

  // Ensure provided coordinates could be parsed and abort if not
  if (isNaN(firstCoordinate) || isNaN(secondCoordinate)) {
    return null;
  }

  // Check if coordinates have been provided as lat/lng pair instead of the
  // ususal lng/lat pair and ensure resulting pair is lng/lat
  if (query.latlng === '1' || query.latlng === 'true') {
    return [secondCoordinate, firstCoordinate];
  }

  return [firstCoordinate, secondCoordinate];
}

/**
 * Parses a coordinate pair from query arguments and optionally transforms it.
 * @param {Array<string>} coordinatePair Coordinate pair.
 * @param {object} query Request query parameters.
 * @param {Function} transformer Optional transform function.
 * @returns {Array<number>|null} Transformed coordinate pair or null if invalid.
 */
function parseCoordinates(coordinatePair, query, transformer) {
  const parsedCoordinates = parseCoordinatePair(coordinatePair, query);

  // Transform coordinates
  if (transformer) {
    return transformer(parsedCoordinates);
  }

  return parsedCoordinates;
}

/**
 * Parses paths provided via query into a list of path objects.
 * @param {object} query Request query parameters.
 * @param {Function} transformer Optional transform function.
 * @returns {Array<Array<Array<number>>>} Array of paths.
 */
function extractPathsFromQuery(query, transformer) {
  // Initiate paths array
  const paths = [];
  // Return an empty list if no paths have been provided
  if ('path' in query && !query.path) {
    return paths;
  }
  // Parse paths provided via path query argument
  if ('path' in query) {
    const providedPaths = Array.isArray(query.path) ? query.path : [query.path];
    // Iterate through paths, parse and validate them
    for (const providedPath of providedPaths) {
      // Logic for pushing coords to path when path includes google polyline
      if (providedPath.includes('enc:') && PATH_PATTERN.test(providedPath)) {
        // +4 because 'enc:' is 4 characters, everything after 'enc:' is considered to be part of the polyline
        const encIndex = providedPath.indexOf('enc:') + 4;
        const coords = polyline
          .decode(providedPath.substring(encIndex))
          .map(([lat, lng]) => [lng, lat]);
        paths.push(coords);
      } else {
        // Iterate through paths, parse and validate them
        const currentPath = [];

        // Extract coordinate-list from path
        const pathParts = (providedPath || '').split('|');

        // Iterate through coordinate-list, parse the coordinates and validate them
        for (const pair of pathParts) {
          // Extract coordinates from coordinate pair
          const pairParts = pair.split(',');
          // Ensure we have two coordinates
          if (pairParts.length === 2) {
            const pair = parseCoordinates(pairParts, query, transformer);

            // Ensure coordinates could be parsed and skip them if not
            if (pair === null) {
              continue;
            }

            // Add the coordinate-pair to the current path if they are valid
            currentPath.push(pair);
          }
        }
        // Extend list of paths with current path if it contains coordinates
        if (currentPath.length) {
          paths.push(currentPath);
        }
      }
    }
  }
  return paths;
}
/**
 * Parses marker options provided via query and sets corresponding attributes
 * on marker object.
 * Options adhere to the following format
 * [optionName]:[optionValue]
 * @param {Array<string>} optionsList List of option strings.
 * @param {object} marker Marker object to configure.
 * @returns {void}
 */
function parseMarkerOptions(optionsList, marker) {
  for (const options of optionsList) {
    const optionParts = options.split(':');
    // Ensure we got an option name and value
    if (optionParts.length < 2) {
      continue;
    }

    switch (optionParts[0]) {
      // Scale factor to up- or downscale icon
      case 'scale':
        // Scale factors must not be negative
        marker.scale = Math.abs(parseFloat(optionParts[1]));
        break;
      // Icon offset as positive or negative pixel value in the following
      // format [offsetX],[offsetY] where [offsetY] is optional
      case 'offset':
        const providedOffset = optionParts[1].split(',');
        // Set X-axis offset
        marker.offsetX = parseFloat(providedOffset[0]);
        // Check if an offset has been provided for Y-axis
        if (providedOffset.length > 1) {
          marker.offsetY = parseFloat(providedOffset[1]);
        }
        break;
    }
  }
}

/**
 * Parses markers provided via query into a list of marker objects.
 * @param {object} query Request query parameters.
 * @param {object} options Configuration options.
 * @param {Function} transformer Optional transform function.
 * @returns {Array<object>} An array of marker objects.
 */
function extractMarkersFromQuery(query, options, transformer) {
  // Return an empty list if no markers have been provided
  if (!query.marker) {
    return [];
  }

  const markers = [];

  // Check if multiple markers have been provided and mimic a list if it's a
  // single maker.
  const providedMarkers = Array.isArray(query.marker)
    ? query.marker
    : [query.marker];

  // Iterate through provided markers which can have one of the following
  // formats
  // [location]|[pathToFileTelativeToConfiguredIconPath]
  // [location]|[pathToFile...]|[option]|[option]|...
  for (const providedMarker of providedMarkers) {
    const markerParts = providedMarker.split('|');
    // Ensure we got at least a location and an icon uri
    if (markerParts.length < 2) {
      continue;
    }

    const locationParts = markerParts[0].split(',');
    // Ensure the locationParts contains two items
    if (locationParts.length !== 2) {
      continue;
    }

    let iconURI = markerParts[1];
    // Check if icon is served via http otherwise marker icons are expected to
    // be provided as filepaths relative to configured icon path
    const isRemoteURL =
      iconURI.startsWith('http://') || iconURI.startsWith('https://');
    const isDataURL = iconURI.startsWith('data:');
    if (!(isRemoteURL || isDataURL)) {
      // Sanitize URI with sanitize-filename
      // https://www.npmjs.com/package/sanitize-filename#details
      iconURI = sanitize(iconURI);

      // If the selected icon is not part of available icons skip it
      if (!options.paths.availableIcons.includes(iconURI)) {
        continue;
      }

      iconURI = path.resolve(options.paths.icons, iconURI);

      // When we encounter a remote icon check if the configuration explicitly allows them.
    } else if (isRemoteURL && options.allowRemoteMarkerIcons !== true) {
      continue;
    } else if (isDataURL && options.allowInlineMarkerImages !== true) {
      continue;
    }

    // Ensure marker location could be parsed
    const location = parseCoordinates(locationParts, query, transformer);
    if (location === null) {
      continue;
    }

    const marker = {};

    marker.location = location;
    marker.icon = iconURI;

    // Check if options have been provided
    if (markerParts.length > 2) {
      parseMarkerOptions(markerParts.slice(2), marker);
    }

    // Add marker to list
    markers.push(marker);
  }
  return markers;
}
/**
 * Calculates the zoom level for a given bounding box.
 * @param {Array<number>} bbox Bounding box as [minx, miny, maxx, maxy].
 * @param {number} w Width of the image.
 * @param {number} h Height of the image.
 * @param {object} query Request query parameters.
 * @returns {number} Calculated zoom level.
 */
function calcZForBBox(bbox, w, h, query) {
  let z = 25;

  const padding = query.padding !== undefined ? parseFloat(query.padding) : 0.1;

  const minCorner = mercator.px([bbox[0], bbox[3]], z);
  const maxCorner = mercator.px([bbox[2], bbox[1]], z);
  const w_ = w / (1 + 2 * padding);
  const h_ = h / (1 + 2 * padding);

  z -=
    Math.max(
      Math.log((maxCorner[0] - minCorner[0]) / w_),
      Math.log((maxCorner[1] - minCorner[1]) / h_),
    ) / Math.LN2;

  z = Math.max(Math.log(Math.max(w, h) / 256) / Math.LN2, Math.min(25, z));

  return z;
}

/**
 * Responds with an image.
 * @param {object} options Configuration options.
 * @param {object} item Item object containing map and other information.
 * @param {number} z Zoom level.
 * @param {number} lon Longitude of the center.
 * @param {number} lat Latitude of the center.
 * @param {number} bearing Map bearing.
 * @param {number} pitch Map pitch.
 * @param {number} width Width of the image.
 * @param {number} height Height of the image.
 * @param {number} scale Scale factor.
 * @param {string} format Image format.
 * @param {object} res Express response object.
 * @param {Buffer|null} overlay Optional overlay image.
 * @param {string} mode Rendering mode ('tile' or 'static').
 * @returns {Promise<void>}
 */
async function respondImage(
  options,
  item,
  z,
  lon,
  lat,
  bearing,
  pitch,
  width,
  height,
  scale,
  format,
  res,
  overlay = null,
  mode = 'tile',
) {
  if (
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 85.06 ||
    lon !== lon ||
    lat !== lat
  ) {
    return res.status(400).send('Invalid center');
  }

  if (
    Math.min(width, height) <= 0 ||
    Math.max(width, height) * scale > (options.maxSize || 2048) ||
    width !== width ||
    height !== height
  ) {
    return res.status(400).send('Invalid size');
  }

  if (format === 'png' || format === 'webp') {
  } else if (format === 'jpg' || format === 'jpeg') {
    format = 'jpeg';
  } else {
    return res.status(400).send('Invalid format');
  }

  const tileMargin = Math.max(options.tileMargin || 0, 0);
  let pool;
  if (mode === 'tile' && tileMargin === 0) {
    pool = item.map.renderers[scale];
  } else {
    pool = item.map.renderersStatic[scale];
  }

  pool.acquire(async (err, renderer) => {
    // For 512px tiles, use the actual maplibre-native zoom. For 256px tiles, use zoom - 1
    let mlglZ;
    if (width === 512) {
      mlglZ = Math.max(0, z);
    } else {
      mlglZ = Math.max(0, z - 1);
    }

    const params = {
      zoom: mlglZ,
      center: [lon, lat],
      bearing,
      pitch,
      width,
      height,
    };

    // HACK(Part 1) 256px tiles are a zoom level lower than maplibre-native default tiles. this hack allows tileserver-gl to support zoom 0 256px tiles, which would actually be zoom -1 in maplibre-native. Since zoom -1 isn't supported, a double sized zoom 0 tile is requested and resized in Part 2.
    if (z === 0 && width === 256) {
      params.width *= 2;
      params.height *= 2;
    }
    // END HACK(Part 1)

    if (z > 0 && tileMargin > 0) {
      params.width += tileMargin * 2;
      params.height += tileMargin * 2;
    }

    renderer.render(params, (err, data) => {
      pool.release(renderer);
      if (err) {
        console.error(err);
        return res.status(500).header('Content-Type', 'text/plain').send(err);
      }

      const image = sharp(data, {
        raw: {
          premultiplied: true,
          width: params.width * scale,
          height: params.height * scale,
          channels: 4,
        },
      });

      if (z > 0 && tileMargin > 0) {
        const y = mercator.px(params.center, z)[1];
        const yoffset = Math.max(
          Math.min(0, y - 128 - tileMargin),
          y + 128 + tileMargin - Math.pow(2, z + 8),
        );
        image.extract({
          left: tileMargin * scale,
          top: (tileMargin + yoffset) * scale,
          width: width * scale,
          height: height * scale,
        });
      }
      // HACK(Part 2) 256px tiles are a zoom level lower than maplibre-native default tiles. this hack allows tileserver-gl to support zoom 0 256px tiles, which would actually be zoom -1 in maplibre-native. Since zoom -1 isn't supported, a double sized zoom 0 tile is requested and resized here.

      if (z === 0 && width === 256) {
        image.resize(width * scale, height * scale);
      }
      // END HACK(Part 2)

      const composites = [];
      if (overlay) {
        composites.push({ input: overlay });
      }
      if (item.watermark) {
        const canvas = renderWatermark(width, height, scale, item.watermark);

        composites.push({ input: canvas.toBuffer() });
      }

      if (mode === 'static' && item.staticAttributionText) {
        const canvas = renderAttribution(
          width,
          height,
          scale,
          item.staticAttributionText,
        );

        composites.push({ input: canvas.toBuffer() });
      }

      if (composites.length > 0) {
        image.composite(composites);
      }

      // Legacy formatQuality is deprecated but still works
      const formatQualities = options.formatQuality || {};
      if (Object.keys(formatQualities).length !== 0) {
        console.log(
          'WARNING: The formatQuality option is deprecated and has been replaced with formatOptions. Please see the documentation. The values from formatQuality will be used if a quality setting is not provided via formatOptions.',
        );
      }
      const formatQuality = formatQualities[format];

      const formatOptions = (options.formatOptions || {})[format] || {};

      if (format === 'png') {
        image.png({
          progressive: formatOptions.progressive,
          compressionLevel: formatOptions.compressionLevel,
          adaptiveFiltering: formatOptions.adaptiveFiltering,
          palette: formatOptions.palette,
          quality: formatOptions.quality,
          effort: formatOptions.effort,
          colors: formatOptions.colors,
          dither: formatOptions.dither,
        });
      } else if (format === 'jpeg') {
        image.jpeg({
          quality: formatOptions.quality || formatQuality || 80,
          progressive: formatOptions.progressive,
        });
      } else if (format === 'webp') {
        image.webp({ quality: formatOptions.quality || formatQuality || 90 });
      }
      image.toBuffer((err, buffer, info) => {
        if (!buffer) {
          return res.status(404).send('Not found');
        }

        res.set({
          'Last-Modified': item.lastModified,
          'Content-Type': `image/${format}`,
        });
        return res.status(200).send(buffer);
      });
    });
  });
}

/**
 * Handles requests for tile images.
 * @param {object} options - Configuration options for the server.
 * @param {object} repo - The repository object holding style data.
 * @param {object} req - Express request object.
 * @param {string} req.params.id - The id of the style.
 * @param {string} req.params.p1 - The tile size parameter, if available.
 * @param {string} req.params.p2 - The z parameter.
 * @param {string} req.params.p3 - The x parameter.
 * @param {string} req.params.p4 - The y parameter.
 * @param {string} req.params.scale - The scale parameter.
 * @param {string} req.params.format - The format of the image.
 * @param {object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 * @param {number} maxScaleFactor - The maximum scale factor allowed.
 * @param defailtTileSize
 * @returns {Promise<void>}
 */
async function handleTileRequest(
  options,
  repo,
  req,
  res,
  next,
  maxScaleFactor,
  defailtTileSize,
) {
  const {
    id,
    p1: tileSize,
    p2: zParam,
    p3: xParam,
    p4: yParam,
    scale: scaleParam,
    format,
  } = req.params;
  const item = repo[id];
  if (!item) {
    return res.sendStatus(404);
  }

  const modifiedSince = req.get('if-modified-since');
  const cc = req.get('cache-control');
  if (modifiedSince && (!cc || cc.indexOf('no-cache') === -1)) {
    if (
      new Date(item.lastModified).getTime() ===
      new Date(modifiedSince).getTime()
    ) {
      return res.sendStatus(304);
    }
  }
  const z = parseFloat(zParam) | 0;
  const x = parseFloat(xParam) | 0;
  const y = parseFloat(yParam) | 0;
  const scale = allowedScales(scaleParam, maxScaleFactor);

  let parsedTileSize = parseInt(defailtTileSize, 10);
  if (tileSize) {
    parsedTileSize = parseInt(allowedTileSizes(tileSize), 10);

    if (parsedTileSize == null) {
      return res.status(400).send('Invalid Tile Size');
    }
  }

  if (
    scale == null ||
    z < 0 ||
    x < 0 ||
    y < 0 ||
    z > 22 ||
    x >= Math.pow(2, z) ||
    y >= Math.pow(2, z)
  ) {
    return res.status(400).send('Out of bounds');
  }

  const tileCenter = mercator.ll(
    [((x + 0.5) / (1 << z)) * (256 << z), ((y + 0.5) / (1 << z)) * (256 << z)],
    z,
  );

  // prettier-ignore
  return await respondImage(
    options, item, z, tileCenter[0], tileCenter[1], 0, 0, parsedTileSize, parsedTileSize, scale, format, res,
  );
}

/**
 * Handles requests for static map images.
 * @param {object} options - Configuration options for the server.
 * @param {object} repo - The repository object holding style data.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {string} req.params.p2 - The raw or static parameter.
 * @param {string} req.params.p3 - The staticType parameter.
 * @param {string} req.params.p4 - The width parameter.
 * @param {string} req.params.p5 - The height parameter.
 * @param {string} req.params.scale - The scale parameter.
 * @param {string} req.params.format - The format of the image.
 * @param {Function} next - Express next middleware function.
 * @param {number} maxScaleFactor - The maximum scale factor allowed.
 * @param verbose
 * @returns {Promise<void>}
 */
async function handleStaticRequest(
  options,
  repo,
  req,
  res,
  next,
  maxScaleFactor,
) {
  const {
    id,
    p2: raw,
    p3: staticType,
    p4: widthAndHeight,
    scale: scaleParam,
    format,
  } = req.params;
  const item = repo[id];

  let parsedWidth = null;
  let parsedHeight = null;
  if (widthAndHeight) {
    const sizeMatch = widthAndHeight.match(/^(\d+)x(\d+)$/);
    if (sizeMatch) {
      const width = parseInt(sizeMatch[1], 10);
      const height = parseInt(sizeMatch[2], 10);
      if (
        isNaN(width) ||
        isNaN(height) ||
        width !== parseFloat(sizeMatch[1]) ||
        height !== parseFloat(sizeMatch[2])
      ) {
        return res
          .status(400)
          .send('Invalid width or height provided in size parameter');
      }
      parsedWidth = width;
      parsedHeight = height;
    } else {
      return res
        .status(400)
        .send('Invalid width or height provided in size parameter');
    }
  } else {
    return res
      .status(400)
      .send('Invalid width or height provided in size parameter');
  }

  const scale = allowedScales(scaleParam, maxScaleFactor);
  let isRaw = raw === 'raw';

  const staticTypeMatch = staticType.match(staticTypeRegex);
  if (!item || !format || !scale || !staticTypeMatch?.groups) {
    return res.sendStatus(404);
  }

  if (staticTypeMatch.groups.lon) {
    // Center Based Static Image
    const z = parseFloat(staticTypeMatch.groups.zoom) || 0;
    let x = parseFloat(staticTypeMatch.groups.lon) || 0;
    let y = parseFloat(staticTypeMatch.groups.lat) || 0;
    const bearing = parseFloat(staticTypeMatch.groups.bearing) || 0;
    const pitch = parseInt(staticTypeMatch.groups.pitch) || 0;
    if (z < 0) {
      return res.status(404).send('Invalid zoom');
    }

    const transformer = isRaw
      ? mercator.inverse.bind(mercator)
      : item.dataProjWGStoInternalWGS;

    if (transformer) {
      const ll = transformer([x, y]);
      x = ll[0];
      y = ll[1];
    }

    const paths = extractPathsFromQuery(req.query, transformer);
    const markers = extractMarkersFromQuery(req.query, options, transformer);
    // prettier-ignore
    const overlay = await renderOverlay(
     z, x, y, bearing, pitch, parsedWidth, parsedHeight, scale, paths, markers, req.query,
   );

    // prettier-ignore
    return await respondImage(
    options, item, z, x, y, bearing, pitch, parsedWidth, parsedHeight, scale, format, res, overlay, 'static',
     );
  } else if (staticTypeMatch.groups.minx) {
    // Area Based Static Image
    const minx = parseFloat(staticTypeMatch.groups.minx) || 0;
    const miny = parseFloat(staticTypeMatch.groups.miny) || 0;
    const maxx = parseFloat(staticTypeMatch.groups.maxx) || 0;
    const maxy = parseFloat(staticTypeMatch.groups.maxy) || 0;
    const bbox = [minx, miny, maxx, maxy];
    let center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];

    const transformer = isRaw
      ? mercator.inverse.bind(mercator)
      : item.dataProjWGStoInternalWGS;

    if (transformer) {
      const minCorner = transformer(bbox.slice(0, 2));
      const maxCorner = transformer(bbox.slice(2));
      bbox[0] = minCorner[0];
      bbox[1] = minCorner[1];
      bbox[2] = maxCorner[0];
      bbox[3] = maxCorner[1];
      center = transformer(center);
    }

    const z = calcZForBBox(bbox, parsedWidth, parsedHeight, req.query);
    const x = center[0];
    const y = center[1];
    const bearing = 0;
    const pitch = 0;

    const paths = extractPathsFromQuery(req.query, transformer);
    const markers = extractMarkersFromQuery(req.query, options, transformer);
    // prettier-ignore
    const overlay = await renderOverlay(
      z, x, y, bearing, pitch, parsedWidth, parsedHeight, scale, paths, markers, req.query,
      );

    // prettier-ignore
    return await respondImage(
      options, item, z, x, y, bearing, pitch, parsedWidth, parsedHeight, scale, format, res, overlay, 'static',
     );
  } else if (staticTypeMatch.groups.auto) {
    // Area Static Image
    const bearing = 0;
    const pitch = 0;

    const transformer = isRaw
      ? mercator.inverse.bind(mercator)
      : item.dataProjWGStoInternalWGS;

    const paths = extractPathsFromQuery(req.query, transformer);
    const markers = extractMarkersFromQuery(req.query, options, transformer);

    // Extract coordinates from markers
    const markerCoordinates = [];
    for (const marker of markers) {
      markerCoordinates.push(marker.location);
    }

    // Create array with coordinates from markers and path
    const coords = [].concat(paths.flat()).concat(markerCoordinates);

    // Check if we have at least one coordinate to calculate a bounding box
    if (coords.length < 1) {
      return res.status(400).send('No coordinates provided');
    }

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const pair of coords) {
      bbox[0] = Math.min(bbox[0], pair[0]);
      bbox[1] = Math.min(bbox[1], pair[1]);
      bbox[2] = Math.max(bbox[2], pair[0]);
      bbox[3] = Math.max(bbox[3], pair[1]);
    }

    const bbox_ = mercator.convert(bbox, '900913');
    const center = mercator.inverse([
      (bbox_[0] + bbox_[2]) / 2,
      (bbox_[1] + bbox_[3]) / 2,
    ]);

    // Calculate zoom level
    const maxZoom = parseFloat(req.query.maxzoom);
    let z = calcZForBBox(bbox, parsedWidth, parsedHeight, req.query);
    if (maxZoom > 0) {
      z = Math.min(z, maxZoom);
    }

    const x = center[0];
    const y = center[1];

    // prettier-ignore
    const overlay = await renderOverlay(
      z, x, y, bearing, pitch, parsedWidth, parsedHeight, scale, paths, markers, req.query,
    );

    // prettier-ignore
    return await respondImage(
        options, item, z, x, y, bearing, pitch, parsedWidth, parsedHeight, scale, format, res, overlay, 'static',
      );
  } else {
    return res.sendStatus(404);
  }
}
const existingFonts = {};
let maxScaleFactor = 2;

export const serve_rendered = {
  /**
   * Initializes the serve_rendered module.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} programOpts - An object containing the program options.
   * @returns {Promise<express.Application>} A promise that resolves to the Express app.
   */
  init: async function (options, repo, programOpts) {
    const { verbose, tileSize: defailtTileSize = 256 } = programOpts;
    maxScaleFactor = Math.min(Math.floor(options.maxScaleFactor || 3), 9);
    const app = express().disable('x-powered-by');

    /**
     * Handles requests for tile images.
     * @param {object} req - Express request object.
     * @param {object} res - Express response object.
     * @param {string} req.params.id - The id of the style.
     * @param {string} [req.params.p1] - The tile size or static parameter, if available.
     * @param {string} req.params.p2 - The z, static, or raw parameter.
     * @param {string} req.params.p3 - The x or staticType parameter.
     * @param {string} req.params.p4 - The y or width parameter.
     * @param {string} req.params.scale - The scale parameter.
     * @param {string} req.params.format - The format of the image.
     * @returns {Promise<void>}
     */
    app.get(
      `/:id{/:p1}/:p2/:p3/:p4{@:scale}{.:format}`,
      async (req, res, next) => {
        try {
          const { p1, p2, id, p3, p4, scale, format } = req.params;
          const requestType =
            (!p1 && p2 === 'static') || (p1 === 'static' && p2 === 'raw')
              ? 'static'
              : 'tile';
          if (verbose) {
            console.log(
              `Handling rendered %s request for: /styles/%s%s/%s/%s/%s%s.%s`,
              requestType,
              String(id).replace(/\n|\r/g, ''),
              p1 ? '/' + String(p1).replace(/\n|\r/g, '') : '',
              String(p2).replace(/\n|\r/g, ''),
              String(p3).replace(/\n|\r/g, ''),
              String(p4).replace(/\n|\r/g, ''),
              scale ? '@' + String(scale).replace(/\n|\r/g, '') : '',
              String(format).replace(/\n|\r/g, ''),
            );
          }

          if (requestType === 'static') {
            // Route to static if p2 is static
            if (options.serveStaticMaps !== false) {
              return handleStaticRequest(
                options,
                repo,
                req,
                res,
                next,
                maxScaleFactor,
              );
            }
            return res.sendStatus(404);
          }

          return handleTileRequest(
            options,
            repo,
            req,
            res,
            next,
            maxScaleFactor,
            defailtTileSize,
          );
        } catch (e) {
          console.log(e);
          return next(e);
        }
      },
    );

    /**
     * Handles requests for rendered tilejson endpoint.
     * @param {object} req - Express request object.
     * @param {object} res - Express response object.
     * @param {string} req.params.id - The id of the tilejson
     * @param {string} [req.params.tileSize] - The size of the tile, if specified.
     * @returns {void}
     */
    app.get('{/:tileSize}/:id.json', (req, res, next) => {
      const item = repo[req.params.id];
      if (!item) {
        return res.sendStatus(404);
      }
      const tileSize = parseInt(req.params.tileSize, 10) || undefined;
      if (verbose) {
        console.log(
          `Handling rendered tilejson request for: /styles/%s%s.json`,
          req.params.tileSize
            ? String(req.params.tileSize).replace(/\n|\r/g, '') + '/'
            : '',
          String(req.params.id).replace(/\n|\r/g, ''),
        );
      }
      const info = clone(item.tileJSON);
      info.tileSize = tileSize != undefined ? tileSize : 256;
      info.tiles = getTileUrls(
        req,
        info.tiles,
        `styles/${req.params.id}`,
        tileSize,
        info.format,
        item.publicUrl,
      );
      return res.send(info);
    });

    const fonts = await listFonts(options.paths.fonts);
    Object.assign(existingFonts, fonts);
    return app;
  },
  /**
   * Adds a new item to the repository.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} params Parameters object.
   * @param {string} id ID of the item.
   * @param {object} programOpts - An object containing the program options
   * @param {object} style pre-fetched/read StyleJSON object.
   * @param {Function} dataResolver Function to resolve data.
   * @returns {Promise<void>}
   */
  add: async function (
    options,
    repo,
    params,
    id,
    programOpts,
    style,
    dataResolver,
  ) {
    const map = {
      renderers: [],
      renderersStatic: [],
      sources: {},
      sourceTypes: {},
    };

    const { publicUrl, verbose } = programOpts;

    const styleJSON = clone(style);
    /**
     * Creates a pool of renderers.
     * @param {number} ratio Pixel ratio
     * @param {string} mode Rendering mode ('tile' or 'static').
     * @param {number} min Minimum pool size.
     * @param {number} max Maximum pool size.
     * @returns {object} The created pool
     */
    const createPool = (ratio, mode, min, max) => {
      /**
       * Creates a renderer
       * @param {number} ratio Pixel ratio
       * @param {Function} createCallback Function that returns the renderer when created
       *  @returns {void}
       */
      const createRenderer = (ratio, createCallback) => {
        const renderer = new mlgl.Map({
          mode,
          ratio,
          request: async (req, callback) => {
            const protocol = req.url.split(':')[0];
            if (verbose) {
              console.log('Handling request:', req);
            }
            if (protocol === 'sprites') {
              const dir = options.paths[protocol];
              const file = decodeURIComponent(req.url).substring(
                protocol.length + 3,
              );
              readFile(path.join(dir, file))
                .then((data) => {
                  callback(null, { data: data });
                })
                .catch((err) => {
                  callback(err, null);
                });
            } else if (protocol === 'fonts') {
              const parts = req.url.split('/');
              const fontstack = decodeURIComponent(parts[2]);
              const range = parts[3].split('.')[0];

              try {
                const concatenated = await getFontsPbf(
                  null,
                  options.paths[protocol],
                  fontstack,
                  range,
                  existingFonts,
                );
                callback(null, { data: concatenated });
              } catch (err) {
                callback(err, { data: null });
              }
            } else if (protocol === 'mbtiles' || protocol === 'pmtiles') {
              const parts = req.url.split('/');
              const sourceId = parts[2];
              const source = map.sources[sourceId];
              const sourceType = map.sourceTypes[sourceId];
              const sourceInfo = styleJSON.sources[sourceId];

              const z = parts[3] | 0;
              const x = parts[4] | 0;
              const y = parts[5].split('.')[0] | 0;
              const format = parts[5].split('.')[1];

              const fetchTile = await fetchTileData(
                source,
                sourceType,
                z,
                x,
                y,
              );
              if (fetchTile == null && sourceInfo.sparse == true) {
                if (verbose) {
                  console.log(
                    'fetchTile warning on %s, sparse response',
                    req.url,
                  );
                }
                callback();
                return;
              } else if (fetchTile == null) {
                if (verbose) {
                  console.log(
                    'fetchTile error on %s, serving empty response',
                    req.url,
                  );
                }
                createEmptyResponse(
                  sourceInfo.format,
                  sourceInfo.color,
                  callback,
                );
                return;
              }

              const response = {};
              response.data = fetchTile.data;
              let headers = fetchTile.headers;

              if (headers['Last-Modified']) {
                response.modified = new Date(headers['Last-Modified']);
              }

              if (format === 'pbf') {
                let isGzipped =
                  response.data
                    .slice(0, 2)
                    .indexOf(Buffer.from([0x1f, 0x8b])) === 0;
                if (isGzipped) {
                  response.data = await gunzipP(response.data);
                }
                if (options.dataDecoratorFunc) {
                  response.data = options.dataDecoratorFunc(
                    sourceId,
                    'data',
                    response.data,
                    z,
                    x,
                    y,
                  );
                }
              }

              callback(null, response);
            } else if (protocol === 'http' || protocol === 'https') {
              try {
                const response = await axios.get(req.url, {
                  responseType: 'arraybuffer', // Get the response as raw buffer
                  // Axios handles gzip by default, so no need for a gzip flag
                });

                const responseHeaders = response.headers;
                const responseData = response.data;

                const parsedResponse = {};
                if (responseHeaders['last-modified']) {
                  parsedResponse.modified = new Date(
                    responseHeaders['last-modified'],
                  );
                }
                if (responseHeaders.expires) {
                  parsedResponse.expires = new Date(responseHeaders.expires);
                }
                if (responseHeaders.etag) {
                  parsedResponse.etag = responseHeaders.etag;
                }

                parsedResponse.data = responseData;
                callback(null, parsedResponse);
              } catch (error) {
                if (error.response && error.response.status === 410) {
                  // This is the 410 "Gone" error, treat as sparse
                  if (verbose) {
                    console.log(
                      'fetchTile warning on %s, sparse response due to 410 Gone',
                      req.url,
                    );
                  }
                  callback();
                } else {
                  // For all other errors (e.g., network errors, 404, 500, etc.) return empty content.
                  console.error(
                    `Error fetching remote URL ${req.url}:`,
                    error.message || error,
                    error.response
                      ? `Status: ${error.response.status}`
                      : 'No response received',
                  );

                  const parts = url.parse(req.url);
                  const extension = path.extname(parts.pathname).toLowerCase();
                  const format = extensionToFormat[extension] || '';
                  createEmptyResponse(format, '', callback);
                }
              }
            } else if (protocol === 'file') {
              const name = decodeURI(req.url).substring(protocol.length + 3);
              const file = path.join(options.paths['files'], name);
              if (await existsP(file)) {
                const inputFileStats = await fsp.stat(file);
                if (!inputFileStats.isFile() || inputFileStats.size === 0) {
                  throw Error(
                    `File is not valid: "${req.url}" - resolved to "${file}"`,
                  );
                }

                readFile(file)
                  .then((data) => {
                    callback(null, { data: data });
                  })
                  .catch((err) => {
                    callback(err, null);
                  });
              } else {
                throw Error(
                  `File does not exist: "${req.url}" - resolved to "${file}"`,
                );
              }
            }
          },
        });
        renderer.load(styleJSON);
        createCallback(null, renderer);
      };
      return new advancedPool.Pool({
        min,
        max,
        create: createRenderer.bind(null, ratio),
        destroy: (renderer) => {
          renderer.release();
        },
      });
    };

    const styleFile = params.style;
    const styleJSONPath = path.resolve(options.paths.styles, styleFile);

    if (styleJSON.sprite) {
      if (!Array.isArray(styleJSON.sprite)) {
        styleJSON.sprite = [{ id: 'default', url: styleJSON.sprite }];
      }
      styleJSON.sprite.forEach((spriteItem) => {
        if (!httpTester.test(spriteItem.url)) {
          spriteItem.url =
            'sprites://' +
            spriteItem.url
              .replace('{style}', path.basename(styleFile, '.json'))
              .replace(
                '{styleJsonFolder}',
                path.relative(
                  options.paths.sprites,
                  path.dirname(styleJSONPath),
                ),
              );
        }
      });
    }

    if (styleJSON.glyphs && !httpTester.test(styleJSON.glyphs)) {
      styleJSON.glyphs = `fonts://${styleJSON.glyphs}`;
    }

    for (const layer of styleJSON.layers || []) {
      if (layer && layer.paint) {
        const layerIdForWarning = layer.id || 'unnamed-layer';

        // Remove (flatten) 3D buildings
        if (layer.paint['fill-extrusion-height']) {
          if (verbose) {
            console.warn(
              `Warning: Layer '${layerIdForWarning}' in style '${id}' has property 'fill-extrusion-height'. ` +
                `3D extrusion may appear distorted or misleading when rendered as a static image due to camera angle limitations. ` +
                `It will be flattened (set to 0) in rendered images. ` +
                `Note: This property will still work with MapLibre GL JS vector maps.`,
            );
          }
          layer.paint['fill-extrusion-height'] = 0;
        }
        if (layer.paint['fill-extrusion-base']) {
          if (verbose) {
            console.warn(
              `Warning: Layer '${layerIdForWarning}' in style '${id}' has property 'fill-extrusion-base'. ` +
                `3D extrusion may appear distorted or misleading when rendered as a static image due to camera angle limitations. ` +
                `It will be flattened (set to 0) in rendered images. ` +
                `Note: This property will still work with MapLibre GL JS vector maps.`,
            );
          }
          layer.paint['fill-extrusion-base'] = 0;
        }

        // --- Remove hillshade properties incompatible with MapLibre Native ---
        const hillshadePropertiesToRemove = [
          'hillshade-method',
          'hillshade-illumination-direction',
          'hillshade-highlight-color',
        ];

        for (const prop of hillshadePropertiesToRemove) {
          if (prop in layer.paint) {
            if (verbose) {
              console.warn(
                `Warning: Layer '${layerIdForWarning}' in style '${id}' has property '${prop}'. ` +
                  `This property is not supported by MapLibre Native. ` +
                  `It will be removed in rendered images. ` +
                  `Note: This property will still work with MapLibre GL JS vector maps.`,
              );
            }
            delete layer.paint[prop];
          }
        }

        // --- Remove 'hillshade-shadow-color' if it is an array. It can only be a string in MapLibre Native ---
        if (Array.isArray(layer.paint['hillshade-shadow-color'])) {
          if (verbose) {
            console.warn(
              `Warning: Layer '${layerIdForWarning}' in style '${id}' has property 'hillshade-shadow-color'. ` +
                `An array value is not supported by MapLibre Native for this property (expected string/color). ` +
                `It will be removed in rendered images. ` +
                `Note: Using an array for this property will still work with MapLibre GL JS vector maps.`,
            );
          }
          delete layer.paint['hillshade-shadow-color'];
        }
      }
    }

    const tileJSON = {
      tilejson: '2.0.0',
      name: styleJSON.name,
      attribution: '',
      minzoom: 0,
      maxzoom: 20,
      bounds: [-180, -85.0511, 180, 85.0511],
      format: 'png',
      type: 'baselayer',
    };
    const attributionOverride = params.tilejson && params.tilejson.attribution;
    if (styleJSON.center && styleJSON.zoom) {
      tileJSON.center = styleJSON.center.concat(Math.round(styleJSON.zoom));
    }
    Object.assign(tileJSON, params.tilejson || {});
    tileJSON.tiles = params.domains || options.domains;
    fixTileJSONCenter(tileJSON);

    const repoobj = {
      tileJSON,
      publicUrl,
      map,
      dataProjWGStoInternalWGS: null,
      lastModified: new Date().toUTCString(),
      watermark: params.watermark || options.watermark,
      staticAttributionText:
        params.staticAttributionText || options.staticAttributionText,
    };
    repo[id] = repoobj;

    for (const name of Object.keys(styleJSON.sources)) {
      let sourceType;
      let sparse;
      let source = styleJSON.sources[name];
      let url = source.url;
      if (
        url &&
        (url.startsWith('pmtiles://') || url.startsWith('mbtiles://'))
      ) {
        // found pmtiles or mbtiles source, replace with info from local file
        delete source.url;

        let dataId = url.replace('pmtiles://', '').replace('mbtiles://', '');
        if (dataId.startsWith('{') && dataId.endsWith('}')) {
          dataId = dataId.slice(1, -1);
        }

        const mapsTo = (params.mapping || {})[dataId];
        if (mapsTo) {
          dataId = mapsTo;
        }

        let inputFile;
        const dataInfo = dataResolver(dataId);
        if (dataInfo.inputFile) {
          inputFile = dataInfo.inputFile;
          sourceType = dataInfo.fileType;
          sparse = dataInfo.sparse;
        } else {
          console.error(`ERROR: data "${inputFile}" not found!`);
          process.exit(1);
        }

        if (!isValidHttpUrl(inputFile)) {
          const inputFileStats = await fsp.stat(inputFile);
          if (!inputFileStats.isFile() || inputFileStats.size === 0) {
            throw Error(`Not valid PMTiles file: "${inputFile}"`);
          }
        }

        if (sourceType === 'pmtiles') {
          map.sources[name] = openPMtiles(inputFile);
          map.sourceTypes[name] = 'pmtiles';
          const metadata = await getPMtilesInfo(map.sources[name]);

          if (!repoobj.dataProjWGStoInternalWGS && metadata.proj4) {
            // how to do this for multiple sources with different proj4 defs?
            const to3857 = proj4('EPSG:3857');
            const toDataProj = proj4(metadata.proj4);
            repoobj.dataProjWGStoInternalWGS = (xy) =>
              to3857.inverse(toDataProj.forward(xy));
          }

          const type = source.type;
          Object.assign(source, metadata);
          source.type = type;
          source.sparse = sparse;
          source.tiles = [
            // meta url which will be detected when requested
            `pmtiles://${name}/{z}/{x}/{y}.${metadata.format || 'pbf'}`,
          ];
          delete source.scheme;

          if (
            !attributionOverride &&
            source.attribution &&
            source.attribution.length > 0
          ) {
            if (!tileJSON.attribution.includes(source.attribution)) {
              if (tileJSON.attribution.length > 0) {
                tileJSON.attribution += ' | ';
              }
              tileJSON.attribution += source.attribution;
            }
          }
        } else {
          const inputFileStats = await fsp.stat(inputFile);
          if (!inputFileStats.isFile() || inputFileStats.size === 0) {
            throw Error(`Not valid MBTiles file: "${inputFile}"`);
          }
          const mbw = await openMbTilesWrapper(inputFile);
          const info = await mbw.getInfo();
          map.sources[name] = mbw.getMbTiles();
          map.sourceTypes[name] = 'mbtiles';

          if (!repoobj.dataProjWGStoInternalWGS && info.proj4) {
            // how to do this for multiple sources with different proj4 defs?
            const to3857 = proj4('EPSG:3857');
            const toDataProj = proj4(info.proj4);
            repoobj.dataProjWGStoInternalWGS = (xy) =>
              to3857.inverse(toDataProj.forward(xy));
          }

          const type = source.type;
          Object.assign(source, info);
          source.type = type;
          source.sparse = sparse;
          source.tiles = [
            // meta url which will be detected when requested
            `mbtiles://${name}/{z}/{x}/{y}.${info.format || 'pbf'}`,
          ];
          delete source.scheme;

          if (options.dataDecoratorFunc) {
            source = options.dataDecoratorFunc(name, 'tilejson', source);
          }

          if (
            !attributionOverride &&
            source.attribution &&
            source.attribution.length > 0
          ) {
            if (!tileJSON.attribution.includes(source.attribution)) {
              if (tileJSON.attribution.length > 0) {
                tileJSON.attribution += ' | ';
              }
              tileJSON.attribution += source.attribution;
            }
          }
        }
      }
    }

    // standard and @2x tiles are much more usual -> default to larger pools
    const minPoolSizes = options.minRendererPoolSizes || [8, 4, 2];
    const maxPoolSizes = options.maxRendererPoolSizes || [16, 8, 4];
    for (let s = 1; s <= maxScaleFactor; s++) {
      const i = Math.min(minPoolSizes.length - 1, s - 1);
      const j = Math.min(maxPoolSizes.length - 1, s - 1);
      const minPoolSize = minPoolSizes[i];
      const maxPoolSize = Math.max(minPoolSize, maxPoolSizes[j]);
      map.renderers[s] = createPool(s, 'tile', minPoolSize, maxPoolSize);
      map.renderersStatic[s] = createPool(
        s,
        'static',
        minPoolSize,
        maxPoolSize,
      );
    }
  },
  /**
   * Removes an item from the repository.
   * @param {object} repo Repository object.
   * @param {string} id ID of the item to remove.
   * @returns {void}
   */
  remove: function (repo, id) {
    const item = repo[id];
    if (item) {
      item.map.renderers.forEach((pool) => {
        pool.close();
      });
      item.map.renderersStatic.forEach((pool) => {
        pool.close();
      });
    }
    delete repo[id];
  },
  /**
   * Removes all items from the repository.
   * @param {object} repo Repository object.
   * @returns {void}
   */
  clear: function (repo) {
    Object.keys(repo).forEach((id) => {
      const item = repo[id];
      if (item) {
        item.map.renderers.forEach((pool) => {
          pool.close();
        });
        item.map.renderersStatic.forEach((pool) => {
          pool.close();
        });
      }
      delete repo[id];
    });
  },
  /**
   * Get the elevation of terrain tile data by rendering it to a canvas image
   * @param {object} data The background color (or empty string for transparent).
   * @param {object} param Required parameters (coordinates e.g.)
   * @returns {object}
   */
  getTerrainElevation: async function (data, param) {
    return await new Promise(async (resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        const canvas = createCanvas(param['tile_size'], param['tile_size']);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);

        // calculate pixel coordinate of tile,
        // see https://developers.google.com/maps/documentation/javascript/examples/map-coordinates
        let siny = Math.sin((param['lat'] * Math.PI) / 180);
        // Truncating to 0.9999 effectively limits latitude to 89.189. This is
        // about a third of a tile past the edge of the world tile.
        siny = Math.min(Math.max(siny, -0.9999), 0.9999);
        const xWorld = param['tile_size'] * (0.5 + param['long'] / 360);
        const yWorld =
          param['tile_size'] *
          (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI));

        const scale = 1 << param['z'];

        const xTile = Math.floor((xWorld * scale) / param['tile_size']);
        const yTile = Math.floor((yWorld * scale) / param['tile_size']);

        const xPixel = Math.floor(xWorld * scale) - xTile * param['tile_size'];
        const yPixel = Math.floor(yWorld * scale) - yTile * param['tile_size'];
        if (
          xPixel < 0 ||
          yPixel < 0 ||
          xPixel >= param['tile_size'] ||
          yPixel >= param['tile_size']
        ) {
          return reject('Out of bounds Pixel');
        }
        const imgdata = context.getImageData(xPixel, yPixel, 1, 1);
        const red = imgdata.data[0];
        const green = imgdata.data[1];
        const blue = imgdata.data[2];
        let elevation;
        if (param['encoding'] === 'mapbox') {
          elevation = -10000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
        } else if (param['encoding'] === 'terrarium') {
          elevation = red * 256 + green + blue / 256 - 32768;
        } else {
          elevation = 'invalid encoding';
        }
        param['elevation'] = elevation;
        param['red'] = red;
        param['green'] = green;
        param['blue'] = blue;
        resolve(param);
      };
      image.onerror = (err) => reject(err);
      if (param['format'] === 'webp') {
        try {
          const img = await sharp(data).toFormat('png').toBuffer();
          image.src = img;
        } catch (err) {
          reject(err);
        }
      } else {
        image.src = data;
      }
    });
  },
};
