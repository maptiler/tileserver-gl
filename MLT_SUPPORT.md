# MLT (MapLibre Tile) support — design notes

Status: core plumbing implemented on `feat/mlt-tiles`. GeoJSON inspection over MLT is
deliberately not implemented (returns 400); automated tests are blocked on a fixture, see
[Testing](#testing).

## Summary

We do **not** need to write an MLT decoder. Both renderers tileserver-gl uses already
decode MLT; what is missing is plumbing — format detection, routing, MIME types, and
propagating `encoding: "mlt"` onto the vector sources we hand to the renderers.

tileserver-gl decodes tile bytes itself in exactly **one** place — the
`/data/{id}/{z}/{x}/{y}.geojson` inspection endpoint at `src/serve_data.js:157`, the only
`@mapbox/vector-tile` call site in the codebase. That endpoint, and nothing else, is why
we would pull in `@maplibre/mlt`. Everything else is a pass-through of raw bytes.

Notably the browser viewer needs nothing: `public/resources/maplibre-gl.js` is copied
from `node_modules` at prepare time and already contains the MLT decoder, and
`@maplibre/maplibre-gl-inspect` parses no tiles of its own — it goes through maplibre-gl.

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

### Wire-version caveat — unverified

Whether maplibre-native 6.4.1 decodes what Planetiler 0.10.2 emits is **not established
here**. MLT has versioned wire formats (`WireVersion::V01`, plus an unstable V2), and the
June 2026 upstream fixtures are already rejected by both native 6.4.1 and
`@maplibre/mlt@1.2.0`, so the format has moved recently. Confirming this needs a tile from a
current generator — `demotiles.maplibre.org/tiles-mlt/plain/{z}/{x}/{y}.mlt` is a live MLT
dataset that would settle it.

## Do we need `@maplibre/mlt` at all?

Only for the GeoJSON inspection endpoint. Serving `.mlt` tiles, rendering styles over MLT
sources, the data preview, and the TileJSON all work without it — the renderers decode,
we just move bytes. So this splits cleanly in two:

* **Core MLT support** — no new runtime dependency.
* **GeoJSON inspection over MLT** — needs a decoder, and hits the packaging problem below.

Core support can land first and independently. Inspection needs the decoder, which has a
packaging problem — solvable on our side, no upstream change required.

### The problem: `@maplibre/mlt` is not loadable from plain Node

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

### Workaround: rewrite the specifiers at `prepare` time

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

### Not done

* `mltAlias` mirroring `pbfAlias` — no evidence anyone needs it yet.
* GeoJSON inspection over MLT (below).

### GeoJSON inspection endpoint

`/data/{id}/{z}/{x}/{y}.geojson` currently builds GeoJSON via `@mapbox/vector-tile`. For MLT:

```js
const tables = decodeTile(new Uint8Array(data));   // FeatureTable[]
for (const ft of tables) {
  for (const f of ft.getFeatures()) { /* f.id, f.geometry, f.properties, ft.extent */ }
}
```

`FeatureTable` exposes `name`, `numFeatures`, `extent`, `getFeatures()`. Unlike
`@mapbox/vector-tile` there is no `toGeoJSON(x, y, z)` — geometry comes back in tile-local
coordinates, so we do the tile→WGS84 transform ourselves against `ft.extent`.

## Verified manually

With `omt-basic-mlt.mbtiles` wired into `test_data/config.json` as `omt_mlt`, plus a
`test-style-mlt` style reusing `osm-bright/style.json` with `mapping: { openmaptiles:
omt_mlt }`:

```
200  /data/omt_mlt.json          format:"mlt", encoding:"mlt", tiles .../{z}/{x}/{y}.mlt
200  /data/omt_mlt/0/0/0.mlt     87,905 bytes, application/vnd.maplibre-vector-tile
200  /data/omt_mlt/4/8/5.mlt     404,579 bytes
404  /data/omt_mlt/0/0/0.pbf     Invalid format
400  /data/omt_mlt/0/0/0.geojson GeoJSON conversion is not supported for MLT tiles
200  /data/openmaptiles/0/0/0.geojson   188,144 bytes  (no regression)
200  /data/openmaptiles/0/0/0.pbf        43,479 bytes  (no regression)
200  /styles/test-style-mlt/256/0/0/0.png
```

Repeated against a copy of the same archive with its metadata `format` rewritten to
Planetiler's `application/vnd.maplibre-vector-tile`: identical results — TileJSON reports
`format:"mlt"` / `encoding:"mlt"`, the `.mlt` route serves, and the style renders.

The rendered request logs `mlgl: MLT parse failed: Unexpected end of buffer`, which is the
point: maplibre-native took the **MLT** decode path, so `encoding: 'mlt'` reached the
source. It then failed on the stale fixture (see below) and rendered background only.

The existing suite still passes in full (188 passing).

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

`test/mlt.js` — 11 tests, no network. It boots its own server against
`test/fixtures/mlt-config.json` (the pattern `test/reload.js` uses) so it does not depend on
the config inside `test_data.zip`, and packs the fixture in a `before` hook.

* TileJSON reports `format: "mlt"`, `encoding: "mlt"` and the `.mlt` URL template
* Planetiler's `application/vnd.maplibre-vector-tile` spelling normalizes to `mlt`, for both
  the TileJSON and the tile route
* `.mlt` serves with the MLT content type, at z0 and all four z1 tiles
* `.pbf` against an MLT source and `.mlt` against a PBF source both 404
* beyond maxzoom 404s
* `.geojson` against MLT returns 400 with a reason; against PBF it still works
* a style over the MLT source renders

The render test asserts the PNG's channels vary rather than matching a reference image: a
failed MLT decode still returns a valid PNG of the flat background, so uniform channels mean
the geometry never arrived. Confirmed the assertion fails on a solid-colour image, so it is
a real guard and not a tautology.

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

## Proposed: conversion routes

Idea: serve an MLT source as MVT (and possibly the reverse), alongside GeoJSON. The two
directions are not equally feasible.

### MLT → MVT — feasible, and the URL already exists

`/data/{id}/{z}/{x}/{y}.pbf` against an MLT source currently 404s with `Invalid format`.
Making that transcode instead fits the existing extension-based idiom (`.pbf`, `.geojson`)
with no new route shape. Martin does the same thing via `Accept` header negotiation; the
extension form suits this codebase better.

Needs `@maplibre/mlt` to decode plus an MVT serializer — `vt-pbf` (3.1.3) is the standard
one. Its `fromVectorTileJs` wants `{ layers: { name: { length, extent, feature(i) } } }`
where each feature exposes `loadGeometry()`, `type`, `id`, `properties`, so a `FeatureTable`
shim gets us there. Prefer that over routing through GeoJSON, which would round-trip
coordinates through lat/lon and lose precision.

Two caveats worth deciding up front:

* **Lossy.** MLT has `STRUCT` (30) and `MAP` (31) column types for nested properties, and
  64-bit ids. MVT properties are flat scalars. Nested properties have to be flattened or
  dropped — that is a real fidelity decision, not an implementation detail.
* **Cost.** This is a decode plus re-encode on every tile request, and tileserver-gl has no
  tile cache to amortise it. Fine for compatibility with legacy clients; not something to
  leave on by default without measuring.

### MVT → MLT — blocked upstream

No published JavaScript MLT encoder exists:

* `@maplibre/mlt` is decode-only. `encodeTile` exists at
  `maplibre-tile-spec/ts/src/encoding/mltEncoder.ts` but is **not** re-exported from
  `ts/src/index.ts`, so it is not part of the package API.
* `mlt-wasm` exposes `decode_tile` only — no encode entry point at all. (`@maplibre/mlt-wasm`
  on npm is at 0.1.0 against a 0.1.20 crate, so it also looks stale.)

Ways forward, none of them small:

1. Upstream PR exporting `encodeTile` from `ts/src/index.ts` — by far the cheapest, and it
   stacks naturally on the packaging PR.
2. Shell out to the Rust `mlt` CLI. Fine for offline conversion, wrong for a request path.
3. Wait for `mlt-wasm` to gain encoding.

Note the demand here is also weaker: MLT's benefit is precomputed compact storage, so
encoding MVT→MLT per request spends CPU to produce something that should have been
generated once by Planetiler or `mlt convert`. Worth confirming there is a real use case
before building it.

### Suggested order

1. Unblock the fixture (a current-format tile).
2. MLT → GeoJSON, which establishes the decode + coordinate-transform code.
3. MLT → MVT, reusing that decode path with `vt-pbf`.
4. MVT → MLT only if upstream exports the encoder and a use case exists.

## Open questions

1. Confirm the split above — core MLT support with no new dependency, GeoJSON inspection
   as a follow-up?
2. Specifier rewrite or esbuild bundle for the `prepare`-time workaround?
3. Skip response gzip for `.mlt`?
4. Does `tileserver-gl-styles` need MLT variants, or do we rely on `encoding` being derived
   so the stock styles work over MLT data unchanged?
