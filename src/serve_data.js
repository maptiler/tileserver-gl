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
  lonLatToTilePixel,
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
    app.use(express.json());

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
      if (verbose >= 1) {
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
      if (fetchTile == null) {
        // sparse=true (default) -> 404 (allows overzoom)
        // sparse=false -> 204 (empty tile, no overzoom)
        return res.status(item.sparse ? 404 : 204).send();
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
     * Validates elevation data source and returns source info or sends error response.
     * @param {string} id - ID of the data source.
     * @param {object} res - Express response object.
     * @returns {object|null} Source info object or null if validation failed.
     */
    const validateElevationSource = (id, res) => {
      // eslint-disable-next-line security/detect-object-injection -- id is route parameter for data source lookup
      const item = repo?.[id];
      if (!item) {
        res.sendStatus(404);
        return null;
      }
      if (!item.source) {
        res.status(404).send('Missing source');
        return null;
      }
      if (!item.tileJSON) {
        res.status(404).send('Missing tileJSON');
        return null;
      }
      if (!item.sourceType) {
        res.status(404).send('Missing sourceType');
        return null;
      }
      const { source, tileJSON, sourceType } = item;
      if (sourceType !== 'pmtiles' && sourceType !== 'mbtiles') {
        res.status(400).send('Invalid sourceType. Must be pmtiles or mbtiles.');
        return null;
      }
      const encoding = tileJSON?.encoding;
      if (encoding == null) {
        res.status(400).send('Missing tileJSON.encoding');
        return null;
      }
      if (encoding !== 'terrarium' && encoding !== 'mapbox') {
        res.status(400).send('Invalid encoding. Must be terrarium or mapbox.');
        return null;
      }
      const format = tileJSON?.format;
      if (format == null) {
        res.status(400).send('Missing tileJSON.format');
        return null;
      }
      if (format !== 'webp' && format !== 'png') {
        res.status(400).send('Invalid format. Must be webp or png.');
        return null;
      }
      if (tileJSON.minzoom == null || tileJSON.maxzoom == null) {
        res.status(400).send('Missing tileJSON zoom bounds');
        return null;
      }
      return {
        source,
        sourceType,
        encoding,
        format,
        tileSize: tileJSON.tileSize || 512,
        minzoom: tileJSON.minzoom,
        maxzoom: tileJSON.maxzoom,
      };
    };

    /**
     * Validates that a point has valid lon, lat, and z properties.
     * @param {object} point - Point to validate.
     * @param {number} index - Index of the point in the array.
     * @returns {string|null} Error message if invalid, null if valid.
     */
    const validatePoint = (point, index) => {
      if (point == null || typeof point !== 'object') {
        return `Invalid point at index ${index}: point must be an object`;
      }
      if (typeof point.lon !== 'number' || !isFinite(point.lon)) {
        return `Invalid point at index ${index}: lon must be a finite number`;
      }
      if (typeof point.lat !== 'number' || !isFinite(point.lat)) {
        return `Invalid point at index ${index}: lat must be a finite number`;
      }
      if (typeof point.z !== 'number' || !isFinite(point.z)) {
        return `Invalid point at index ${index}: z must be a finite number`;
      }
      return null;
    };

    /**
     * Gets batch elevations for an array of points.
     * @param {object} sourceInfo - Validated source info from validateElevationSource.
     * @param {Array<{lon: number, lat: number, z: number}>} points - Array of validated points.
     * @returns {Promise<Array<number|null>>} Array of elevations in same order as input.
     */
    const getBatchElevations = async (sourceInfo, points) => {
      const {
        source,
        sourceType,
        encoding,
        format,
        tileSize,
        minzoom,
        maxzoom,
      } = sourceInfo;

      // Group points by tile (including zoom level in the key)
      const tileGroups = new Map();
      for (let i = 0; i < points.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- i is loop counter
        const point = points[i];
        let zoom = point.z;
        if (zoom < minzoom) {
          zoom = minzoom;
        }
        if (zoom > maxzoom) {
          zoom = maxzoom;
        }
        const { tileX, tileY, pixelX, pixelY } = lonLatToTilePixel(
          point.lon,
          point.lat,
          zoom,
          tileSize,
        );
        const tileKey = `${zoom},${tileX},${tileY}`;
        if (!tileGroups.has(tileKey)) {
          tileGroups.set(tileKey, { zoom, tileX, tileY, pixels: [] });
        }
        tileGroups.get(tileKey).pixels.push({ pixelX, pixelY, index: i });
      }

      // Initialize results array with nulls
      const results = new Array(points.length).fill(null);

      // Process each tile and extract elevations
      for (const [, tileData] of tileGroups) {
        const { zoom, tileX, tileY, pixels } = tileData;
        const fetchTile = await fetchTileData(
          source,
          sourceType,
          zoom,
          tileX,
          tileY,
        );
        if (fetchTile == null) {
          continue;
        }

        const elevations = await serve_rendered.getBatchElevationsFromTile(
          fetchTile.data,
          { encoding, format, tile_size: tileSize },
          pixels,
        );
        for (const { index, elevation } of elevations) {
          // eslint-disable-next-line security/detect-object-injection -- index is from internal elevation processing
          results[index] = elevation;
        }
      }

      return results;
    };

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
        if (verbose >= 1) {
          console.log(
            `Handling elevation request for: /data/%s/elevation/%s/%s/%s`,
            String(req.params.id).replace(/\n|\r/g, ''),
            String(req.params.z).replace(/\n|\r/g, ''),
            String(req.params.x).replace(/\n|\r/g, ''),
            String(req.params.y).replace(/\n|\r/g, ''),
          );
        }

        const sourceInfo = validateElevationSource(req.params.id, res);
        if (!sourceInfo) return;

        const z = parseInt(req.params.z, 10);
        const x = parseFloat(req.params.x);
        const y = parseFloat(req.params.y);

        let lon, lat;
        let zoom = z;

        if (Number.isInteger(x) && Number.isInteger(y)) {
          // Tile coordinates mode - strict bounds checking
          const intX = parseInt(req.params.x, 10);
          const intY = parseInt(req.params.y, 10);
          if (
            zoom < sourceInfo.minzoom ||
            zoom > sourceInfo.maxzoom ||
            intX < 0 ||
            intY < 0 ||
            intX >= Math.pow(2, zoom) ||
            intY >= Math.pow(2, zoom)
          ) {
            return res.status(404).send('Out of bounds');
          }
          const bbox = new SphericalMercator().bbox(intX, intY, zoom);
          lon = (bbox[0] + bbox[2]) / 2;
          lat = (bbox[1] + bbox[3]) / 2;
        } else {
          // Coordinate mode
          lon = x;
          lat = y;
        }

        const results = await getBatchElevations(sourceInfo, [
          { lon, lat, z: zoom },
        ]);

        if (results[0] == null) {
          return res.status(204).send();
        }

        // Build response matching original format
        const clampedZoom = Math.min(
          Math.max(zoom, sourceInfo.minzoom),
          sourceInfo.maxzoom,
        );
        const { tileX, tileY, pixelX, pixelY } = lonLatToTilePixel(
          lon,
          lat,
          clampedZoom,
          sourceInfo.tileSize,
        );

        res.status(200).json({
          long: lon,
          lat: lat,
          elevation: results[0],
          z: clampedZoom,
          x: tileX,
          y: tileY,
          pixelX,
          pixelY,
        });
      } catch (err) {
        return res
          .status(500)
          .header('Content-Type', 'text/plain')
          .send(err.message);
      }
    });

    /**
     * Handles batch elevation requests.
     * Accepts a POST request with JSON body containing:
     * - points: Array of {lon, lat, z} coordinates with zoom level
     * Returns an array of elevations (or null for points with no data) in the same order as input.
     * @param {object} req - Express request object.
     * @param {object} res - Express response object.
     * @param {string} req.params.id - ID of the data source.
     * @returns {Promise<void>}
     */
    app.post('/:id/elevation', async (req, res, next) => {
      try {
        const sourceInfo = validateElevationSource(req.params.id, res);
        if (!sourceInfo) return;

        const { points } = req.body;
        if (!Array.isArray(points) || points.length === 0) {
          return res.status(400).send('Missing or empty points array');
        }

        for (let i = 0; i < points.length; i++) {
          // eslint-disable-next-line security/detect-object-injection -- i is loop counter
          const error = validatePoint(points[i], i);
          if (error) {
            return res.status(400).send(error);
          }
        }

        const results = await getBatchElevations(sourceInfo, points);
        res.status(200).json(results);
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
      if (verbose >= 1) {
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
   * @param {number} programOpts.verbose Verbosity level (1-3). 1=important, 2=detailed, 3=debug/all requests.
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

    if (verbose >= 1) {
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

    // Determine sparse: per-source overrides global, then format-based default
    // sparse=true -> 404 (allows overzoom)
    // sparse=false -> 204 (empty tile, no overzoom)
    // Default: vector tiles (pbf) -> false, raster tiles -> true
    const isVector = tileJSON.format === 'pbf';
    const sparse = params.sparse ?? options.sparse ?? !isVector;

    // eslint-disable-next-line security/detect-object-injection -- id is from config file data source names
    repo[id] = {
      tileJSON,
      publicUrl,
      source,
      sourceType,
      sparse,
    };
  },
};
