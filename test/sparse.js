import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import MBTiles from '@mapbox/mbtiles';
import sharp from 'sharp';
import { server } from '../src/server.js';
import { serve_data } from '../src/serve_data.js';
import { resolveSparse } from '../src/utils.js';

const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'];

// A vector tile inside the declared zoom range that the Zurich extract does not
// contain. The same hole is used by test/tiles_data.js.
const MISSING_VECTOR_TILE = '14/0/0.pbf';
// Every z1 tile of the raster fixture below is a hole.
const MISSING_RASTER_TILE = '1/0/0.png';

const RASTER_FIXTURE = 'sparse-raster-fixture.mbtiles';

/**
 * Writes a raster mbtiles containing only its z0 tile, leaving every z1 tile
 * missing while still inside the archive's declared zoom range.
 * @param {string} file - Path of the mbtiles file to create.
 * @returns {Promise<void>}
 */
async function createRasterMbtilesWithHole(file) {
  const tile = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const mbtiles = await util.promisify((uri, cb) => new MBTiles(uri, cb))(
    `${file}?mode=rwc`,
  );
  const startWriting = util.promisify(mbtiles.startWriting.bind(mbtiles));
  const putInfo = util.promisify(mbtiles.putInfo.bind(mbtiles));
  const putTile = util.promisify(mbtiles.putTile.bind(mbtiles));
  const stopWriting = util.promisify(mbtiles.stopWriting.bind(mbtiles));
  const close = util.promisify(mbtiles.close.bind(mbtiles));

  await startWriting();
  await putInfo({
    name: 'sparse-raster-fixture',
    format: 'png',
    bounds: [-180, -85.0511, 180, 85.0511],
    center: [0, 0, 0],
    minzoom: 0,
    maxzoom: 1,
  });
  await putTile(0, 0, 0, tile);
  await stopWriting();
  await close();
}

/**
 * Boots a server from an in-memory config on an ephemeral port.
 * @param {object} config - The tileserver config object.
 * @returns {Promise<{app: object, stop: () => Promise<void>}>} The running app
 *   and a function that shuts it down and releases its data sources.
 */
async function startServer(config) {
  const before = SIGNALS.map((eventName) => ({
    eventName,
    count: process.listeners(eventName).length,
  }));

  const running = await server({ config, port: 0, publicUrl: '/test/' });
  await running.startupPromise;

  return {
    app: running.app,
    async stop() {
      await running.cleanup();
      // Closes the mbtiles handles; without this the fixture file stays
      // locked on Windows and cannot be removed.
      await serve_data.clear(running.serving.data);
      if (running.server.listening) {
        await new Promise((resolve) => running.server.close(resolve));
      }
      // server() registers a signal handler per generation; drop ours so
      // repeated boots do not pile up listeners on the test process.
      for (const { eventName, count } of before) {
        for (const listener of process.listeners(eventName).slice(count)) {
          process.removeListener(eventName, listener);
        }
      }
    },
  };
}

/**
 * Builds a config serving the given data sources out of the test_data dir.
 * @param {object} data - The `data` section of the config.
 * @param {boolean} [globalSparse] - Value for the top-level `sparse` option.
 * @returns {object} A tileserver config object.
 */
function configFor(data, globalSparse) {
  const options = { paths: { fonts: 'fonts', styles: 'styles' } };
  if (globalSparse !== undefined) {
    options.sparse = globalSparse;
  }
  return { options, data };
}

describe('Sparse tile responses', function () {
  let fixturePath;

  before(async function () {
    // The global setup hook has already chdir'd into test_data.
    fixturePath = path.join(process.cwd(), RASTER_FIXTURE);
    fs.rmSync(fixturePath, { force: true });
    await createRasterMbtilesWithHole(fixturePath);
  });

  after(function () {
    fs.rmSync(fixturePath, { force: true });
  });

  /**
   * Asserts the status a missing tile returns from a given source.
   * @param {() => object} getApp - Returns the express app under test.
   * @param {string} source - Data source id.
   * @param {string} tile - Tile path suffix, e.g. '14/0/0.pbf'.
   * @param {number} status - Expected HTTP status.
   * @returns {void}
   */
  const expectMissingTile = (getApp, source, tile, status) => {
    const url = `/data/${source}/${tile}`;
    it(`${url} returns ${status}`, function (done) {
      supertest(getApp()).get(url).expect(status).end(done);
    });
  };

  describe('format-based default, with per-source overrides', function () {
    let running;

    before(async function () {
      running = await startServer(
        configFor({
          'vector-default': { mbtiles: 'zurich_switzerland.mbtiles' },
          'vector-sparse': {
            mbtiles: 'zurich_switzerland.mbtiles',
            sparse: true,
          },
          'raster-default': { mbtiles: RASTER_FIXTURE },
          'raster-dense': { mbtiles: RASTER_FIXTURE, sparse: false },
        }),
      );
    });

    after(async function () {
      await running.stop();
    });

    it('serves a tile the raster fixture does contain', function (done) {
      supertest(running.app)
        .get('/data/raster-default/0/0/0.png')
        .expect(200)
        .expect('Content-Type', /image\/png/)
        .end(done);
    });

    // Vector defaults to non-sparse: 204, so MapLibre does not overzoom.
    expectMissingTile(
      () => running.app,
      'vector-default',
      MISSING_VECTOR_TILE,
      204,
    );
    // Raster defaults to sparse: 404, so MapLibre overzooms from the parent.
    expectMissingTile(
      () => running.app,
      'raster-default',
      MISSING_RASTER_TILE,
      404,
    );
    // A per-source setting overrides the format default in both directions.
    expectMissingTile(
      () => running.app,
      'vector-sparse',
      MISSING_VECTOR_TILE,
      404,
    );
    expectMissingTile(
      () => running.app,
      'raster-dense',
      MISSING_RASTER_TILE,
      204,
    );
  });

  describe('global sparse: true', function () {
    let running;

    before(async function () {
      running = await startServer(
        configFor(
          {
            'vector-global': { mbtiles: 'zurich_switzerland.mbtiles' },
            'vector-override': {
              mbtiles: 'zurich_switzerland.mbtiles',
              sparse: false,
            },
          },
          true,
        ),
      );
    });

    after(async function () {
      await running.stop();
    });

    // The global option overrides the format default...
    expectMissingTile(
      () => running.app,
      'vector-global',
      MISSING_VECTOR_TILE,
      404,
    );
    // ...and a per-source `false` still overrides the global.
    expectMissingTile(
      () => running.app,
      'vector-override',
      MISSING_VECTOR_TILE,
      204,
    );
  });

  describe('global sparse: false', function () {
    let running;

    before(async function () {
      running = await startServer(
        configFor(
          {
            'raster-global': { mbtiles: RASTER_FIXTURE },
            'raster-override': { mbtiles: RASTER_FIXTURE, sparse: true },
          },
          false,
        ),
      );
    });

    after(async function () {
      await running.stop();
    });

    // A global `false` turns off sparse behaviour for raster too...
    expectMissingTile(
      () => running.app,
      'raster-global',
      MISSING_RASTER_TILE,
      204,
    );
    // ...and a per-source `true` still overrides the global.
    expectMissingTile(
      () => running.app,
      'raster-override',
      MISSING_RASTER_TILE,
      404,
    );
  });
});

describe('resolveSparse precedence', function () {
  // source, global, isVector, expected
  const cases = [
    // Neither level set: the format decides.
    [undefined, undefined, true, false],
    [undefined, undefined, false, true],
    // The global option overrides the format default, both ways.
    [undefined, true, true, true],
    [undefined, true, false, true],
    [undefined, false, true, false],
    [undefined, false, false, false],
    // A per-source value overrides the format default, both ways.
    [true, undefined, true, true],
    [true, undefined, false, true],
    [false, undefined, true, false],
    [false, undefined, false, false],
    // A per-source value also overrides the global, both ways. These are the
    // cases that break if the chain ever uses `||` instead of `??`.
    [true, false, true, true],
    [true, false, false, true],
    [false, true, true, false],
    [false, true, false, false],
    // Agreement between the levels changes nothing.
    [true, true, true, true],
    [true, true, false, true],
    [false, false, true, false],
    [false, false, false, false],
  ];

  for (const [source, global, isVector, expected] of cases) {
    const label =
      `source=${source} global=${global} ` +
      `${isVector ? 'vector' : 'raster'} -> ${expected}`;
    it(label, function () {
      expect(resolveSparse(source, global, isVector)).to.equal(expected);
    });
  }
});
