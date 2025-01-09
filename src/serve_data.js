'use strict';

import fsp from 'node:fs/promises';
import path from 'path';

import clone from 'clone';
import express from 'express';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import SphericalMercator from '@mapbox/sphericalmercator';
import { Image, createCanvas } from 'canvas';
import sharp from 'sharp';

import { fixTileJSONCenter, getTileUrls, isValidHttpUrl } from './utils.js';
import {
  getPMtilesInfo,
  getPMtilesTile,
  openPMtiles,
} from './pmtiles_adapter.js';
import { gunzipP, gzipP } from './promises.js';
import { openMbTilesWrapper } from './mbtiles_wrapper.js';

export const serve_data = {
  init: (options, repo) => {
    const app = express().disable('x-powered-by');

    app.get(
      '/:id/:z(\\d+)/:x(\\d+)/:y(\\d+).:format([\\w.]+)',
      async (req, res, next) => {
        const item = repo[req.params.id];
        if (!item) {
          return res.sendStatus(404);
        }
        const tileJSONFormat = item.tileJSON.format;
        const z = req.params.z | 0;
        const x = req.params.x | 0;
        const y = req.params.y | 0;
        let format = req.params.format;
        if (format === options.pbfAlias) {
          format = 'pbf';
        }
        if (
          format !== tileJSONFormat &&
          !(format === 'geojson' && tileJSONFormat === 'pbf')
        ) {
          return res.status(404).send('Invalid format');
        }
        if (
          z < item.tileJSON.minzoom ||
          0 ||
          x < 0 ||
          y < 0 ||
          z > item.tileJSON.maxzoom ||
          x >= Math.pow(2, z) ||
          y >= Math.pow(2, z)
        ) {
          return res.status(404).send('Out of bounds');
        }
        if (item.sourceType === 'pmtiles') {
          let tileinfo = await getPMtilesTile(item.source, z, x, y);
          if (tileinfo == undefined || tileinfo.data == undefined) {
            return res.status(404).send('Not found');
          } else {
            let data = tileinfo.data;
            let headers = tileinfo.header;
            if (tileJSONFormat === 'pbf') {
              if (options.dataDecoratorFunc) {
                data = options.dataDecoratorFunc(id, 'data', data, z, x, y);
              }
            }
            if (format === 'pbf') {
              headers['Content-Type'] = 'application/x-protobuf';
            } else if (format === 'geojson') {
              headers['Content-Type'] = 'application/json';
              const tile = new VectorTile(new Pbf(data));
              const geojson = {
                type: 'FeatureCollection',
                features: [],
              };
              for (const layerName in tile.layers) {
                const layer = tile.layers[layerName];
                for (let i = 0; i < layer.length; i++) {
                  const feature = layer.feature(i);
                  const featureGeoJSON = feature.toGeoJSON(x, y, z);
                  featureGeoJSON.properties.layer = layerName;
                  geojson.features.push(featureGeoJSON);
                }
              }
              data = JSON.stringify(geojson);
            }
            delete headers['ETag']; // do not trust the tile ETag -- regenerate
            headers['Content-Encoding'] = 'gzip';
            res.set(headers);

            data = await gzipP(data);

            return res.status(200).send(data);
          }
        } else if (item.sourceType === 'mbtiles') {
          item.source.getTile(z, x, y, async (err, data, headers) => {
            let isGzipped;
            if (err) {
              if (/does not exist/.test(err.message)) {
                return res.status(204).send();
              } else {
                return res
                  .status(500)
                  .header('Content-Type', 'text/plain')
                  .send(err.message);
              }
            } else {
              if (data == null) {
                return res.status(404).send('Not found');
              } else {
                if (tileJSONFormat === 'pbf') {
                  isGzipped =
                    data.slice(0, 2).indexOf(Buffer.from([0x1f, 0x8b])) === 0;
                  if (options.dataDecoratorFunc) {
                    if (isGzipped) {
                      data = await gunzipP(data);
                      isGzipped = false;
                    }
                    data = options.dataDecoratorFunc(id, 'data', data, z, x, y);
                  }
                }
                if (format === 'pbf') {
                  headers['Content-Type'] = 'application/x-protobuf';
                } else if (format === 'geojson') {
                  headers['Content-Type'] = 'application/json';

                  if (isGzipped) {
                    data = await gunzipP(data);
                    isGzipped = false;
                  }

                  const tile = new VectorTile(new Pbf(data));
                  const geojson = {
                    type: 'FeatureCollection',
                    features: [],
                  };
                  for (const layerName in tile.layers) {
                    const layer = tile.layers[layerName];
                    for (let i = 0; i < layer.length; i++) {
                      const feature = layer.feature(i);
                      const featureGeoJSON = feature.toGeoJSON(x, y, z);
                      featureGeoJSON.properties.layer = layerName;
                      geojson.features.push(featureGeoJSON);
                    }
                  }
                  data = JSON.stringify(geojson);
                }
                delete headers['ETag']; // do not trust the tile ETag -- regenerate
                headers['Content-Encoding'] = 'gzip';
                res.set(headers);

                if (!isGzipped) {
                  data = await gzipP(data);
                }

                return res.status(200).send(data);
              }
            }
          });
        }
      },
    );

    app.get(
      '^/:id/elevation/:z([0-9]+)/:x([-.0-9]+)/:y([-.0-9]+)',
      async (req, res, next) => {
        try {
          const item = repo?.[req.params.id];
          if (!item) return res.sendStatus(404);
          if (!item.source) return res.status(404).send('Missing source');
          if (!item.tileJSON) return res.status(404).send('Missing tileJSON');
          if (!item.sourceType)
            return res.status(404).send('Missing sourceType');

          const { source, tileJSON, sourceType } = item;

          if (sourceType !== 'pmtiles' && sourceType !== 'mbtiles') {
            return res
              .status(400)
              .send('Invalid sourceType. Must be pmtiles or mbtiles.');
          }

          const encoding = tileJSON?.encoding;
          if (encoding == null) {
            return res.status(400).send('Missing tileJSON.encoding');
          } else if (encoding !== 'terrarium' && encoding !== 'mapbox') {
            return res
              .status(400)
              .send('Invalid encoding. Must be terrarium or mapbox.');
          }

          const format = tileJSON?.format;
          if (format == null) {
            return res.status(400).send('Missing tileJSON.format');
          } else if (format !== 'webp' && format !== 'png') {
            return res.status(400).send('Invalid format. Must be webp or png.');
          }

          const z = parseInt(req.params.z, 10);
          const x = parseFloat(req.params.x);
          const y = parseFloat(req.params.y);

          if (tileJSON.minzoom == null || tileJSON.maxzoom == null) {
            return res.status(404).send(JSON.stringify(tileJSON));
          }

          const TILE_SIZE = tileJSON.tileSize || 512;
          let bbox;
          let xy;
          var zoom = z;

          if (Number.isInteger(x) && Number.isInteger(y)) {
            const intX = parseInt(req.params.x, 10);
            const intY = parseInt(req.params.y, 10);

            if (
              zoom < tileJSON.minzoom ||
              zoom > tileJSON.maxzoom ||
              intX < 0 ||
              intY < 0 ||
              intX >= Math.pow(2, zoom) ||
              intY >= Math.pow(2, zoom)
            ) {
              return res.status(404).send('Out of bounds');
            }
            xy = [intX, intY];
            bbox = new SphericalMercator().bbox(intX, intY, zoom);
          } else {
            //no zoom limit with coordinates
            if (zoom < tileJSON.minzoom) {
              zoom = tileJSON.minzoom;
            }
            if (zoom > tileJSON.maxzoom) {
              zoom = tileJSON.maxzoom;
            }

            bbox = [x, y, x + 0.1, y + 0.1];
            const { minX, minY } = new SphericalMercator().xyz(bbox, zoom);
            xy = [minX, minY];
          }

          let data;
          if (sourceType === 'pmtiles') {
            const tileinfo = await getPMtilesTile(source, zoom, xy[0], xy[1]);
            if (!tileinfo?.data) return res.status(204).send();
            data = tileinfo.data;
          } else {
            data = await new Promise((resolve, reject) => {
              source.getTile(zoom, xy[0], xy[1], (err, tileData) => {
                if (err) {
                  return /does not exist/.test(err.message)
                    ? resolve(null)
                    : reject(err);
                }
                resolve(tileData);
              });
            });
          }
          if (data == null) return res.status(204).send();
          if (!data) return res.status(404).send('Not found');

          const image = new Image();
          await new Promise(async (resolve, reject) => {
            image.onload = async () => {
              const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
              const context = canvas.getContext('2d');
              context.drawImage(image, 0, 0);

              const long = bbox[0];
              const lat = bbox[1];

              // calculate pixel coordinate of tile,
              // see https://developers.google.com/maps/documentation/javascript/examples/map-coordinates
              let siny = Math.sin((lat * Math.PI) / 180);
              // Truncating to 0.9999 effectively limits latitude to 89.189. This is
              // about a third of a tile past the edge of the world tile.
              siny = Math.min(Math.max(siny, -0.9999), 0.9999);

              const xWorld = TILE_SIZE * (0.5 + long / 360);
              const yWorld =
                TILE_SIZE *
                (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI));

              const scale = 1 << zoom;

              const xTile = Math.floor((xWorld * scale) / TILE_SIZE);
              const yTile = Math.floor((yWorld * scale) / TILE_SIZE);

              const xPixel = Math.floor(xWorld * scale) - xTile * TILE_SIZE;
              const yPixel = Math.floor(yWorld * scale) - yTile * TILE_SIZE;

              if (
                xPixel < 0 ||
                yPixel < 0 ||
                xPixel >= TILE_SIZE ||
                yPixel >= TILE_SIZE
              ) {
                return reject('Pixel is out of bounds');
              }

              const imgdata = context.getImageData(xPixel, yPixel, 1, 1);
              const red = imgdata.data[0];
              const green = imgdata.data[1];
              const blue = imgdata.data[2];

              let elevation;
              if (encoding === 'mapbox') {
                elevation =
                  -10000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
              } else if (encoding === 'terrarium') {
                elevation = red * 256 + green + blue / 256 - 32768;
              } else {
                elevation = 'invalid encoding';
              }

              resolve(
                res.status(200).send({
                  z: zoom,
                  x: xy[0],
                  y: xy[1],
                  red,
                  green,
                  blue,
                  latitude: lat,
                  longitude: long,
                  elevation,
                }),
              );
            };

            image.onerror = (err) => reject(err);

            if (format === 'webp') {
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
        } catch (err) {
          return res
            .status(500)
            .header('Content-Type', 'text/plain')
            .send(err.message);
        }
      },
    );

    app.get('/:id.json', (req, res, next) => {
      const item = repo[req.params.id];
      if (!item) {
        return res.sendStatus(404);
      }
      const tileSize = undefined;
      const info = clone(item.tileJSON);
      info.tiles = getTileUrls(
        req,
        info.tiles,
        `data/${req.params.id}`,
        tileSize,
        info.format,
        item.publicUrl,
        {
          pbf: options.pbfAlias,
        },
      );
      return res.send(info);
    });

    return app;
  },
  add: async (options, repo, params, id, publicUrl) => {
    let inputFile;
    let inputType;
    if (params.pmtiles) {
      inputType = 'pmtiles';
      if (isValidHttpUrl(params.pmtiles)) {
        inputFile = params.pmtiles;
      } else {
        inputFile = path.resolve(options.paths.pmtiles, params.pmtiles);
      }
    } else if (params.mbtiles) {
      inputType = 'mbtiles';
      if (isValidHttpUrl(params.mbtiles)) {
        console.log(
          `ERROR: MBTiles does not support web based files. "${params.mbtiles}" is not a valid data file.`,
        );
        process.exit(1);
      } else {
        inputFile = path.resolve(options.paths.mbtiles, params.mbtiles);
      }
    }

    let tileJSON = {
      tiles: params.domains || options.domains,
    };

    if (!isValidHttpUrl(inputFile)) {
      const inputFileStats = await fsp.stat(inputFile);
      if (!inputFileStats.isFile() || inputFileStats.size === 0) {
        throw Error(`Not valid input file: "${inputFile}"`);
      }
    }

    let source;
    let sourceType;
    if (inputType === 'pmtiles') {
      source = openPMtiles(inputFile);
      sourceType = 'pmtiles';
      const metadata = await getPMtilesInfo(source);

      tileJSON['encoding'] = params['encoding'];
      tileJSON['tileSize'] = params['tileSize'];
      tileJSON['name'] = id;
      tileJSON['format'] = 'pbf';
      Object.assign(tileJSON, metadata);

      tileJSON['tilejson'] = '2.0.0';
      delete tileJSON['filesize'];
      delete tileJSON['mtime'];
      delete tileJSON['scheme'];

      Object.assign(tileJSON, params.tilejson || {});
      fixTileJSONCenter(tileJSON);

      if (options.dataDecoratorFunc) {
        tileJSON = options.dataDecoratorFunc(id, 'tilejson', tileJSON);
      }
    } else if (inputType === 'mbtiles') {
      sourceType = 'mbtiles';
      const mbw = await openMbTilesWrapper(inputFile);
      const info = await mbw.getInfo();
      source = mbw.getMbTiles();
      tileJSON['encoding'] = params['encoding'];
      tileJSON['tileSize'] = params['tileSize'];
      tileJSON['name'] = id;
      tileJSON['format'] = 'pbf';

      Object.assign(tileJSON, info);

      tileJSON['tilejson'] = '2.0.0';
      delete tileJSON['filesize'];
      delete tileJSON['mtime'];
      delete tileJSON['scheme'];

      Object.assign(tileJSON, params.tilejson || {});
      fixTileJSONCenter(tileJSON);

      if (options.dataDecoratorFunc) {
        tileJSON = options.dataDecoratorFunc(id, 'tilejson', tileJSON);
      }
    }

    repo[id] = {
      tileJSON,
      publicUrl,
      source,
      sourceType,
    };
  },
};
