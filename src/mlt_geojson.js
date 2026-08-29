'use strict';

import { classifyRings } from '@mapbox/vector-tile';

import { decodeTile, GEOMETRY_TYPE } from './vendor/mlt/index.js';

/**
 * Maps an MLT geometry type to the three shapes GeoJSON cares about.
 * Singular and multi variants share a branch, and the count decides which
 * GeoJSON type comes out, exactly as VectorTileFeature.toGeoJSON does.
 * @param {number} type - A GEOMETRY_TYPE value.
 * @returns {string} One of 'point', 'line', 'polygon'.
 */
function geometryKind(type) {
  switch (type) {
    case GEOMETRY_TYPE.POINT:
    case GEOMETRY_TYPE.MULTIPOINT:
      return 'point';
    case GEOMETRY_TYPE.LINESTRING:
    case GEOMETRY_TYPE.MULTILINESTRING:
      return 'line';
    case GEOMETRY_TYPE.POLYGON:
    case GEOMETRY_TYPE.MULTIPOLYGON:
      return 'polygon';
    default:
      throw new Error(`Unknown MLT geometry type: ${type}`);
  }
}

/**
 * Converts an MLT tile to a GeoJSON FeatureCollection.
 *
 * MLT geometry arrives in tile-local coordinates against the layer's extent,
 * and the decoder has no toGeoJSON of its own, so the projection here mirrors
 * VectorTileFeature.toGeoJSON to keep output identical to the MVT endpoint.
 * @param {Buffer} data - The decompressed MLT tile.
 * @param {number} z - Tile zoom level.
 * @param {number} x - Tile column.
 * @param {number} y - Tile row.
 * @returns {object} A GeoJSON FeatureCollection.
 */
export function mltTileToGeoJSON(data, z, x, y) {
  const geojson = { type: 'FeatureCollection', features: [] };

  for (const table of decodeTile(new Uint8Array(data))) {
    const extent = table.extent;
    const size = extent * Math.pow(2, z);
    const x0 = extent * x;
    const y0 = extent * y;

    /**
     * Projects a tile-local point to WGS84.
     * @param {{x: number, y: number}} p - Point in tile coordinates.
     * @returns {number[]} A [lon, lat] pair.
     */
    const projectPoint = (p) => [
      ((p.x + x0) * 360) / size - 180,
      (360 / Math.PI) *
        Math.atan(Math.exp((1 - ((p.y + y0) * 2) / size) * Math.PI)) -
        90,
    ];

    /**
     * Projects a run of tile-local points.
     * @param {Array<{x: number, y: number}>} line - Points in tile coordinates.
     * @returns {Array<number[]>} The projected positions.
     */
    const projectLine = (line) => line.map(projectPoint);

    for (const feature of table.getFeatures()) {
      const parts = feature.geometry.coordinates;
      let geometry;

      switch (geometryKind(feature.geometry.type)) {
        case 'point': {
          const points = projectLine(parts.flat());
          geometry =
            points.length === 1
              ? { type: 'Point', coordinates: points[0] }
              : { type: 'MultiPoint', coordinates: points };
          break;
        }
        case 'line': {
          const lines = parts.map(projectLine);
          geometry =
            lines.length === 1
              ? { type: 'LineString', coordinates: lines[0] }
              : { type: 'MultiLineString', coordinates: lines };
          break;
        }
        default: {
          // Rings arrive flat, as in MVT: winding order says which are holes.
          const polygons = classifyRings(parts).map((rings) =>
            rings.map(projectLine),
          );
          geometry =
            polygons.length === 1
              ? { type: 'Polygon', coordinates: polygons[0] }
              : { type: 'MultiPolygon', coordinates: polygons };
        }
      }

      const result = {
        type: 'Feature',
        geometry,
        properties: { ...feature.properties, layer: table.name },
      };
      if (feature.id != null) {
        // Ids beyond Number.MAX_SAFE_INTEGER stay BigInt, which JSON cannot serialize.
        result.id =
          typeof feature.id === 'bigint' ? feature.id.toString() : feature.id;
      }
      geojson.features.push(result);
    }
  }

  return geojson;
}
