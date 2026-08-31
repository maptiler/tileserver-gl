/**
 * Regenerates test/fixtures/mlt/test-mlt.mbtiles from the MapLibre demo tiles.
 *
 * The fixture is committed rather than built during the test run, because no
 * JavaScript MLT encoder is published -- the tiles have to come from somewhere
 * that already speaks MLT. Run this only to refresh the fixture; it needs
 * network access.
 *
 *   node test/utils/create_mlt_mbtiles.js [output.mbtiles]
 *
 * Regenerate the pmtiles fixture from the result with:
 *   pmtiles-mbtiles-util test/fixtures/mlt/test-mlt.mbtiles test/fixtures/mlt/test-mlt.pmtiles
 */

import fs from 'node:fs';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_OUTPUT = path.join(__dirname, '../fixtures/mlt/test-mlt.mbtiles');
const REMOTE = 'https://demotiles.maplibre.org/tiles-mlt/plain';
const MAXZOOM = 1;

/**
 * Runs a SQL statement on a sqlite3 database, returning a promise.
 * @param {object} db - The sqlite3 database instance.
 * @param {string} sql - The SQL statement to execute.
 * @param {Array} params - Parameters to bind to the SQL statement.
 * @returns {Promise<object>} A promise that resolves with the statement context.
 */
function runDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Enumerates every tile coordinate up to MAXZOOM.
 * @returns {Array<{z: number, x: number, y: number}>} The tile coordinates.
 */
function tileCoords() {
  const coords = [];
  for (let z = 0; z <= MAXZOOM; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        coords.push({ z, x, y });
      }
    }
  }
  return coords;
}

/**
 * Downloads the MLT tiles from demotiles.
 * @returns {Promise<Array<{z: number, x: number, y: number, data: Buffer}>>} The tiles.
 */
async function fetchTiles() {
  const tiles = [];
  for (const { z, x, y } of tileCoords()) {
    const res = await fetch(`${REMOTE}/${z}/${x}/${y}.mlt`);
    if (!res.ok) {
      throw new Error(`${z}/${x}/${y}: HTTP ${res.status}`);
    }
    tiles.push({ z, x, y, data: Buffer.from(await res.arrayBuffer()) });
  }
  return tiles;
}

/**
 * Creates an MLT mbtiles file from the committed fixture tiles.
 * @param {string} outputPath - The file path where the MBTiles database should be created.
 * @returns {Promise<void>} A promise that resolves when the MBTiles file has been created.
 */
async function createMltMbtiles(outputPath) {
  const tiles = await fetchTiles();

  fs.rmSync(outputPath, { force: true });
  const db = new sqlite3.Database(outputPath);

  await runDb(
    db,
    `CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)`,
  );
  await runDb(
    db,
    `CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)`,
  );
  await runDb(
    db,
    `CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row)`,
  );

  const metadata = [
    ['name', 'test-mlt'],
    ['format', 'mlt'],
    ['minzoom', '0'],
    ['maxzoom', String(MAXZOOM)],
    ['bounds', '-180,-85.051129,180,85.051129'],
    ['center', '0,0,0'],
    ['type', 'baselayer'],
    [
      'description',
      'MapLibre demo tiles in MLT encoding, for MLT support testing',
    ],
    [
      'json',
      JSON.stringify({
        vector_layers: [
          { id: 'countries', fields: { ABBREV: 'String', NAME: 'String' } },
          { id: 'geolines', fields: { name: 'String' } },
          { id: 'centroids', fields: { ABBREV: 'String', NAME: 'String' } },
        ],
      }),
    ],
  ];

  for (const [name, value] of metadata) {
    await runDb(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', [
      name,
      value,
    ]);
  }

  for (const { z, x, y, data } of tiles) {
    // MBTiles uses TMS scheme where y is flipped
    const tmsY = (1 << z) - 1 - y;
    await runDb(
      db,
      'INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
      [z, x, tmsY, data],
    );
  }

  db.close();
  console.log(`Created MLT mbtiles at: ${outputPath} (${tiles.length} tiles)`);
}

await createMltMbtiles(process.argv[2] || DEFAULT_OUTPUT);
