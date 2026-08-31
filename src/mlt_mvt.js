'use strict';

import vtpbf from 'vt-pbf';

import { decodeTile, GEOMETRY_TYPE } from './vendor/mlt/index.js';

/**
 * Maps an MLT geometry type to the MVT geometry type.
 * MVT has no separate multi types; the geometry itself carries the parts.
 * @param {number} type - A GEOMETRY_TYPE value.
 * @returns {number} The MVT type: 1 point, 2 linestring, 3 polygon.
 */
function mvtGeometryType(type) {
  switch (type) {
    case GEOMETRY_TYPE.POINT:
    case GEOMETRY_TYPE.MULTIPOINT:
      return 1;
    case GEOMETRY_TYPE.LINESTRING:
    case GEOMETRY_TYPE.MULTILINESTRING:
      return 2;
    case GEOMETRY_TYPE.POLYGON:
    case GEOMETRY_TYPE.MULTIPOLYGON:
      return 3;
    default:
      throw new Error(`Unknown MLT geometry type: ${type}`);
  }
}

/**
 * Presents a decoded MLT feature the way vt-pbf expects a vector-tile feature.
 * @param {object} feature - A feature from FeatureTable.getFeatures().
 * @returns {object} A feature with id, type, properties and loadGeometry().
 */
function asVectorTileFeature(feature) {
  const result = {
    type: mvtGeometryType(feature.geometry.type),
    properties: feature.properties,
    // MLT hands back the same shape loadGeometry() does: parts of {x, y}.
    loadGeometry: () => feature.geometry.coordinates,
  };

  if (feature.id != null) {
    // vt-pbf writes the id as a varint, which cannot take a BigInt. Ids past
    // Number.MAX_SAFE_INTEGER are dropped rather than silently rounded.
    const id =
      typeof feature.id === 'bigint'
        ? feature.id <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(feature.id)
          : undefined
        : feature.id;
    if (id !== undefined) {
      result.id = id;
    }
  }

  return result;
}

/**
 * Transcodes an MLT tile to a Mapbox Vector Tile.
 *
 * Lossy in two ways, both inherent to MVT rather than to this conversion:
 * nested properties (MLT's STRUCT and MAP columns) are flattened to JSON
 * strings by vt-pbf, and ids beyond Number.MAX_SAFE_INTEGER are dropped.
 * @param {Buffer} data - The decompressed MLT tile.
 * @returns {Buffer} The tile re-encoded as MVT.
 */
export function mltTileToMvt(data) {
  const layers = {};

  for (const table of decodeTile(new Uint8Array(data))) {
    const features = table.getFeatures().map(asVectorTileFeature);
    layers[table.name] = {
      version: 2,
      name: table.name,
      extent: table.extent,
      length: features.length,
      // eslint-disable-next-line security/detect-object-injection -- i is vt-pbf's loop counter, bounded by length
      feature: (i) => features[i],
    };
  }

  return Buffer.from(vtpbf.fromVectorTileJs({ layers }));
}
