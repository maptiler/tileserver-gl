'use strict';

import fsp from 'node:fs/promises';
import path from 'path';

import clone from 'clone';
import express from 'express';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { SphericalMercator } from '@mapbox/sphericalmercator';

import {
  fixTileJSONCenter,
  getTileUrls,
  isValidRemoteUrl,
  fetchTileData,
} from './utils.js';
import { getPMtilesInfo, openPMtiles } from './pmtiles_adapter.js';
import { gunzipP, gzipP } from './promises.js';
import { openMbTilesWrapper } from './mbtiles_wrapper.js';

import fs from 'node:fs';
import { fileURLToPath } from 'url';

const packageJson = JSON.parse(
  fs.readFileSync(
    path.dirname(fileURLToPath(import.meta.url)) + '/../package.json',
    'utf8',
  ),
);

const isLight = packageJson.name.slice(-6) === '-light';
const { serve_rendered } = await import(
  `${!isLight ? `./serve_rendered.js` : `./serve_light.js`}`
);

export const serve_data = {
  /**
   * Initializes the serve_data module.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} programOpts - An object containing the program options
   * @returns {express.Application} The initialized Express application.
   */
  init: function (options, repo, programOpts) {
    const { verbose } = programOpts;
    const app = express().disable('x-powered-by');

    /**
     * Handles requests for tile data, responding with the tile image.
     * @param {object} req - Express request object.
     * @param {object} res - Express response object.
     * @param {string} req.params.id - ID of the tile.
     * @param {string} req.params.z - Z coordinate of the tile.
     * @param {string} req.params.x - X coordinate of the tile.
     * @param {string} req.params.y - Y coordinate of the tile.
     * @param {string} req.params.format - Format of the tile.
     * @returns {Promise<void>}
     */
    app.get('/:id/:z/:x/:y.:format', async (req, res) => {
      if (verbose) {
        console.log(
          `Handling tile request for: /data/%s/%s/%s/%s.%s`,
          String(req.params.id).replace(/\n|\r/g, ''),
          String(req.params.z).replace(/\n|\r/g, ''),
          String(req.params.x).replace(/\n|\r/g, ''),
          String(req.params.y).replace(/\n|\r/g, ''),
          String(req.params.format).replace(/\n|\r/g, ''),
        );
      }

      const item = repo[req.params.id];
      if (!item) {
        return res.sendStatus(404);
      }
      const tileJSONFormat = item.tileJSON.format;
      const z = parseInt(req.params.z, 10);
      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);
      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return res.status(404).send('Invalid Tile');
      }

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
        x < 0 ||
        y < 0 ||
        z > item.tileJSON.maxzoom ||
        x >= Math.pow(2, z) ||
        y >= Math.pow(2, z)
      ) {
        return res.status(404).send('Out of bounds');
      }

      const fetchTile = await fetchTileData(
        item.source,
        item.sourceType,
        z,
        x,
        y,
      );
      if (fetchTile == null && item.tileJSON.sparse) {
        return res.status(410).send();
      } else if (fetchTile == null) {
        return res.status(204).send();
      }

      let data = fetchTile.data;
      let headers = fetchTile.headers;
      let isGzipped = data.slice(0, 2).indexOf(Buffer.from([0x1f, 0x8b])) === 0;

      if (isGzipped) {
        data = await gunzipP(data);
      }

      if (tileJSONFormat === 'pbf') {
        if (options.dataDecoratorFunc) {
          data = options.dataDecoratorFunc(
            req.params.id,
            'data',
            data,
            z,
            x,
            y,
          );
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
          // eslint-disable-next-line security/detect-object-injection -- layerName from VectorTile library internal data structure
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
      if (headers) {
        delete headers['ETag'];
      }
      headers['Content-Encoding'] = 'gzip';
      res.set(headers);

      data = await gzipP(data);

      return res.status(200).send(data);
    });

    /**
     * Handles requests for elevation data.
     * @param {object} req - Express request object.
     * @param {object} res - Express response object.
     * @param {string} req.params.id - ID of the elevation data.
     * @param {string} req.params.z - Z coordinate of the tile.
     * @param {string} req.params.x - X coordinate of the tile (either integer or float).
     * @param {string} req.params.y - Y coordinate of the tile (either integer or float).
     * @returns {Promise<void>}
     */
    app.get('/:id/elevation/:z/:x/:y', async (req, res, next) => {
      try {
        if (verbose) {
          console.log(
            `Handling elevation request for: /data/%s/elevation/%s/%s/%s`,
            String(req.params.id).replace(/\n|\r/g, ''),
            String(req.params.z).replace(/\n|\r/g, ''),
            String(req.params.x).replace(/\n|\r/g, ''),
            String(req.params.y).replace(/\n|\r/g, ''),
          );
        }

        const item = repo?.[req.params.id];
        if (!item) return res.sendStatus(404);
        if (!item.source) return res.status(404).send('Missing source');
        if (!item.tileJSON) return res.status(404).send('Missing tileJSON');
        if (!item.sourceType) return res.status(404).send('Missing sourceType');
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

        const fetchTile = await fetchTileData(
          source,
          sourceType,
          zoom,
          xy[0],
          xy[1],
        );
        if (fetchTile == null) return res.status(204).send();

        let data = fetchTile.data;
        var param = {
          long: bbox[0].toFixed(7),
          lat: bbox[1].toFixed(7),
          encoding,
          format,
          tile_size: TILE_SIZE,
          z: zoom,
          x: xy[0],
          y: xy[1],
        };

        res
          .status(200)
          .send(await serve_rendered.getTerrainElevation(data, param));
      } catch (err) {
        return res
          .status(500)
          .header('Content-Type', 'text/plain')
          .send(err.message);
      }
    });

    /**
     * Handles requests for tilejson for the data tiles.
     * @param {object} req - Express request object.
     * @param {object} res - Express response object.
     * @param {string} req.params.id - ID of the data source.
     * @returns {Promise<void>}
     */
    app.get('/:id.json', (req, res) => {
      if (verbose) {
        console.log(
          `Handling tilejson request for: /data/%s.json`,
          String(req.params.id).replace(/\n|\r/g, ''),
        );
      }

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
  /**
   * Adds a new data source to the repository.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} params Parameters object.
   * @param {string} id ID of the data source.
   * @param {object} programOpts - An object containing the program options
   * @param {string} programOpts.publicUrl Public URL for the data.
   * @param {boolean} programOpts.verbose Whether verbose logging should be used.
   * @returns {Promise<void>}
   */
  add: async function (options, repo, params, id, programOpts) {
    const { publicUrl, verbose } = programOpts;
    let inputFile;
    let inputType;
    if (params.pmtiles) {
      inputType = 'pmtiles';
      // PMTiles supports HTTP, HTTPS, and S3 URLs
      if (isValidRemoteUrl(params.pmtiles)) {
        inputFile = params.pmtiles;
      } else {
        inputFile = path.resolve(options.paths.pmtiles, params.pmtiles);
      }
    } else if (params.mbtiles) {
      inputType = 'mbtiles';
      // MBTiles does not support remote URLs
      if (isValidRemoteUrl(params.mbtiles)) {
        console.log(
          `ERROR: MBTiles does not support remote files. "${params.mbtiles}" is not a valid data file.`,
        );
        process.exit(1);
      } else {
        inputFile = path.resolve(options.paths.mbtiles, params.mbtiles);
      }
    }

    if (verbose && verbose >= 1) {
      console.log(`[INFO] Loading data source '${id}' from: ${inputFile}`);
    }

    let tileJSON = {
      tiles: params.domains || options.domains,
    };

    // Only check file stats for local files, not remote URLs
    if (!isValidRemoteUrl(inputFile)) {
      const inputFileStats = await fsp.stat(inputFile);
      if (!inputFileStats.isFile() || inputFileStats.size === 0) {
        throw Error(`Not valid input file: "${inputFile}"`);
      }
    }

    let source;
    let sourceType;
    tileJSON['name'] = id;
    tileJSON['format'] = 'pbf';
    tileJSON['encoding'] = params['encoding'];
    tileJSON['tileSize'] = params['tileSize'];
    tileJSON['sparse'] = params['sparse'];

    if (inputType === 'pmtiles') {
      source = openPMtiles(
        inputFile,
        params.s3Profile,
        params.requestPayer,
        params.s3Region,
        params.s3UrlFormat,
        verbose,
      );
      sourceType = 'pmtiles';
      const metadata = await getPMtilesInfo(source, inputFile);
      Object.assign(tileJSON, metadata);
    } else if (inputType === 'mbtiles') {
      sourceType = 'mbtiles';
      const mbw = await openMbTilesWrapper(inputFile);
      const info = await mbw.getInfo();
      source = mbw.getMbTiles();
      Object.assign(tileJSON, info);
    }

    delete tileJSON['filesize'];
    delete tileJSON['mtime'];
    delete tileJSON['scheme'];
    tileJSON['tilejson'] = '3.0.0';

    Object.assign(tileJSON, params.tilejson || {});
    fixTileJSONCenter(tileJSON);

    if (options.dataDecoratorFunc) {
      tileJSON = options.dataDecoratorFunc(id, 'tilejson', tileJSON);
    }

    // eslint-disable-next-line security/detect-object-injection -- id is from config file data source names
    repo[id] = {
      tileJSON,
      publicUrl,
      source,
      sourceType,
    };
  },
};
