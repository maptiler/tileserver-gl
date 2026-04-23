process.env.NODE_ENV = 'test';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import supertest from 'supertest';
import { server } from '../src/server.js';

global.expect = expect;
global.supertest = supertest;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

before(async function () {
  console.log('global setup');
  process.chdir('test_data');

  // Copy raster-dem regression-test fixtures into the test_data directory and
  // extend the config with the extra data source and style.  The fixtures live
  // in test/fixtures/ inside the repository so they travel with the source tree
  // while the downloaded test_data zip provides the base map data.
  const fixturesDir = path.join(__dirname, 'fixtures');

  fs.copyFileSync(
    path.join(fixturesDir, 'ocean_dem.mbtiles'),
    'ocean_dem.mbtiles',
  );

  fs.mkdirSync(path.join('styles', 'hillshade-raster-dem'), { recursive: true });
  fs.copyFileSync(
    path.join(fixturesDir, 'styles', 'hillshade-raster-dem', 'style.json'),
    path.join('styles', 'hillshade-raster-dem', 'style.json'),
  );

  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

  // Add the raster-dem source with sparse=false to exercise the missing-tile
  // guard added in PR #2139 (issue #2065).
  config.data['ocean-dem'] = { mbtiles: 'ocean_dem.mbtiles', sparse: false };
  config.styles['hillshade-raster-dem'] = {
    style: 'hillshade-raster-dem/style.json',
  };

  fs.writeFileSync('merged-config.json', JSON.stringify(config, null, 2));

  const running = await server({
    configPath: 'merged-config.json',
    port: 8888,
    publicUrl: '/test/',
  });
  global.app = running.app;
  global.server = running.server;
  return running.startupPromise;
});

after(function () {
  console.log('global teardown');
  // Remove files that were generated during test setup.
  for (const f of ['merged-config.json', 'ocean_dem.mbtiles']) {
    try {
      fs.unlinkSync(f);
    } catch {
      // ignore if already gone
    }
  }
  global.server.close(function () {
    console.log('Done');
  });
});
