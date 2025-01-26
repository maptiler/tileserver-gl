import MBTiles from '@mapbox/mbtiles';
import util from 'node:util';

/**
 * A promise-based wrapper around the `@mapbox/mbtiles` class,
 * providing asynchronous access to MBTiles database functionality.
 */
class MBTilesWrapper {
  constructor(mbtiles) {
    this._mbtiles = mbtiles;
    this._getInfoP = util.promisify(mbtiles.getInfo.bind(mbtiles));
  }

  /**
   * Gets the underlying MBTiles object.
   * @returns {MBTiles} The underlying MBTiles object.
   */
  getMbTiles() {
    return this._mbtiles;
  }

  /**
   * Gets the MBTiles metadata object.
   * @async
   * @returns {Promise<object>} A promise that resolves with the MBTiles metadata.
   */
  async getInfo() {
    return this._getInfoP();
  }
}

/**
 * Opens an MBTiles file and returns a promise that resolves with an MBTilesWrapper instance.
 *
 * The MBTiles database is opened in read-only mode.
 * @param {string} inputFile - The path to the MBTiles file.
 * @returns {Promise<MBTilesWrapper>} A promise that resolves with a new MBTilesWrapper instance.
 * @throws {Error} If there is an error opening the MBTiles file.
 */
export function openMbTilesWrapper(inputFile) {
  return new Promise((resolve, reject) => {
    const mbtiles = new MBTiles(inputFile + '?mode=ro', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(new MBTilesWrapper(mbtiles));
    });
  });
}
