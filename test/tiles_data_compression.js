import { createHook } from 'node:async_hooks';
import { once } from 'node:events';
import http from 'node:http';
import { gzipSync, gunzipSync } from 'node:zlib';
import { expect } from 'chai';
import { PbfWriter } from 'pbf';
import { serve_data } from '../src/serve_data.js';

/**
 * Creates an MVT with one point at the center of the tile.
 * @param {number} id Feature ID.
 * @returns {Buffer} Encoded vector tile.
 */
function createTile(id) {
  const feature = new PbfWriter();
  feature.writeVarintField(1, id);
  feature.writeVarintField(3, 1);
  // MoveTo one point at (2048, 2048), zigzag-encoded for a 4096-unit tile.
  feature.writePackedVarint(4, [9, 4096, 4096]);
  const layer = new PbfWriter();
  layer.writeStringField(1, 'test');
  layer.writeBytesField(2, feature.finish());
  layer.writeVarintField(5, 4096);
  layer.writeVarintField(15, 2);
  const tile = new PbfWriter();
  tile.writeBytesField(3, layer.finish());
  return Buffer.from(tile.finish());
}

const tile = createTile(1);
const gzippedTile = gzipSync(tile, { level: 0 });

/**
 * Requests a tile without decompressing the HTTP response.
 * @param {Buffer} data Bytes returned by the MBTiles source.
 * @param {object} [options] Tile server options.
 * @param {string} [format] Requested output format.
 * @returns {Promise<object>} Raw response body and headers.
 */

async function requestTile(data, options = {}, format = 'pbf') {
  const repo = {
    test: {
      sourceType: 'mbtiles',
      source: { getTile: (_z, _x, _y, callback) => callback(null, data, {}) },
      tileJSON: { format: 'pbf', minzoom: 0, maxzoom: 0 },
    },
  };

  const app = serve_data.init(options, repo, {});
  // Use a free loopback port to inspect the raw gzip response bytes.
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    return await new Promise((resolve, reject) => {
      const request = http.get(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: `/test/0/0/0.${format}`,
          agent: false,
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      request.on('error', reject);
    });
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

describe('Vector tile compression', function () {
  it('returns an existing gzip buffer without decompressing or recompressing it', async function () {
    let zlibOperations = 0;
    const hook = createHook({
      init(_asyncId, type) {
        if (type === 'ZLIB') zlibOperations += 1;
      },
    });
    hook.enable();
    let response;
    try {
      response = await requestTile(gzippedTile);
    } finally {
      hook.disable();
    }

    expect(response.status).to.equal(200);
    expect(response.headers['content-type']).to.equal('application/x-protobuf');
    expect(response.headers['content-encoding']).to.equal('gzip');
    expect(zlibOperations).to.equal(0);
    expect(response.body).to.deep.equal(gzippedTile);
  });

  it('still decompresses, decorates and recompresses gzip tiles', async function () {
    const decoratedTile = createTile(2);
    const response = await requestTile(gzippedTile, {
      dataDecoratorFunc: async (id, type, data) => {
        expect([id, type]).to.deep.equal(['test', 'data']);
        expect(data).to.deep.equal(tile);
        return decoratedTile;
      },
    });

    expect(response.status).to.equal(200);
    expect(response.headers['content-encoding']).to.equal('gzip');
    expect(gunzipSync(response.body)).to.deep.equal(decoratedTile);
  });

  it('still compresses uncompressed PBF tiles', async function () {
    const response = await requestTile(tile);

    expect(response.status).to.equal(200);
    expect(response.headers['content-encoding']).to.equal('gzip');
    expect(gunzipSync(response.body)).to.deep.equal(tile);
  });

  it('still converts gzip PBF tiles to GeoJSON', async function () {
    const response = await requestTile(gzippedTile, {}, 'geojson');

    expect(response.status).to.equal(200);
    expect(response.headers['content-type']).to.match(/^application\/json/);
    expect(response.headers['content-encoding']).to.equal('gzip');

    const geojson = JSON.parse(gunzipSync(response.body).toString());

    expect(geojson.type).to.equal('FeatureCollection');
    expect(geojson.features).to.have.lengthOf(1);
    expect(geojson.features[0].id).to.equal(1);
  });
});
