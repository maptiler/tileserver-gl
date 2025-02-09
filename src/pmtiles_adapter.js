import fs from 'node:fs';
import { PMTiles, FetchSource } from 'pmtiles';
import { isValidHttpUrl } from './utils.js';

/**
 * A PMTiles source that reads data from a file descriptor.
 */
class PMTilesFileSource {
  /**
   * Creates a new PMTilesFileSource instance.
   * @param {number} fd - The file descriptor of the PMTiles file.
   */
  constructor(fd) {
    /**
     * @type {number} The file descriptor of the PMTiles file
     * @private
     */
    this.fd = fd;
  }

  /**
   * Returns the file descriptor.
   * @returns {number} The file descriptor.
   */
  getKey() {
    return this.fd;
  }

  /**
   * Asynchronously retrieves a chunk of bytes from the PMTiles file.
   * @async
   * @param {number} offset - The byte offset to start reading from.
   * @param {number} length - The number of bytes to read.
   * @returns {Promise<{data: ArrayBuffer}>} A promise that resolves with an object containing the read bytes as an ArrayBuffer.
   */
  async getBytes(offset, length) {
    const buffer = Buffer.alloc(length);
    await readFileBytes(this.fd, buffer, offset);
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return { data: ab };
  }
}

/**
 * Asynchronously reads a specified number of bytes from a file descriptor into a buffer.
 * @async
 * @param {number} fd - The file descriptor to read from.
 * @param {Buffer} buffer - The buffer to write the read bytes into.
 * @param {number} offset - The byte offset in the file to start reading from.
 * @returns {Promise<void>} A promise that resolves when the read operation completes.
 * @throws {Error} If there is an error during the read operation.
 */
async function readFileBytes(fd, buffer, offset) {
  return new Promise((resolve, reject) => {
    fs.read(fd, buffer, 0, buffer.length, offset, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Opens a PMTiles file (either local or remote) and returns a PMTiles instance.
 * @param {string} FilePath - The path to the PMTiles file or a URL.
 * @returns {PMTiles} A PMTiles instance.
 */
export function openPMtiles(FilePath) {
  let pmtiles = undefined;

  if (isValidHttpUrl(FilePath)) {
    const source = new FetchSource(FilePath);
    pmtiles = new PMTiles(source);
  } else {
    const fd = fs.openSync(FilePath, 'r');
    const source = new PMTilesFileSource(fd);
    pmtiles = new PMTiles(source);
  }
  return pmtiles;
}

/**
 * Asynchronously retrieves metadata and header information from a PMTiles file.
 * @async
 * @param {PMTiles} pmtiles - The PMTiles instance.
 * @returns {Promise<object>} A promise that resolves with the metadata object.
 */
export async function getPMtilesInfo(pmtiles) {
  const header = await pmtiles.getHeader();
  const metadata = await pmtiles.getMetadata();

  //Add missing metadata from header
  metadata['format'] = getPmtilesTileType(header.tileType).type;
  metadata['minzoom'] = header.minZoom;
  metadata['maxzoom'] = header.maxZoom;

  if (header.minLon && header.minLat && header.maxLon && header.maxLat) {
    metadata['bounds'] = [
      header.minLon,
      header.minLat,
      header.maxLon,
      header.maxLat,
    ];
  } else {
    metadata['bounds'] = [-180, -85.05112877980659, 180, 85.0511287798066];
  }

  if (header.centerZoom) {
    metadata['center'] = [
      header.centerLon,
      header.centerLat,
      header.centerZoom,
    ];
  } else {
    metadata['center'] = [
      header.centerLon,
      header.centerLat,
      parseInt(metadata['maxzoom']) / 2,
    ];
  }

  return metadata;
}

/**
 * Asynchronously retrieves a tile from a PMTiles file.
 * @async
 * @param {PMTiles} pmtiles - The PMTiles instance.
 * @param {number} z - The zoom level of the tile.
 * @param {number} x - The x coordinate of the tile.
 * @param {number} y - The y coordinate of the tile.
 * @returns {Promise<{data: Buffer|undefined, header: object}>} A promise that resolves with an object containing the tile data (as a Buffer, or undefined if not found) and the appropriate headers.
 */
export async function getPMtilesTile(pmtiles, z, x, y) {
  const header = await pmtiles.getHeader();
  const tileType = getPmtilesTileType(header.tileType);
  let zxyTile = await pmtiles.getZxy(z, x, y);
  if (zxyTile && zxyTile.data) {
    zxyTile = Buffer.from(zxyTile.data);
  } else {
    zxyTile = undefined;
  }
  return { data: zxyTile, header: tileType.header };
}

/**
 * Determines the tile type and corresponding headers based on the PMTiles tile type number.
 * @param {number} typenum - The tile type number from the PMTiles header.
 * @returns {{type: string, header: object}} An object containing the tile type and associated headers.
 */
function getPmtilesTileType(typenum) {
  let head = {};
  let tileType;
  switch (typenum) {
    case 0:
      tileType = 'Unknown';
      break;
    case 1:
      tileType = 'pbf';
      head['Content-Type'] = 'application/x-protobuf';
      break;
    case 2:
      tileType = 'png';
      head['Content-Type'] = 'image/png';
      break;
    case 3:
      tileType = 'jpeg';
      head['Content-Type'] = 'image/jpeg';
      break;
    case 4:
      tileType = 'webp';
      head['Content-Type'] = 'image/webp';
      break;
    case 5:
      tileType = 'avif';
      head['Content-Type'] = 'image/avif';
      break;
  }
  return { type: tileType, header: head };
}
