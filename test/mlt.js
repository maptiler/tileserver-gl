// MLT (MapLibre Tile) support. The mbtiles and pmtiles fixtures are committed in
// test/fixtures/mlt; test/utils/create_mlt_mbtiles.js regenerates them. No network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';
import sharp from 'sharp';
import supertest from 'supertest';
import { server } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureMbtiles = path.join(__dirname, 'fixtures/mlt/test-mlt.mbtiles');
const testDataDir = path.join(__dirname, '../test_data');
const MLT_CONTENT_TYPE = 'application/vnd.maplibre-vector-tile';

/**
 * Collects a response body as a Buffer. superagent has no parser for the MLT
 * content type, so without this res.body would be empty.
 * @param {object} res - The superagent response stream.
 * @param {(err: Error|null, body: Buffer) => void} callback - Called with the body.
 * @returns {void}
 */
function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/**
 * Rewrites an mbtiles' declared format, to mimic another generator's spelling.
 * @param {string} file - Path to the mbtiles file.
 * @param {string} format - The format value to store in the metadata table.
 * @returns {Promise<void>} A promise that resolves once the metadata is updated.
 */
function setMbtilesFormat(file, format) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file);
    db.run(
      'UPDATE metadata SET value = ? WHERE name = ?',
      [format, 'format'],
      (err) => (err ? reject(err) : db.close(() => resolve())),
    );
  });
}

describe('MLT tiles', function () {
  let running;
  let app;

  before(async function () {
    this.timeout(20000);
    fs.copyFileSync(fixtureMbtiles, path.join(testDataDir, 'test-mlt.mbtiles'));

    // Planetiler writes the media type where the Rust `mlt` CLI writes 'mlt';
    // both must be recognised as MLT. Copied so the fixture is not modified.
    const planetiler = path.join(testDataDir, 'test-mlt-planetiler.mbtiles');
    fs.copyFileSync(fixtureMbtiles, planetiler);
    await setMbtilesFormat(planetiler, MLT_CONTENT_TYPE);

    running = await server({
      configPath: path.join(__dirname, 'fixtures/mlt-config.json'),
      port: 0,
      publicUrl: '/test/',
    });
    await running.startupPromise;
    app = supertest(running.app);
  });

  after(async function () {
    if (running) {
      await running.cleanup();
      if (running.server.listening) {
        await new Promise((resolve) => running.server.close(resolve));
      }
    }
  });

  describe('tilejson', function () {
    it('reports the mlt format, encoding and tile url', async function () {
      const res = await app.get('/data/test_mlt.json').expect(200);
      expect(res.body.format).to.equal('mlt');
      expect(res.body.encoding).to.equal('mlt');
      expect(res.body.tiles[0]).to.match(
        /\/data\/test_mlt\/\{z\}\/\{x\}\/\{y\}\.mlt$/,
      );
    });

    it('normalizes the media type used by Planetiler to mlt', async function () {
      const res = await app.get('/data/test_mlt_planetiler.json').expect(200);
      expect(res.body.format).to.equal('mlt');
      expect(res.body.encoding).to.equal('mlt');
    });

    it('reads the mlt format from a pmtiles tile type', async function () {
      const res = await app.get('/data/test_mlt_pmtiles.json').expect(200);
      expect(res.body.format).to.equal('mlt');
      expect(res.body.encoding).to.equal('mlt');
    });
  });

  describe('tiles', function () {
    it('serves .mlt with the MLT content type', async function () {
      const res = await app
        .get('/data/test_mlt/0/0/0.mlt')
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', MLT_CONTENT_TYPE);
      expect(res.body.length).to.be.above(0);
    });

    it('serves .mlt from every zoom 1 tile', async function () {
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        await app.get(`/data/test_mlt/1/${x}/${y}.mlt`).expect(200);
      }
    });

    it('serves .mlt from a source declaring the Planetiler media type', async function () {
      await app
        .get('/data/test_mlt_planetiler/0/0/0.mlt')
        .expect(200)
        .expect('Content-Type', MLT_CONTENT_TYPE);
    });

    it('serves .mlt from a pmtiles archive', async function () {
      const res = await app
        .get('/data/test_mlt_pmtiles/1/1/0.mlt')
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', MLT_CONTENT_TYPE);
      expect(res.body.length).to.be.above(0);
    });

    it('rejects .pbf against an mlt source', async function () {
      await app.get('/data/test_mlt/0/0/0.pbf').expect(404);
    });

    it('rejects .mlt against a pbf source', async function () {
      await app.get('/data/openmaptiles/0/0/0.mlt').expect(404);
    });

    it('returns out of bounds for a tile beyond maxzoom', async function () {
      await app.get('/data/test_mlt/9/0/0.mlt').expect(404);
    });
  });

  describe('geojson conversion', function () {
    it('is refused for mlt sources, with a reason', async function () {
      const res = await app.get('/data/test_mlt/0/0/0.geojson').expect(400);
      expect(res.text).to.match(/not supported for MLT/i);
    });

    it('still works for pbf sources', async function () {
      await app
        .get('/data/openmaptiles/0/0/0.geojson')
        .expect(200)
        .expect('Content-Type', /application\/json/);
    });
  });

  describe('rendering', function () {
    it('renders a style over an mlt source', async function () {
      this.timeout(10000);
      const res = await app
        .get('/styles/mlt-demo/512/0/0/0.png')
        .expect(200)
        .expect('Content-Type', /image\/png/);

      // A failed MLT decode still returns a valid PNG -- just the flat background.
      // Varying channels prove geometry from the tile actually made it onto the map.
      const stats = await sharp(res.body).stats();
      const varies = stats.channels.some((c) => c.min !== c.max);
      expect(
        varies,
        'rendered tile is a flat background, MLT geometry was not drawn',
      ).to.equal(true);
    });
  });
});
