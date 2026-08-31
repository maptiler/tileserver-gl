# MLT (MapLibre Tile) support — design notes

Status: implemented on `feat/mlt-tiles` -- serving, rendering, and conversion to MVT
and GeoJSON, covered by 18 tests.

## Summary

We do **not** need to write an MLT decoder. Both renderers tileserver-gl uses already
decode MLT; what is missing is plumbing — format detection, routing, MIME types, and
propagating `encoding: "mlt"` onto the vector sources we hand to the renderers.

tileserver-gl decodes tile bytes itself only where it converts them: the
`.geojson` and `.pbf` routes on an MLT source. Serving `.mlt`, rendering styles
over it, and the data preview are all pass-throughs of raw bytes, and needed no
new dependency.

Notably the browser viewer needs nothing: `public/resources/maplibre-gl.js` is copied
from `node_modules` at prepare time and already contains the MLT decoder, and
`@maplibre/maplibre-gl-inspect` parses no tiles of its own -- it goes through maplibre-gl.

## What already works (verified against the pinned deps)

| Piece | Version pinned here | MLT status |
| --- | --- | --- |
| `maplibre-gl` (browser viewer) | 5.24.0 | Decodes MLT. `loadVectorTile` branches on `encoding === 'mlt'` and uses the bundled MLT decoder. |
| `@maplibre/maplibre-gl-native` (rendered tiles) | 6.4.1 | Decodes MLT. The prebuilt `mbgl.node` contains the `mlt::` namespace, `VectorMLTTileData`, and the style error string `invalid encoding - valid types are 'mapbox' and 'terrarium' for raster sources, 'mvt' and 'mlt' for vector sources`. |
| `@maplibre/maplibre-gl-style-spec` | 24.8.5 | `source_vector.encoding` is an enum of `mvt` \| `mlt`, default `mvt`. `validateStyleMin` accepts `encoding: "mlt"` today. |
| `pmtiles` | 4.4.1 | `TileType.Mlt = 6`, `tileTypeExt` → `.mlt`. |
| `@mapbox/mbtiles` | 0.12.1 | Reads `format: "mlt"` straight out of the metadata table; no format allowlist. |

Both renderers take `encoding` from the **style source object only** — maplibre-gl picks
`["url","scheme","tileSize","promoteId","encoding"]` off the source options and never
reads it back from the fetched TileJSON. So the style, not the TileJSON, is what has to
carry it.

Because tileserver-gl's custom `request` handler only hands raw bytes back to
maplibre-native, MLT bytes flow through unchanged. Native does the decoding.

## Producing MLT data

`mlt convert` (Rust CLI, crate `mlt`, published with prebuilt binaries) converts
mbtiles→mbtiles, mbtiles→pmtiles and pmtiles→pmtiles. It writes:

* mbtiles: copies source metadata, overrides `format` to `mlt`, sets/removes `compression`.
* pmtiles: header `tile_type = TileType::Mlt` (6), metadata JSON `format: "mlt"`.

Both container types self-describe, so we can derive everything from existing metadata —
no new config key is needed to *identify* MLT data.

## Generator compatibility

Per upstream's [implementation status](https://github.com/maplibre/maplibre-tile-spec/blob/main/docs/implementation-status.md):

| Generator | MLT? | Works with this implementation |
| --- | --- | --- |
| **Planetiler** ≥ 0.10.0 (`--tile-format=mlt`) | yes | yes — MBTiles needed the fix below; PMTiles worked already |
| **tippecanoe** | not yet | n/a — tracked in [felt/tippecanoe#380](https://github.com/felt/tippecanoe/issues/380), "landing soon", via the C++ encoder. The local clone at `../tippecanoe` has no MLT references. |
| **tilemaker** | not yet | n/a — [systemed/tilemaker#856](https://github.com/systemed/tilemaker/issues/856) |
| `mlt convert` (Rust CLI) | yes | yes |

Note upstream also tracks tileserver-gl itself at
[maptiler/tileserver-gl#2194](https://github.com/maptiler/tileserver-gl/issues/2194).

### Two spellings of `format` in the wild

The MBTiles `metadata` table and the PMTiles metadata JSON disagree between producers:

* `mlt convert` writes `format = "mlt"`.
* **Planetiler writes `format = "application/vnd.maplibre-vector-tile"`** — the media type,
  not the short id. `TileFormat.MLT` carries `@JsonProperty("application/vnd.maplibre-vector-tile")`,
  and `TileArchiveMetadataTest.testMltMetadata` asserts exactly that for `toMap()`.

So `format === 'mlt'` alone would silently fail to recognise every Planetiler-generated
MBTiles: it is not a vector format, the data page renders it as raster, sparse defaults
invert, and no `encoding` is derived. `normalizeTileFormat()` in `src/utils.js` folds the
media type to `mlt`, applied in `MBTilesWrapper.getInfo()` — the single choke point through
which `serve_data`, `serve_rendered` and `main.js` all read MBTiles metadata.

PMTiles was unaffected either way: `getPMtilesInfo` overwrites `format` from the header's
tile type, and Planetiler writes `TileType.MLT` (6) there, which `getPmtilesTileType` now maps.

### Wire versions

Settled: maplibre-native 6.4.1 decodes and renders current-format MLT, verified against
tiles from demotiles. tileserver-gl only moves opaque bytes, so it supports whatever the
renderers do; the same holds for the converters, which read the tile rather than assuming
a version.

## Decoding in-process

Needed only where tileserver-gl converts: `.geojson` and `.pbf` on an MLT source.
Core serving and rendering carry no dependency, which is why they landed first.

### `@maplibre/mlt` is not loadable from plain Node

`@maplibre/mlt@1.2.0` ships `dist/*.js` written in ESM syntax, with **no `"type": "module"`**
in its package.json and **extensionless relative specifiers**:

```js
export { default as decodeTile } from "./mltDecoder";
```

Node 22+ detects the ESM syntax and re-parses the file as a module, then fails to resolve
`./mltDecoder`:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../dist/mltDecoder
    imported from .../dist/index.js
```

It only works behind a bundler today, which is how maplibre-gl consumes it (rollup, from
`src/source/vector_tile_mlt.ts`).

### Solution: rewrite the specifiers at `prepare` time

No upstream change and no new dependency. The repo already generates vendored assets from
`node_modules` in `prepare` — `public/resources/maplibre-gl.js` and friends are produced by
the `copy:*` scripts and gitignored. This is the same pattern, with a rewrite step.

The published `dist` is plain `tsc` output: 85 files, 212 relative specifiers, all of the
regular `from "..."` shape, and **zero directory imports** — so appending `.js` is a safe
mechanical transform. As `scripts/vendor-mlt.mjs`, wired into `prepare` as `copy:mlt`:

```js
const addExt = (code) =>
  code.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.\.?\/[^"']*?)\2/g,
    (m, kw, q, spec) => (path.extname(spec) ? m : `${kw}${q}${spec}.js${q}`),
  );
```

Copy `dist/**/*.js` through `addExt` into `src/vendor/mlt/`, and drop a
`{ "type": "module" }` package.json beside it. Verified: `import { decodeTile } from
'./vendor/mlt/index.js'` loads and runs under plain Node 24 with no bundler and no new dep.

Alternative if the rewrite feels too clever: add esbuild as a devDependency and bundle
instead — `esbuild node_modules/@maplibre/mlt/dist/index.js --bundle --format=esm
--platform=node` produces a working 181 KB single-file ESM module. Same `prepare` hook,
one more dependency.

### Longer term: fix it upstream

Worth doing regardless, so the workaround can be deleted and every Node consumer benefits.
In `maplibre-tile-spec/ts`, the cause is `moduleResolution: "bundler"` with no
`"type": "module"`. Two candidate shapes:

* **Canonical** — `module`/`moduleResolution: "nodenext"`, `"type": "module"`, an
  `"exports"` map, and `.js` on all 423 relative specifiers across ~119 source files
  (3 directory imports, all in spec files; no JSON imports). Large but mechanical diff.
* **Minimal** — `"type": "module"`, an `"exports"` map, and an esbuild bundle step in
  `build`. Two files changed, but it changes the published artifact's shape.

Adding `"type": "module"` and extensions does not affect maplibre-gl-js, which consumes the
package through a bundler.

## Changes made

`isVectorFormat(format)` and `MLT_CONTENT_TYPE` were added to `src/utils.js` and used
everywhere `format === 'pbf'` previously stood in for "this is a vector tile".

### Format detection and routing

* `src/pmtiles_adapter.js` — `getPmtilesTileType` gained `case 6` → `mlt` with the MLT
  content type. Type 6 previously fell through the switch and returned `undefined`, so an
  MLT pmtiles archive got no format at all.
* `src/serve_data.js` — the tile route accepts `.mlt`, serves it as
  `application/vnd.maplibre-vector-tile`, and answers `.geojson` against an MLT source with
  a 400 explaining that conversion is not supported yet.
* `src/serve_data.js` — TileJSON gains `encoding: "mlt"` when the format is `mlt` and no
  encoding was configured, so `/data/{id}.json` is self-describing.
* `src/mbtiles_wrapper.js` — `getInfo()` runs the declared format through
  `normalizeTileFormat()`, so Planetiler's media-type spelling is recognised. See
  [Generator compatibility](#generator-compatibility).

### "Is this vector?" checks

Six call sites now use `isVectorFormat`:

* `src/serve_data.js` — sparse default
* `src/serve_rendered.js` — sparse default in both the pmtiles and mbtiles branches, and
  `createEmptyResponse`, which would otherwise have handed an MLT source to sharp and tried
  to render an empty *image* when `sparse: false`
* `src/server.js` — `data.is_vector`, `use_maplibre`
* `src/main.js` — both openmaptiles auto-config checks, so `tileserver-gl file.mlt.mbtiles`
  still bootstraps a style

### Gzip handling

`src/serve_rendered.js` gunzipped the tile only when `format === 'pbf'`. With
`source.tiles` ending in `.mlt` that gate missed, and gzipped MLT would have reached native
still compressed. It now keys off `isVectorFormat`, with the `dataDecoratorFunc` hook left
deliberately `pbf`-only — it is an MVT-shaped hook.

`src/serve_data.js` still gzips every response unconditionally. MLT compresses internally,
so this mostly burns CPU — left alone pending a measurement.

### Propagating `encoding` to the renderers

This is the style-spec `encoding` on vector sources, distinct from the raster-dem
`encoding` (`terrarium`/`mapbox`). It is **derived, not configured** — the container
metadata already says `format: "mlt"`.

`src/serve_rendered.js` sets `source.encoding = 'mlt'` in both the pmtiles and mbtiles
branches when the resolved metadata format is `mlt`. A style author can still set it
explicitly; deriving it means existing styles work over MLT data unchanged.

`public/templates/data.tmpl` emits `encoding: 'mlt'` on the inline preview source, driven
by a new `is_mlt` flag from `server.js`.

The raster-dem meaning of `encoding` is untouched: `serve_data.add` still copies
`params['encoding']` for any source, and the terrain checks compare against
`'terrarium'`/`'mapbox'`, so an `mlt` value cannot be mistaken for terrain.

### Conversion routes

An MLT source also answers to `.pbf` and `.geojson`, transcoding on the way out, so
clients that cannot read MLT are still served. Both reuse one decode; only the output
differs. There is deliberately no route the other way -- see below.

`src/mlt_geojson.js` mirrors `VectorTileFeature.toGeoJSON` so output matches the MVT
endpoint. MLT hands back geometry in tile-local coordinates as depth-2 arrays of
`{x, y}` -- the same shape `loadGeometry()` returns -- so the projection carries over
unchanged, and `classifyRings` is imported from `@mapbox/vector-tile` rather than
reimplemented, since polygon rings arrive flat and winding order decides the holes.

`src/mlt_mvt.js` presents each `FeatureTable` as a vector-tile layer for `vt-pbf`. The
geometry needs no conversion at all, only a type map. Two lossy edges, both inherent to
MVT: nested properties (MLT's `STRUCT` and `MAP` columns) become JSON strings, which
`vt-pbf` does itself, and ids past `Number.MAX_SAFE_INTEGER` are dropped rather than
silently rounded, since `writeVarint` cannot take a BigInt.

Ids also need care in the GeoJSON path: `FeatureTable` leaves large ids as BigInt, which
`JSON.stringify` throws on, so they are serialized as strings.

### Not done

* `mltAlias` mirroring `pbfAlias` -- no evidence anyone needs it yet.
* MVT to MLT. No JavaScript MLT encoder is published: `@maplibre/mlt` is decode-only,
  `encodeTile` is not re-exported from `ts/src/index.ts`, and `mlt-wasm` exposes
  `decode_tile` only. It is also the less useful direction -- MLT's value is precomputed
  compact storage, so encoding per request spends CPU to produce what a generator should
  have produced once.

## Verified manually

Beyond the test suite, two things were checked by hand because they are easy to get
subtly wrong and easy for a test to rubber-stamp.

**The projection**, against ground truth rather than against itself:

```
Aruba      -69.96, 12.55   (actual -69.97, 12.52)
Brazil     -53.09, -10.75  (actual -53.1, -10.8)
```

and across all four z1 quadrants, since z0 has x=y=0 and hides the offset terms:

```
z1/0/0 NW  lon [-180.0, 3.5]   lat [-3.5, 85.3]
z1/1/0 NE  lon [-3.5, 180.0]   lat [-3.5, 81.9]
z1/0/1 SW  lon [-180.0, 3.5]   lat [-85.1, 3.5]
z1/1/1 SE  lon [-3.5, 180.0]   lat [-85.3, 3.5]
```

Overshoot past each quadrant edge is the tile buffer, as in MVT. All 3,325 polygon rings
in the z0 tile close.

**The two conversion paths agree.** MLT to GeoJSON, and MLT to MVT to GeoJSON, compared
feature-by-feature across five tiles:

```
z0/0/0  features=495  differing=0
z1/0/0  features=163  differing=0
z1/1/0  features=283  differing=0
z1/0/1  features=54   differing=0
z1/1/1  features=100  differing=0
```

Identical geometry, coordinates and properties throughout. Size on the z0 tile: 81 KB of
MLT becomes 102 KB of MVT.

A first pass at that comparison reported one mismatch per tile and it was the harness,
not the code: features were keyed by their properties, and two centroids share an empty
`NAME`, so the map collapsed them. Comparing positionally showed zero differences.

## Testing

### The fixture — resolved

`maplibre-tile-spec/test/omt-*-mlt.mbtiles` are **stale**: rejected by both
`@maplibre/mlt@1.2.0` (`Unsupported column type code 97`) and maplibre-native 6.4.1
(`MLT parse failed: Unexpected end of buffer`). They predate the current tag-0x01
embedded-metadata layout and are useless for anything that decodes.

Replaced with tiles from `demotiles.maplibre.org/tiles-mlt/plain`, which is current-format
and decodes cleanly. `test/fixtures/mlt/` holds zoom 0–1 (5 tiles, 233 KB) and
`test/utils/create_mlt_mbtiles.js` packs them into `test_data/test-mlt.mbtiles`, mirroring
the existing `create_terrain_mbtiles.js`. Run it with `--fetch` to refresh from demotiles.

The tiles are committed rather than generated because **no JavaScript MLT encoder is
published** — see [MVT → MLT](#mvt--mlt--blocked-upstream). `test/fixtures/` already carries
2 MB of binary PNGs, so this is within existing precedent, and the generated `.mbtiles` stays
gitignored. Generation is offline; only `--fetch` touches the network.

### Wire-version question — answered

**maplibre-native 6.4.1 decodes and renders current-format MLT.** A style over the packed
fixture produces a correctly oriented world map with country fills and dashed geolines, no
`MLT parse failed` warning, 76,790 bytes at z0/512px. The earlier failure was purely the
stale fixture.

This also confirms the y-axis handling: MBTiles TMS row flipping round-trips correctly
through the packer and `fetchTileData`.

### Tests

`test/mlt.js` -- 18 tests, no network. It boots its own server against
`test/fixtures/mlt-config.json` (the pattern `test/reload.js` uses) so it does not depend
on the config inside `test_data.zip`.

* TileJSON reports `format`, `encoding` and the `.mlt` URL template, for mbtiles, for
  pmtiles (where the format comes from the header tile type), and for Planetiler's
  media-type spelling
* `.mlt` serves with the MLT content type from mbtiles and pmtiles, at z0 and all four
  z1 tiles; beyond maxzoom 404s
* `.pbf` on an MLT source decodes as a real MVT with the right layers and extent, and
  matches the `.geojson` output feature-by-feature
* `.mlt` on an MVT source still 404s -- there is no encoder for the reverse
* `.geojson` returns a FeatureCollection, puts Aruba where Aruba is, honours a non-zero
  tile offset, and closes every polygon ring
* a style over the MLT source renders actual geometry, not a flat background

The projection tests are deliberate about one trap: z0 has x=y=0, so the tile-offset
terms cancel and a bug there stays hidden. One test uses z1/1/1 for that reason.

## MLT over HTTP(S)

Three cases, all working:

* **Style source with plain `http(s)` tile URLs** — works. The `http`/`https` branch of the
  renderer's request handler passes bytes through untouched, and `extensionToFormat` has no
  entry for `.mlt` (nor for `.pbf`), so the empty-tile path already resolves to an empty
  buffer, which is right for a vector tile. Verified end to end: a style with
  `tiles: ["https://demotiles.maplibre.org/tiles-mlt/plain/{z}/{x}/{y}.mlt"]` and
  `encoding: "mlt"` renders correctly through tileserver-gl.

  The one difference from a local archive: `encoding: "mlt"` must be written in the style by
  hand. There is no container metadata to derive it from, so this is inherent rather than a
  gap.

* **Remote PMTiles as a `/data/` source** (`https://`, `s3://`) — works, and `encoding` *is*
  derived, because `getPMtilesInfo` reads the format from the archive header's tile type,
  which `mlt convert` and Planetiler both set to `TileType::Mlt` (6).

* **Remote MBTiles** — not supported, and never was: tileserver-gl rejects remote MBTiles
  outright. Unrelated to MLT.

Note gzip handling differs by path. `fetch` transparently decompresses a response carrying
`Content-Encoding: gzip`, but the HTTP branch does no magic-byte sniffing, so an endpoint
serving raw gzip bytes *without* that header would fail. That is pre-existing behaviour
shared with `.pbf`, not something MLT introduces.

## Open questions

1. Skip response gzip for `.mlt`? MLT compresses internally, so this mostly burns CPU --
   worth a measurement rather than a guess.
2. Is transcoding worth caching? `.pbf` and `.geojson` decode on every request and there
   is no tile cache to amortise it. Fine for compatibility, not for serving at volume.
3. Fix `@maplibre/mlt` packaging upstream, so `scripts/vendor-mlt.mjs` can be deleted?
