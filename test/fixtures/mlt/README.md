# MLT test fixtures

Zoom 0-1 of the MapLibre demo tiles in MapLibre Tile (MLT) encoding, taken from
`https://demotiles.maplibre.org/tiles-mlt/plain/{z}/{x}/{y}.mlt`.

Layers: `countries`, `geolines`, `centroids` (extent 4096). The underlying geometry is
Natural Earth data, as used by [maplibre/demotiles](https://github.com/maplibre/demotiles).

* `test-mlt.mbtiles` - the format comes from a metadata row.
* `test-mlt.pmtiles` - the same tiles, where the format instead comes from the archive
  header's tile type (6 = MLT). A separate code path, hence a separate fixture.

Both are committed rather than generated during the test run, because no JavaScript MLT
*encoder* is published - `@maplibre/mlt` decodes only - so the tiles have to come from
something that already speaks MLT. `*.mbtiles` is gitignored with an exception for this
directory.

To refresh them (needs network, and `pip install pmtiles-mbtiles-util`
for the mbtiles -> pmtiles step):

```
node test/utils/create_mlt_mbtiles.js
pmtiles-mbtiles-util test/fixtures/mlt/test-mlt.mbtiles test/fixtures/mlt/test-mlt.pmtiles
```
