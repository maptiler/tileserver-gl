import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import MBTiles from '@mapbox/mbtiles';
import sharp from 'sharp';
import { server } from '../src/server.js';
import { serve_data } from '../src/serve_data.js';
import { parseOptionalBoolean, resolveSparse } from '../src/utils.js';

const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'];

// A vector tile inside the declared zoom range that the Zurich extract does not
// contain. The same hole is used by test/tiles_data.js.
const MISSING_VECTOR_TILE = '14/0/0.pbf';
// Every z1 tile of the raster fixture below is a hole.
const MISSING_RASTER_TILE = '1/0/0.png';

const RASTER_FIXTURE = 'sparse-raster-fixture.mbtiles';
// Same archive, but its own metadata asks not to be sparse.
const META_FIXTURE = 'sparse-metadata-fixture.mbtiles';

/**
 * Writes a raster mbtiles containing only its z0 tile, leaving every z1 tile
 * missing while still inside the archive's declared zoom range.
 * @param {string} file - Path of the mbtiles file to create.
 * @param {object} [extraMetadata] - Extra keys to merge into the archive metadata.
 * @returns {Promise<void>}
 */
async function createRasterMbtilesWithHole(file, extraMetadata = {}) {
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
    ...extraMetadata,
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
  let metaFixturePath;

  before(async function () {
    // The global setup hook has already chdir'd into test_data.
    fixturePath = path.join(process.cwd(), RASTER_FIXTURE);
    metaFixturePath = path.join(process.cwd(), META_FIXTURE);
    fs.rmSync(fixturePath, { force: true });
    fs.rmSync(metaFixturePath, { force: true });
    await createRasterMbtilesWithHole(fixturePath);
    // mbtiles metadata is a table of strings, so this round-trips as "false"
    // and exercises the coercion on the way back out.
    await createRasterMbtilesWithHole(metaFixturePath, { sparse: false });
  });

  after(function () {
    fs.rmSync(fixturePath, { force: true });
    fs.rmSync(metaFixturePath, { force: true });
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
  describe('sparse from archive metadata', function () {
    let running;
    let globalRunning;

    before(async function () {
      running = await startServer(
        configFor({
          'meta-dense': { mbtiles: META_FIXTURE },
          'meta-overridden': { mbtiles: META_FIXTURE, sparse: true },
        }),
      );
      globalRunning = await startServer(
        configFor({ 'meta-vs-global': { mbtiles: META_FIXTURE } }, true),
      );
    });

    after(async function () {
      await running.stop();
      await globalRunning.stop();
    });

    // A raster archive that declares sparse=false in its own metadata.
    expectMissingTile(
      () => running.app,
      'meta-dense',
      MISSING_RASTER_TILE,
      204,
    );
    // Per-source config outranks the archive.
    expectMissingTile(
      () => running.app,
      'meta-overridden',
      MISSING_RASTER_TILE,
      404,
    );
    // So does the global option.
    expectMissingTile(
      () => globalRunning.app,
      'meta-vs-global',
      MISSING_RASTER_TILE,
      404,
    );

    it('reports the resolved value in the TileJSON, not the raw metadata', function (done) {
      supertest(running.app)
        .get('/data/meta-dense.json')
        .expect(200)
        .expect((res) => {
          expect(res.body.sparse).to.equal(false);
        })
        .end(done);
    });
  });
});

describe('resolveSparse precedence', function () {
  // perSource, globalOption, metadata, isVector, expected
  const cases = [
    // Nothing set: the format decides.
    [undefined, undefined, undefined, true, false],
    [undefined, undefined, undefined, false, true],
    // The global option overrides the format default, both ways.
    [undefined, true, undefined, true, true],
    [undefined, false, undefined, false, false],
    // A per-source value overrides the format default, both ways.
    [true, undefined, undefined, true, true],
    [false, undefined, undefined, false, false],
    // A per-source value also overrides the global, both ways. These break if
    // the chain ever uses `||` instead of `??`.
    [true, false, undefined, true, true],
    [false, true, undefined, false, false],
    // Archive metadata overrides the format default, both ways.
    [undefined, undefined, true, true, true],
    [undefined, undefined, false, false, false],
    // ...but loses to a per-source value, both ways.
    [true, undefined, false, true, true],
    [false, undefined, true, false, false],
    // ...and loses to the global option, both ways.
    [undefined, true, false, true, true],
    [undefined, false, true, false, false],
    // Per-source still wins when all three disagree.
    [true, false, false, true, true],
    [false, true, true, false, false],
    // Agreement between levels changes nothing.
    [true, true, true, true, true],
    [false, false, false, false, false],
  ];

  for (const [perSource, globalOption, metadata, isVector, expected] of cases) {
    const label =
      `source=${perSource} global=${globalOption} meta=${metadata} ` +
      `${isVector ? 'vector' : 'raster'} -> ${expected}`;
    it(label, function () {
      expect(
        resolveSparse({ perSource, globalOption, metadata, isVector }),
      ).to.equal(expected);
    });
  }
});

describe('parseOptionalBoolean', function () {
  // mbtiles metadata is a table of strings, so `sparse` arrives as text. Taken
  // at face value "false" is truthy, which would invert the setting.
  const cases = [
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
    ['TRUE', true],
    ['False', false],
    ['  true  ', true],
    ['1', true],
    ['0', false],
    // Anything unrecognised is absent, so it falls through to the next level
    // of precedence rather than being guessed at.
    [undefined, undefined],
    [null, undefined],
    ['', undefined],
    ['yes', undefined],
    ['maybe', undefined],
    [1, undefined],
    [0, undefined],
    [{}, undefined],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, function () {
      expect(parseOptionalBoolean(input)).to.equal(expected);
    });
  }
});
