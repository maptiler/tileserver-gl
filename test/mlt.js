// MLT (MapLibre Tile) support. The mbtiles and pmtiles fixtures are committed in
// test/fixtures/mlt; test/utils/create_mlt_mbtiles.js regenerates them. No network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';
import sharp from 'sharp';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
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

    it('rejects .mlt against a pbf source', async function () {
      await app.get('/data/openmaptiles/0/0/0.mlt').expect(404);
    });

    it('returns out of bounds for a tile beyond maxzoom', async function () {
      await app.get('/data/test_mlt/9/0/0.mlt').expect(404);
    });
  });

  describe('mvt transcoding', function () {
    it('serves an mlt source as .pbf', async function () {
      const res = await app
        .get('/data/test_mlt/0/0/0.pbf')
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', /application\/x-protobuf/);

      const tile = new VectorTile(new PbfReader(res.body));
      expect(Object.keys(tile.layers).sort()).to.deep.equal([
        'centroids',
        'countries',
        'geolines',
      ]);
      expect(tile.layers.countries.extent).to.equal(4096);
      expect(tile.layers.countries.length).to.be.above(0);
    });

    it('produces the same features as converting straight to geojson', async function () {
      const [pbf, geojson] = await Promise.all([
        app
          .get('/data/test_mlt/1/1/0.pbf')
          .buffer(true)
          .parse(binaryParser)
          .expect(200),
        app.get('/data/test_mlt/1/1/0.geojson').expect(200),
      ]);

      const tile = new VectorTile(new PbfReader(pbf.body));
      const roundTripped = [];
      for (const name of Object.keys(tile.layers)) {
        // eslint-disable-next-line security/detect-object-injection -- name is from Object.keys of the decoded tile
        const layer = tile.layers[name];
        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i).toGeoJSON(1, 0, 1);
          feature.properties.layer = name;
          roundTripped.push(feature);
        }
      }

      // Same order both ways: layers, then features within each layer.
      expect(roundTripped.length).to.equal(geojson.body.features.length);
      /* eslint-disable security/detect-object-injection -- i is a loop counter */
      for (let i = 0; i < roundTripped.length; i++) {
        expect(roundTripped[i].geometry).to.deep.equal(
          geojson.body.features[i].geometry,
        );
        expect(roundTripped[i].properties).to.deep.equal(
          geojson.body.features[i].properties,
        );
      }
      /* eslint-enable security/detect-object-injection */
    });

    it('does not transcode the other way: .mlt from a pbf source', async function () {
      // There is no published JavaScript MLT encoder.
      await app.get('/data/openmaptiles/0/0/0.mlt').expect(404);
    });
  });

  describe('geojson conversion', function () {
    it('converts an mlt tile to a FeatureCollection', async function () {
      const res = await app
        .get('/data/test_mlt/0/0/0.geojson')
        .expect(200)
        .expect('Content-Type', /application\/json/);
      expect(res.body.type).to.equal('FeatureCollection');
      expect(res.body.features.length).to.be.above(0);
      expect(res.body.features[0].properties.layer).to.be.a('string');
    });

    it('projects tile coordinates to the right place on earth', async function () {
      const res = await app.get('/data/test_mlt/0/0/0.geojson').expect(200);
      const aruba = res.body.features.find(
        (f) =>
          f.properties.layer === 'centroids' && f.properties.NAME === 'Aruba',
      );
      expect(aruba, 'Aruba centroid missing').to.not.equal(undefined);
      const [lon, lat] = aruba.geometry.coordinates;
      expect(lon).to.be.closeTo(-69.97, 0.5);
      expect(lat).to.be.closeTo(12.52, 0.5);
    });

    it('honours the tile offset, not just the z0 tile', async function () {
      // z0 has x=y=0, so the offset terms cancel and a bug there stays hidden.
      const res = await app.get('/data/test_mlt/1/1/1.geojson').expect(200);
      const lons = [];
      const walk = (a) =>
        Array.isArray(a[0]) ? a.forEach(walk) : lons.push(a[0]);
      for (const f of res.body.features) walk(f.geometry.coordinates);
      // The south-east tile covers the eastern hemisphere, give or take the buffer.
      expect(Math.min(...lons)).to.be.above(-10);
      expect(Math.max(...lons)).to.be.closeTo(180, 1);
    });

    it('closes every polygon ring', async function () {
      const res = await app.get('/data/test_mlt/0/0/0.geojson').expect(200);
      let rings = 0;
      for (const f of res.body.features) {
        const polygons =
          f.geometry.type === 'Polygon'
            ? [f.geometry.coordinates]
            : f.geometry.type === 'MultiPolygon'
              ? f.geometry.coordinates
              : [];
        for (const polygon of polygons) {
          for (const ring of polygon) {
            rings++;
            expect(ring[0]).to.deep.equal(ring[ring.length - 1]);
          }
        }
      }
      expect(rings).to.be.above(0);
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
