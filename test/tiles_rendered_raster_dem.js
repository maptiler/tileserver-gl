// Regression test for issue #2065 / PR #2139:
// When a raster-dem source has sparse=false and a tile is missing from
// the local MBTiles/PMTiles file, the old code called createEmptyResponse()
// which produced a 1x1 PNG placeholder.  MapLibre-native's
// DEMData::backfillBorder() then ran between that 1x1 tile and a real
// 256x256 neighbor, causing an out-of-bounds memory read (segfault).
//
// The fix ensures that missing raster-dem tiles always take the callback()
// (no-content) path regardless of the sparse flag.
//
// The fixture ocean_dem.mbtiles contains:
//   z=0 tile (0,0) — present
//   z=1 NW tile (0,0) — present
//   z=1 NE/SW/SE tiles — intentionally absent
// This forces MapLibre to encounter missing neighbors when rendering z=1
// tiles, which is exactly the scenario that triggered the crash.

const prefix = 'hillshade-raster-dem';

const testRenderedTile = function (tileSize, z, x, y, format, status, type) {
  const path =
    '/styles/' +
    prefix +
    '/' +
    tileSize +
    '/' +
    z +
    '/' +
    x +
    '/' +
    y +
    '.' +
    format;
  it(path + ' returns ' + status, function (done) {
    const test = supertest(app).get(path);
    test.expect(status);
    if (type) test.expect('Content-Type', type);
    test.end(done);
  });
};

describe('Raster-DEM missing-tile regression (issue #2065)', function () {
  // Increase timeout: MapLibre may need extra time to load DEM tiles and
  // render hillshade on the first request.
  this.timeout(20000);

  describe('renders without crashing when neighbor tiles are missing (sparse=false)', function () {
    // z=0: the single world tile is present — should render normally.
    testRenderedTile(256, 0, 0, 0, 'png', 200, /image\/png/);

    // z=1 NW tile (0,0): present in MBTiles, but the NE/SW/SE neighbors are
    // missing.  Without the fix each missing neighbor would produce a 1x1 PNG
    // placeholder, causing a segfault in DEMData::backfillBorder().
    testRenderedTile(256, 1, 0, 0, 'png', 200, /image\/png/);

    // Additional formats to confirm the fix holds across output types.
    testRenderedTile(256, 1, 0, 0, 'webp', 200, /image\/webp/);
    testRenderedTile(256, 1, 0, 0, 'jpg', 200, /image\/jpeg/);
  });
});
