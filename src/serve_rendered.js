'use strict';

import advancedPool from 'advanced-pool';
import fs from 'fs';
import path from 'path';
import url from 'url';
import util from 'util';
import zlib from 'zlib';
import sharp from 'sharp'; // sharp has to be required before node-canvas. see https://github.com/lovell/sharp/issues/371
import pkg from 'canvas';
import clone from 'clone';
import Color from 'color';
import express from 'express';
import SphericalMercator from '@mapbox/sphericalmercator';
import mlgl from '@acalcutt/maplibre-gl-native';
import MBTiles from '@mapbox/mbtiles';
import proj4 from 'proj4';
import request from 'request';
import {getFontsPbf, getTileUrls, fixTileJSONCenter} from './utils.js';

const FLOAT_PATTERN = '[+-]?(?:\\d+|\\d+\.?\\d+)';
const httpTester = /^(http(s)?:)?\/\//;

const {createCanvas} = pkg;
const mercator = new SphericalMercator();
const getScale = (scale) => (scale || '@1x').slice(1, 2) | 0;

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
 */
function createEmptyResponse(format, color, callback) {
  if (!format || format === 'pbf') {
    callback(null, {data: cachedEmptyResponses['']});
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
    callback(null, {data: data});
    return;
  }

  // create an "empty" response image
  color = new Color(color);
  const array = color.array();
  const channels = array.length === 4 && format !== 'jpeg' ? 4 : 3;
  sharp(Buffer.from(array), {
    raw: {
      width: 1,
      height: 1,
      channels: channels,
    },
  }).toFormat(format).toBuffer((err, buffer, info) => {
    if (!err) {
      cachedEmptyResponses[cacheKey] = buffer;
    }
    callback(null, {data: buffer});
  });
}

const extractPathFromQuery = (query, transformer) => {
  const pathParts = (query.path || '').split('|');
  const path = [];
  for (const pair of pathParts) {
    const pairParts = pair.split(',');
    if (pairParts.length === 2) {
      let pair;
      if (query.latlng === '1' || query.latlng === 'true') {
        pair = [+(pairParts[1]), +(pairParts[0])];
      } else {
        pair = [+(pairParts[0]), +(pairParts[1])];
      }
      if (transformer) {
        pair = transformer(pair);
      }
      path.push(pair);
    }
  }
  return path;
};

const renderOverlay = (z, x, y, bearing, pitch, w, h, scale,
    path, query) => {
  if (!path || path.length < 2) {
    return null;
  }
  const precisePx = (ll, zoom) => {
    const px = mercator.px(ll, 20);
    const scale = Math.pow(2, zoom - 20);
    return [px[0] * scale, px[1] * scale];
  };

  const center = precisePx([x, y], z);

  const mapHeight = 512 * (1 << z);
  const maxEdge = center[1] + h / 2;
  const minEdge = center[1] - h / 2;
  if (maxEdge > mapHeight) {
    center[1] -= (maxEdge - mapHeight);
  } else if (minEdge < 0) {
    center[1] -= minEdge;
  }

  const canvas = createCanvas(scale * w, scale * h);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  if (bearing) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-bearing / 180 * Math.PI);
    ctx.translate(-center[0], -center[1]);
  } else {
    // optimized path
    ctx.translate(-center[0] + w / 2, -center[1] + h / 2);
  }
  const lineWidth = query.width !== undefined ?
    parseFloat(query.width) : 1;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = query.stroke || 'rgba(0,64,255,0.7)';
  ctx.fillStyle = query.fill || 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  for (const pair of path) {
    const px = precisePx(pair, z);
    ctx.lineTo(px[0], px[1]);
  }
  if (path[0][0] === path[path.length - 1][0] &&
    path[0][1] === path[path.length - 1][1]) {
    ctx.closePath();
  }
  ctx.fill();
  if (lineWidth > 0) {
    ctx.stroke();
  }

  return canvas.toBuffer();
};

const calcZForBBox = (bbox, w, h, query) => {
  let z = 25;

  const padding = query.padding !== undefined ?
    parseFloat(query.padding) : 0.1;

  const minCorner = mercator.px([bbox[0], bbox[3]], z);
  const maxCorner = mercator.px([bbox[2], bbox[1]], z);
  const w_ = w / (1 + 2 * padding);
  const h_ = h / (1 + 2 * padding);

  z -= Math.max(
      Math.log((maxCorner[0] - minCorner[0]) / w_),
      Math.log((maxCorner[1] - minCorner[1]) / h_),
  ) / Math.LN2;

  z = Math.max(Math.log(Math.max(w, h) / 256) / Math.LN2, Math.min(25, z));

  return z;
};

const existingFonts = {};
let maxScaleFactor = 2;

export const serve_rendered = {
  init: (options, repo) => {
    const fontListingPromise = new Promise((resolve, reject) => {
      fs.readdir(options.paths.fonts, (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        for (const file of files) {
          fs.stat(path.join(options.paths.fonts, file), (err, stats) => {
            if (err) {
              reject(err);
              return;
            }
            if (stats.isDirectory()) {
              existingFonts[path.basename(file)] = true;
            }
          });
        }
        resolve();
      });
    });

    maxScaleFactor = Math.min(Math.floor(options.maxScaleFactor || 3), 9);
    let scalePattern = '';
    for (let i = 2; i <= maxScaleFactor; i++) {
      scalePattern += i.toFixed();
    }
    scalePattern = `@[${scalePattern}]x`;

    const app = express().disable('x-powered-by');

    const respondImage = (item, z, lon, lat, bearing, pitch,
        width, height, scale, format, res, next,
        opt_overlay) => {
      if (Math.abs(lon) > 180 || Math.abs(lat) > 85.06 ||
        lon !== lon || lat !== lat) {
        return res.status(400).send('Invalid center');
      }
      if (Math.min(width, height) <= 0 ||
        Math.max(width, height) * scale > (options.maxSize || 2048) ||
        width !== width || height !== height) {
        return res.status(400).send('Invalid size');
      }
      if (format === 'png' || format === 'webp') {
      } else if (format === 'jpg' || format === 'jpeg') {
        format = 'jpeg';
      } else {
        return res.status(400).send('Invalid format');
      }

      const pool = item.map.renderers[scale];
      pool.acquire((err, renderer) => {
        const mlglZ = Math.max(0, z - 1);
        const params = {
          zoom: mlglZ,
          center: [lon, lat],
          bearing: bearing,
          pitch: pitch,
          width: width,
          height: height,
        };
        if (z === 0) {
          params.width *= 2;
          params.height *= 2;
        }

        const tileMargin = Math.max(options.tileMargin || 0, 0);
        if (z > 2 && tileMargin > 0) {
          params.width += tileMargin * 2;
          params.height += tileMargin * 2;
        }

        renderer.render(params, (err, data) => {
          pool.release(renderer);
          if (err) {
            console.error(err);
            return res.status(500).send(err);
          }

          // Fix semi-transparent outlines on raw, premultiplied input
          // https://github.com/maptiler/tileserver-gl/issues/350#issuecomment-477857040
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            const norm = alpha / 255;
            if (alpha === 0) {
              data[i] = 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
            } else {
              data[i] = data[i] / norm;
              data[i + 1] = data[i + 1] / norm;
              data[i + 2] = data[i + 2] / norm;
            }
          }

          const image = sharp(data, {
            raw: {
              width: params.width * scale,
              height: params.height * scale,
              channels: 4,
            },
          });

          if (z > 2 && tileMargin > 0) {
            const [_, y] = mercator.px(params.center, z);
            let yoffset = Math.max(Math.min(0, y - 128 - tileMargin), y + 128 + tileMargin - Math.pow(2, z + 8));
            image.extract({
              left: tileMargin * scale,
              top: (tileMargin + yoffset) * scale,
              width: width * scale,
              height: height * scale,
            });
          }

          if (z === 0) {
            // HACK: when serving zoom 0, resize the 0 tile from 512 to 256
            image.resize(width * scale, height * scale);
          }

          if (opt_overlay) {
            image.composite([{input: opt_overlay}]);
          }
          if (item.watermark) {
            const canvas = createCanvas(scale * width, scale * height);
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.font = '10px sans-serif';
            ctx.strokeWidth = '1px';
            ctx.strokeStyle = 'rgba(255,255,255,.4)';
            ctx.strokeText(item.watermark, 5, height - 5);
            ctx.fillStyle = 'rgba(0,0,0,.4)';
            ctx.fillText(item.watermark, 5, height - 5);

            image.composite([{input: canvas.toBuffer()}]);
          }

          const formatQuality = (options.formatQuality || {})[format];

          if (format === 'png') {
            image.png({adaptiveFiltering: false});
          } else if (format === 'jpeg') {
            image.jpeg({quality: formatQuality || 80});
          } else if (format === 'webp') {
            image.webp({quality: formatQuality || 90});
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
    };

    app.get(`/:id/:z(\\d+)/:x(\\d+)/:y(\\d+):scale(${scalePattern})?.:format([\\w]+)`, (req, res, next) => {
      const item = repo[req.params.id];
      if (!item) {
        return res.sendStatus(404);
      }

      const modifiedSince = req.get('if-modified-since'); const cc = req.get('cache-control');
      if (modifiedSince && (!cc || cc.indexOf('no-cache') === -1)) {
        if (new Date(item.lastModified) <= new Date(modifiedSince)) {
          return res.sendStatus(304);
        }
      }

      const z = req.params.z | 0;
      const x = req.params.x | 0;
      const y = req.params.y | 0;
      const scale = getScale(req.params.scale);
      const format = req.params.format;
      if (z < 0 || x < 0 || y < 0 ||
        z > 22 || x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
        return res.status(404).send('Out of bounds');
      }
      const tileSize = 256;
      const tileCenter = mercator.ll([
        ((x + 0.5) / (1 << z)) * (256 << z),
        ((y + 0.5) / (1 << z)) * (256 << z),
      ], z);
      return respondImage(item, z, tileCenter[0], tileCenter[1], 0, 0,
          tileSize, tileSize, scale, format, res, next);
    });

    if (options.serveStaticMaps !== false) {
      const staticPattern =
        `/:id/static/:raw(raw)?/%s/:width(\\d+)x:height(\\d+):scale(${scalePattern})?.:format([\\w]+)`;

      const centerPattern =
        util.format(':x(%s),:y(%s),:z(%s)(@:bearing(%s)(,:pitch(%s))?)?',
            FLOAT_PATTERN, FLOAT_PATTERN, FLOAT_PATTERN,
            FLOAT_PATTERN, FLOAT_PATTERN);

      app.get(util.format(staticPattern, centerPattern), (req, res, next) => {
        const item = repo[req.params.id];
        if (!item) {
          return res.sendStatus(404);
        }
        const raw = req.params.raw;
        const z = +req.params.z;
        let x = +req.params.x;
        let y = +req.params.y;
        const bearing = +(req.params.bearing || '0');
        const pitch = +(req.params.pitch || '0');
        const w = req.params.width | 0;
        const h = req.params.height | 0;
        const scale = getScale(req.params.scale);
        const format = req.params.format;

        if (z < 0) {
          return res.status(404).send('Invalid zoom');
        }

        const transformer = raw ?
          mercator.inverse.bind(mercator) : item.dataProjWGStoInternalWGS;

        if (transformer) {
          const ll = transformer([x, y]);
          x = ll[0];
          y = ll[1];
        }

        const path = extractPathFromQuery(req.query, transformer);
        const overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale,
            path, req.query);

        return respondImage(item, z, x, y, bearing, pitch, w, h, scale, format,
            res, next, overlay);
      });

      const serveBounds = (req, res, next) => {
        const item = repo[req.params.id];
        if (!item) {
          return res.sendStatus(404);
        }
        const raw = req.params.raw;
        const bbox = [+req.params.minx, +req.params.miny,
          +req.params.maxx, +req.params.maxy];
        let center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];

        const transformer = raw ?
          mercator.inverse.bind(mercator) : item.dataProjWGStoInternalWGS;

        if (transformer) {
          const minCorner = transformer(bbox.slice(0, 2));
          const maxCorner = transformer(bbox.slice(2));
          bbox[0] = minCorner[0];
          bbox[1] = minCorner[1];
          bbox[2] = maxCorner[0];
          bbox[3] = maxCorner[1];
          center = transformer(center);
        }

        const w = req.params.width | 0;
        const h = req.params.height | 0;
        const scale = getScale(req.params.scale);
        const format = req.params.format;

        const z = calcZForBBox(bbox, w, h, req.query);
        const x = center[0];
        const y = center[1];
        const bearing = 0;
        const pitch = 0;

        const path = extractPathFromQuery(req.query, transformer);
        const overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale,
            path, req.query);
        return respondImage(item, z, x, y, bearing, pitch, w, h, scale, format,
            res, next, overlay);
      };

      const boundsPattern =
        util.format(':minx(%s),:miny(%s),:maxx(%s),:maxy(%s)',
            FLOAT_PATTERN, FLOAT_PATTERN, FLOAT_PATTERN, FLOAT_PATTERN);

      app.get(util.format(staticPattern, boundsPattern), serveBounds);

      app.get('/:id/static/', (req, res, next) => {
        for (const key in req.query) {
          req.query[key.toLowerCase()] = req.query[key];
        }
        req.params.raw = true;
        req.params.format = (req.query.format || 'image/png').split('/').pop();
        const bbox = (req.query.bbox || '').split(',');
        req.params.minx = bbox[0];
        req.params.miny = bbox[1];
        req.params.maxx = bbox[2];
        req.params.maxy = bbox[3];
        req.params.width = req.query.width || '256';
        req.params.height = req.query.height || '256';
        if (req.query.scale) {
          req.params.width /= req.query.scale;
          req.params.height /= req.query.scale;
          req.params.scale = `@${req.query.scale}`;
        }

        return serveBounds(req, res, next);
      });

      const autoPattern = 'auto';

      app.get(util.format(staticPattern, autoPattern), (req, res, next) => {
        const item = repo[req.params.id];
        if (!item) {
          return res.sendStatus(404);
        }
        const raw = req.params.raw;
        const w = req.params.width | 0;
        const h = req.params.height | 0;
        const bearing = 0;
        const pitch = 0;
        const scale = getScale(req.params.scale);
        const format = req.params.format;

        const transformer = raw ?
          mercator.inverse.bind(mercator) : item.dataProjWGStoInternalWGS;

        const path = extractPathFromQuery(req.query, transformer);
        if (path.length < 2) {
          return res.status(400).send('Invalid path');
        }

        const bbox = [Infinity, Infinity, -Infinity, -Infinity];
        for (const pair of path) {
          bbox[0] = Math.min(bbox[0], pair[0]);
          bbox[1] = Math.min(bbox[1], pair[1]);
          bbox[2] = Math.max(bbox[2], pair[0]);
          bbox[3] = Math.max(bbox[3], pair[1]);
        }

        const bbox_ = mercator.convert(bbox, '900913');
        const center = mercator.inverse(
            [(bbox_[0] + bbox_[2]) / 2, (bbox_[1] + bbox_[3]) / 2],
        );

        const z = calcZForBBox(bbox, w, h, req.query);
        const x = center[0];
        const y = center[1];

        const overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale,
            path, req.query);

        return respondImage(item, z, x, y, bearing, pitch, w, h, scale, format,
            res, next, overlay);
      });
    }

    app.get('/:id.json', (req, res, next) => {
      const item = repo[req.params.id];
      if (!item) {
        return res.sendStatus(404);
      }
      const info = clone(item.tileJSON);
      info.tiles = getTileUrls(req, info.tiles,
          `styles/${req.params.id}`, info.format, item.publicUrl);
      return res.send(info);
    });

    return Promise.all([fontListingPromise]).then(() => app);
  },
  add: (options, repo, params, id, publicUrl, dataResolver) => {
    const map = {
      renderers: [],
      sources: {},
    };

    let styleJSON;
    const createPool = (ratio, min, max) => {
      const createRenderer = (ratio, createCallback) => {
        const renderer = new mlgl.Map({
          mode: 'tile',
          ratio: ratio,
          request: (req, callback) => {
            const protocol = req.url.split(':')[0];
            // console.log('Handling request:', req);
            if (protocol === 'sprites') {
              const dir = options.paths[protocol];
              const file = unescape(req.url).substring(protocol.length + 3);
              fs.readFile(path.join(dir, file), (err, data) => {
                callback(err, {data: data});
              });
            } else if (protocol === 'fonts') {
              const parts = req.url.split('/');
              const fontstack = unescape(parts[2]);
              const range = parts[3].split('.')[0];
              getFontsPbf(
                  null, options.paths[protocol], fontstack, range, existingFonts,
              ).then((concated) => {
                callback(null, {data: concated});
              }, (err) => {
                callback(err, {data: null});
              });
            } else if (protocol === 'mbtiles') {
              const parts = req.url.split('/');
              const sourceId = parts[2];
              const source = map.sources[sourceId];
              const sourceInfo = styleJSON.sources[sourceId];
              const z = parts[3] | 0;
              const x = parts[4] | 0;
              const y = parts[5].split('.')[0] | 0;
              const format = parts[5].split('.')[1];
              source.getTile(z, x, y, (err, data, headers) => {
                if (err) {
                  if (options.verbose) console.log('MBTiles error, serving empty', err);
                  createEmptyResponse(sourceInfo.format, sourceInfo.color, callback);
                  return;
                }

                const response = {};
                if (headers['Last-Modified']) {
                  response.modified = new Date(headers['Last-Modified']);
                }

                if (format === 'pbf') {
                  try {
                    response.data = zlib.unzipSync(data);
                  } catch (err) {
                    console.log('Skipping incorrect header for tile mbtiles://%s/%s/%s/%s.pbf', id, z, x, y);
                  }
                  if (options.dataDecoratorFunc) {
                    response.data = options.dataDecoratorFunc(
                        sourceId, 'data', response.data, z, x, y);
                  }
                } else {
                  response.data = data;
                }

                callback(null, response);
              });
            } else if (protocol === 'http' || protocol === 'https') {
              request({
                url: req.url,
                encoding: null,
                gzip: true,
              }, (err, res, body) => {
                const parts = url.parse(req.url);
                const extension = path.extname(parts.pathname).toLowerCase();
                const format = extensionToFormat[extension] || '';
                if (err || res.statusCode < 200 || res.statusCode >= 300) {
                  // console.log('HTTP error', err || res.statusCode);
                  createEmptyResponse(format, '', callback);
                  return;
                }

                const response = {};
                if (res.headers.modified) {
                  response.modified = new Date(res.headers.modified);
                }
                if (res.headers.expires) {
                  response.expires = new Date(res.headers.expires);
                }
                if (res.headers.etag) {
                  response.etag = res.headers.etag;
                }

                response.data = body;
                callback(null, response);
              });
            }
          },
        });
        renderer.load(styleJSON);
        createCallback(null, renderer);
      };
      return new advancedPool.Pool({
        min: min,
        max: max,
        create: createRenderer.bind(null, ratio),
        destroy: (renderer) => {
          renderer.release();
        },
      });
    };

    const styleFile = params.style;
    const styleJSONPath = path.resolve(options.paths.styles, styleFile);
    try {
      styleJSON = JSON.parse(fs.readFileSync(styleJSONPath));
    } catch (e) {
      console.log('Error parsing style file');
      return false;
    }

    if (styleJSON.sprite && !httpTester.test(styleJSON.sprite)) {
      styleJSON.sprite = 'sprites://' +
        styleJSON.sprite
            .replace('{style}', path.basename(styleFile, '.json'))
            .replace('{styleJsonFolder}', path.relative(options.paths.sprites, path.dirname(styleJSONPath)));
    }
    if (styleJSON.glyphs && !httpTester.test(styleJSON.glyphs)) {
      styleJSON.glyphs = `fonts://${styleJSON.glyphs}`;
    }

    for (const layer of (styleJSON.layers || [])) {
      if (layer && layer.paint) {
        // Remove (flatten) 3D buildings
        if (layer.paint['fill-extrusion-height']) {
          layer.paint['fill-extrusion-height'] = 0;
        }
        if (layer.paint['fill-extrusion-base']) {
          layer.paint['fill-extrusion-base'] = 0;
        }
      }
    }

    const tileJSON = {
      'tilejson': '2.0.0',
      'name': styleJSON.name,
      'id': id,
      'attribution': '',
      'minzoom': 0,
      'maxzoom': 20,
      'bounds': [-180, -85.0511, 180, 85.0511],
      'format': 'png',
      'type': 'baselayer',
    };
    const attributionOverride = params.tilejson && params.tilejson.attribution;
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
    };
    repo[id] = repoobj;

    const queue = [];
    for (const name of Object.keys(styleJSON.sources)) {
      let source = styleJSON.sources[name];
      const url = source.url;

      if (url && url.lastIndexOf('mbtiles:', 0) === 0) {
        // found mbtiles source, replace with info from local file
        delete source.url;

        let mbtilesFile = url.substring('mbtiles://'.length);
        const fromData = mbtilesFile[0] === '{' &&
          mbtilesFile[mbtilesFile.length - 1] === '}';

        if (fromData) {
          mbtilesFile = mbtilesFile.substr(1, mbtilesFile.length - 2);
          const mapsTo = (params.mapping || {})[mbtilesFile];
          if (mapsTo) {
            mbtilesFile = mapsTo;
          }
          mbtilesFile = dataResolver(mbtilesFile);
          if (!mbtilesFile) {
            console.error(`ERROR: data "${mbtilesFile}" not found!`);
            process.exit(1);
          }
        }

        queue.push(new Promise((resolve, reject) => {
          mbtilesFile = path.resolve(options.paths.mbtiles, mbtilesFile);
          const mbtilesFileStats = fs.statSync(mbtilesFile);
          if (!mbtilesFileStats.isFile() || mbtilesFileStats.size === 0) {
            throw Error(`Not valid MBTiles file: ${mbtilesFile}`);
          }
          map.sources[name] = new MBTiles(mbtilesFile + '?mode=ro', err => {
            map.sources[name].getInfo((err, info) => {
              if (err) {
                console.error(err);
                return;
              }

              if (!repoobj.dataProjWGStoInternalWGS && info.proj4) {
                // how to do this for multiple sources with different proj4 defs?
                const to3857 = proj4('EPSG:3857');
                const toDataProj = proj4(info.proj4);
                repoobj.dataProjWGStoInternalWGS = (xy) => to3857.inverse(toDataProj.forward(xy));
              }

              const type = source.type;
              Object.assign(source, info);
              source.type = type;
              source.tiles = [
                // meta url which will be detected when requested
                `mbtiles://${name}/{z}/{x}/{y}.${info.format || 'pbf'}`,
              ];
              delete source.scheme;

              if (options.dataDecoratorFunc) {
                source = options.dataDecoratorFunc(name, 'tilejson', source);
              }

              if (!attributionOverride &&
                source.attribution && source.attribution.length > 0) {
                if (!tileJSON.attribution.includes(source.attribution)) {
                  if (tileJSON.attribution.length > 0) {
                    tileJSON.attribution += ' | ';
                  }
                  tileJSON.attribution += source.attribution;
                }
              }
              resolve();
            });
          });
        }));
      }
    }

    const renderersReadyPromise = Promise.all(queue).then(() => {
      // standard and @2x tiles are much more usual -> default to larger pools
      const minPoolSizes = options.minRendererPoolSizes || [8, 4, 2];
      const maxPoolSizes = options.maxRendererPoolSizes || [16, 8, 4];
      for (let s = 1; s <= maxScaleFactor; s++) {
        const i = Math.min(minPoolSizes.length - 1, s - 1);
        const j = Math.min(maxPoolSizes.length - 1, s - 1);
        const minPoolSize = minPoolSizes[i];
        const maxPoolSize = Math.max(minPoolSize, maxPoolSizes[j]);
        map.renderers[s] = createPool(s, minPoolSize, maxPoolSize);
      }
    });

    return Promise.all([renderersReadyPromise]);
  },
  remove: (repo, id) => {
    const item = repo[id];
    if (item) {
      item.map.renderers.forEach((pool) => {
        pool.close();
      });
    }
    delete repo[id];
  },
};
