'use strict';

import path from 'path';
import fsPromises from 'fs/promises';
import fs from 'node:fs';
import clone from 'clone';
import { combine } from '@jsse/pbfont';
import { existsP } from './promises.js';
import { getPMtilesTile } from './pmtiles_adapter.js';

export const allowedSpriteFormats = allowedOptions(['png', 'json']);

export const allowedTileSizes = allowedOptions(['256', '512']);

/**
 * Restrict user input to an allowed set of options.
 * @param {string[]} opts - An array of allowed option strings.
 * @param {object} [config] - Optional configuration object.
 * @param {string} [config.defaultValue] - The default value to return if input doesn't match.
 * @returns {function(string): string} - A function that takes a value and returns it if valid or a default.
 */
export function allowedOptions(opts, { defaultValue } = {}) {
  const values = Object.fromEntries(opts.map((key) => [key, key]));
  return (value) => values[value] || defaultValue;
}

/**
 * Parses a scale string to a number.
 * @param {string} scale The scale string (e.g., '2x', '4x').
 * @param {number} maxScale Maximum allowed scale digit.
 * @returns {number|null} The parsed scale as a number or null if invalid.
 */
export function allowedScales(scale, maxScale = 9) {
  if (scale === undefined) {
    return 1;
  }

  // eslint-disable-next-line security/detect-non-literal-regexp
  const regex = new RegExp(`^[2-${maxScale}]x$`);
  if (!regex.test(scale)) {
    return null;
  }

  return parseInt(scale.slice(0, -1), 10);
}

/**
 * Checks if a string is a valid sprite scale and returns it if it is within the allowed range, and null if it does not conform.
 * @param {string} scale - The scale string to validate (e.g., '2x', '3x').
 * @param {number} [maxScale] - The maximum scale value. If no value is passed in, it defaults to a value of 3.
 * @returns {string|null} - The valid scale string or null if invalid.
 */
export function allowedSpriteScales(scale, maxScale = 3) {
  if (!scale) {
    return '';
  }
  const match = scale?.match(/^([2-9]\d*)x$/);
  if (!match) {
    return null;
  }
  const parsedScale = parseInt(match[1], 10);
  if (parsedScale <= maxScale) {
    return `@${parsedScale}x`;
  }
  return null;
}

/**
 * Replaces local:// URLs with public http(s):// URLs.
 * @param {object} req - Express request object.
 * @param {string} url - The URL string to fix.
 * @param {string} publicUrl - The public URL prefix to use for replacements.
 * @returns {string} - The fixed URL string.
 */
export function fixUrl(req, url, publicUrl) {
  if (!url || typeof url !== 'string' || url.indexOf('local://') !== 0) {
    return url;
  }
  const queryParams = [];
  if (req.query.key) {
    queryParams.unshift(`key=${encodeURIComponent(req.query.key)}`);
  }
  let query = '';
  if (queryParams.length) {
    query = `?${queryParams.join('&')}`;
  }
  return url.replace('local://', getPublicUrl(publicUrl, req)) + query;
}

/**
 * Generates a new URL object from the Express request.
 * @param {object} req - Express request object.
 * @returns {URL} - URL object with correct host and optionally path.
 */
function getUrlObject(req) {
  const urlObject = new URL(`${req.protocol}://${req.headers.host}/`);
  // support overriding hostname by sending X-Forwarded-Host http header
  urlObject.hostname = req.hostname;

  // support overriding port by sending X-Forwarded-Port http header
  const xForwardedPort = req.get('X-Forwarded-Port');
  if (xForwardedPort) {
    urlObject.port = xForwardedPort;
  }

  // support add url prefix by sending X-Forwarded-Path http header
  const xForwardedPath = req.get('X-Forwarded-Path');
  if (xForwardedPath) {
    urlObject.pathname = path.posix.join(xForwardedPath, urlObject.pathname);
  }
  return urlObject;
}

/**
 * Gets the public URL, either from a provided publicUrl or generated from the request.
 * @param {string} publicUrl - The optional public URL to use.
 * @param {object} req - The Express request object.
 * @returns {string} - The final public URL string.
 */
export function getPublicUrl(publicUrl, req) {
  if (publicUrl) {
    try {
      return new URL(publicUrl).toString();
    } catch {
      return new URL(publicUrl, getUrlObject(req)).toString();
    }
  }
  return getUrlObject(req).toString();
}

/**
 * Generates an array of tile URLs based on given parameters.
 * @param {object} req - Express request object.
 * @param {string | string[]} domains - Domain(s) to use for tile URLs.
 * @param {string} path - The base path for the tiles.
 * @param {number} [tileSize] - The size of the tile (optional).
 * @param {string} format - The format of the tiles (e.g., 'png', 'jpg').
 * @param {string} publicUrl - The public URL to use (if not using domains).
 * @param {object} [aliases] - Aliases for format extensions.
 * @returns {string[]} An array of tile URL strings.
 */
export function getTileUrls(
  req,
  domains,
  path,
  tileSize,
  format,
  publicUrl,
  aliases,
) {
  const urlObject = getUrlObject(req);
  if (domains) {
    if (domains.constructor === String && domains.length > 0) {
      domains = domains.split(',');
    }
    const hostParts = urlObject.host.split('.');
    const relativeSubdomainsUsable =
      hostParts.length > 1 &&
      !/^([0-9]{1,3}\.){3}[0-9]{1,3}(\:[0-9]+)?$/.test(urlObject.host);
    const newDomains = [];
    for (const domain of domains) {
      if (domain.indexOf('*') !== -1) {
        if (relativeSubdomainsUsable) {
          const newParts = hostParts.slice(1);
          newParts.unshift(domain.replace('*', hostParts[0]));
          newDomains.push(newParts.join('.'));
        }
      } else {
        newDomains.push(domain);
      }
    }
    domains = newDomains;
  }
  if (!domains || domains.length == 0) {
    domains = [urlObject.host];
  }

  const queryParams = [];
  if (req.query.key) {
    queryParams.push(`key=${encodeURIComponent(req.query.key)}`);
  }
  if (req.query.style) {
    queryParams.push(`style=${encodeURIComponent(req.query.style)}`);
  }
  const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

  if (aliases && aliases[format]) {
    format = aliases[format];
  }

  let tileParams = `{z}/{x}/{y}`;
  if (tileSize && ['png', 'jpg', 'jpeg', 'webp'].includes(format)) {
    tileParams = `${tileSize}/{z}/{x}/{y}`;
  }

  if (format && format != '') {
    format = `.${format}`;
  } else {
    format = '';
  }

  const uris = [];
  if (!publicUrl) {
    let xForwardedPath = `${req.get('X-Forwarded-Path') ? '/' + req.get('X-Forwarded-Path') : ''}`;
    let protocol = req.get('X-Forwarded-Protocol')
      ? req.get('X-Forwarded-Protocol')
      : req.protocol;
    for (const domain of domains) {
      uris.push(
        `${protocol}://${domain}${xForwardedPath}/${path}/${tileParams}${format}${query}`,
      );
    }
  } else {
    uris.push(`${publicUrl}${path}/${tileParams}${format}${query}`);
  }

  return uris;
}

/**
 * Fixes the center in the tileJSON if no center is available.
 * @param {object} tileJSON - The tileJSON object to process.
 * @returns {void}
 */
export function fixTileJSONCenter(tileJSON) {
  if (tileJSON.bounds && !tileJSON.center) {
    const fitWidth = 1024;
    const tiles = fitWidth / 256;
    tileJSON.center = [
      (tileJSON.bounds[0] + tileJSON.bounds[2]) / 2,
      (tileJSON.bounds[1] + tileJSON.bounds[3]) / 2,
      Math.round(
        -Math.log((tileJSON.bounds[2] - tileJSON.bounds[0]) / 360 / tiles) /
          Math.LN2,
      ),
    ];
  }
}

/**
 * Reads a file and returns a Promise with the file data.
 * @param {string} filename - Path to the file to read.
 * @returns {Promise<Buffer>} - A Promise that resolves with the file data as a Buffer or rejects with an error.
 */
export function readFile(filename) {
  return new Promise((resolve, reject) => {
    const sanitizedFilename = path.normalize(filename); // Normalize path, remove ..
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.readFile(String(sanitizedFilename), (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Retrieves font data for a given font and range.
 * @param {object} allowedFonts - An object of allowed fonts.
 * @param {string} fontPath - The path to the font directory.
 * @param {string} name - The name of the font.
 * @param {string} range - The range (e.g., '0-255') of the font to load.
 * @param {object} [fallbacks] - Optional fallback font list.
 * @returns {Promise<Buffer>} A promise that resolves with the font data Buffer or rejects with an error.
 */
async function getFontPbf(allowedFonts, fontPath, name, range, fallbacks) {
  if (!allowedFonts || (allowedFonts[name] && fallbacks)) {
    const fontMatch = name?.match(/^[\p{L}\p{N} \-\.~!*'()@&=+,#$\[\]]+$/u);
    const sanitizedName = fontMatch?.[0] || 'invalid';
    if (!name || typeof name !== 'string' || name.trim() === '' || !fontMatch) {
      console.error(
        'ERROR: Invalid font name: %s',
        sanitizedName.replace(/\n|\r/g, ''),
      );
      throw new Error('Invalid font name');
    }

    const rangeMatch = range?.match(/^[\d-]+$/);
    const sanitizedRange = rangeMatch?.[0] || 'invalid';
    if (!/^\d+-\d+$/.test(range)) {
      console.error(
        'ERROR: Invalid range: %s',
        sanitizedRange.replace(/\n|\r/g, ''),
      );
      throw new Error('Invalid range');
    }
    const filename = path.join(
      fontPath,
      sanitizedName,
      `${sanitizedRange}.pbf`,
    );

    if (!fallbacks) {
      fallbacks = clone(allowedFonts || {});
    }
    delete fallbacks[name];

    try {
      const data = await readFile(filename);
      return data;
    } catch (err) {
      console.error(
        'ERROR: Font not found: %s, Error: %s',
        filename.replace(/\n|\r/g, ''),
        String(err),
      );
      if (fallbacks && Object.keys(fallbacks).length) {
        let fallbackName;

        let fontStyle = name.split(' ').pop();
        if (['Regular', 'Bold', 'Italic'].indexOf(fontStyle) < 0) {
          fontStyle = 'Regular';
        }
        fallbackName = `Noto Sans ${fontStyle}`;
        if (!fallbacks[fallbackName]) {
          fallbackName = `Open Sans ${fontStyle}`;
          if (!fallbacks[fallbackName]) {
            fallbackName = Object.keys(fallbacks)[0];
          }
        }
        console.error(
          `ERROR: Trying to use %s as a fallback for: %s`,
          fallbackName,
          sanitizedName,
        );
        delete fallbacks[fallbackName];
        return getFontPbf(null, fontPath, fallbackName, range, fallbacks);
      } else {
        throw new Error('Font load error');
      }
    }
  } else {
    throw new Error('Font not allowed');
  }
}
/**
 * Combines multiple font pbf buffers into one.
 * @param {object} allowedFonts - An object of allowed fonts.
 * @param {string} fontPath - The path to the font directory.
 * @param {string} names - Comma-separated font names.
 * @param {string} range - The range of the font (e.g., '0-255').
 * @param {object} [fallbacks] - Fallback font list.
 * @returns {Promise<Buffer>} - A promise that resolves to the combined font data buffer.
 */
export async function getFontsPbf(
  allowedFonts,
  fontPath,
  names,
  range,
  fallbacks,
) {
  const fonts = names.split(',');
  const queue = [];
  for (const font of fonts) {
    queue.push(
      getFontPbf(
        allowedFonts,
        fontPath,
        font,
        range,
        clone(allowedFonts || fallbacks),
      ),
    );
  }

  const combined = combine(await Promise.all(queue), names);
  return Buffer.from(combined.buffer, 0, combined.buffer.length);
}

/**
 * Lists available fonts in a given font directory.
 * @param {string} fontPath - The path to the font directory.
 * @returns {Promise<object>} - Promise that resolves with an object where keys are the font names.
 */
export async function listFonts(fontPath) {
  const existingFonts = {};

  const files = await fsPromises.readdir(fontPath);
  for (const file of files) {
    const stats = await fsPromises.stat(path.join(fontPath, file));
    if (
      stats.isDirectory() &&
      (await existsP(path.join(fontPath, file, '0-255.pbf')))
    ) {
      existingFonts[path.basename(file)] = true;
    }
  }

  return existingFonts;
}

/**
 * Checks if a string is a valid HTTP or HTTPS URL.
 * @param {string} string - The string to validate.
 * @returns {boolean} True if the string is a valid HTTP/HTTPS URL, false otherwise.
 */
export function isValidHttpUrl(string) {
  let url;

  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }

  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Fetches tile data from either PMTiles or MBTiles source.
 * @param {object} source - The source object, which may contain a mbtiles object, or pmtiles object.
 * @param {string} sourceType - The source type, which should be `pmtiles` or `mbtiles`
 * @param {number} z - The zoom level.
 * @param {number} x - The x coordinate of the tile.
 * @param {number} y - The y coordinate of the tile.
 * @returns {Promise<object | null>} - A promise that resolves to an object with data and headers or null if no data is found.
 */
export async function fetchTileData(source, sourceType, z, x, y) {
  if (sourceType === 'pmtiles') {
    return await new Promise(async (resolve) => {
      const tileinfo = await getPMtilesTile(source, z, x, y);
      if (!tileinfo?.data) return resolve(null);
      resolve({ data: tileinfo.data, headers: tileinfo.header });
    });
  } else if (sourceType === 'mbtiles') {
    return await new Promise((resolve) => {
      source.getTile(z, x, y, (err, tileData, tileHeader) => {
        if (err) {
          return resolve(null);
        }
        resolve({ data: tileData, headers: tileHeader });
      });
    });
  }
}
