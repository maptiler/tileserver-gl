/**
 * Creates a simple terrain mbtiles file for testing the elevation API.
 * Uses mapbox encoding: elevation = -10000 + (R * 256 * 256 + G * 256 + B) * 0.1
 */

import sqlite3 from 'sqlite3';
import { createCanvas } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function elevationToMapboxRGB(elevation) {
  // elevation = -10000 + (R * 65536 + G * 256 + B) * 0.1
  // (R * 65536 + G * 256 + B) = (elevation + 10000) / 0.1
  const value = Math.round((elevation + 10000) / 0.1);
  const r = Math.floor(value / 65536);
  const g = Math.floor((value % 65536) / 256);
  const b = value % 256;
  return { r, g, b };
}

function createTerrainTile(tileSize, elevation) {
  const canvas = createCanvas(tileSize, tileSize);
  const ctx = canvas.getContext('2d');
  const { r, g, b } = elevationToMapboxRGB(elevation);

  // Fill with solid color representing the elevation
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, tileSize, tileSize);

  return canvas.toBuffer('image/png');
}

function runDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function createTerrainMbtiles(outputPath) {
  const db = new sqlite3.Database(outputPath);

  // Create mbtiles schema
  await runDb(
    db,
    `
    CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)
  `,
  );
  await runDb(
    db,
    `
    CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)
  `,
  );
  await runDb(
    db,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row)
  `,
  );

  // Insert metadata
  const metadata = [
    ['name', 'test-terrain'],
    ['format', 'png'],
    ['encoding', 'mapbox'],
    ['minzoom', '0'],
    ['maxzoom', '1'],
    ['bounds', '-180,-85.051129,180,85.051129'],
    ['center', '0,0,0'],
    ['type', 'baselayer'],
    ['description', 'Test terrain tiles for elevation API testing'],
  ];

  for (const [name, value] of metadata) {
    await runDb(db, 'INSERT INTO metadata (name, value) VALUES (?, ?)', [
      name,
      value,
    ]);
  }

  const tileSize = 512;

  // Zoom 0: single tile covering the world at elevation 100m
  const tile0 = createTerrainTile(tileSize, 100);
  await runDb(
    db,
    'INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
    [0, 0, 0, tile0],
  );

  // Zoom 1: 4 tiles with different elevations
  const elevations = [
    [0, 0, 200], // top-left
    [1, 0, 500], // top-right
    [0, 1, 1000], // bottom-left
    [1, 1, 2500], // bottom-right
  ];

  for (const [x, y, elevation] of elevations) {
    const tile = createTerrainTile(tileSize, elevation);
    // MBTiles uses TMS scheme where y is flipped
    const tmsY = (1 << 1) - 1 - y;
    await runDb(
      db,
      'INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
      [1, x, tmsY, tile],
    );
  }

  db.close();
  console.log(`Created terrain mbtiles at: ${outputPath}`);
}

// Get output path from command line or use default
const outputPath =
  process.argv[2] || path.join(__dirname, '../../test_data/terrain.mbtiles');
createTerrainMbtiles(outputPath);
