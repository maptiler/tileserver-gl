import MBTiles from '@mapbox/mbtiles';
import util from 'node:util';

/**
 * Promise-ful wrapper around the MBTiles class.
 */
class MBTilesWrapper {
  constructor(mbtiles) {
    this._mbtiles = mbtiles;
    this._getInfoP = util.promisify(mbtiles.getInfo.bind(mbtiles));
  }

  /**
   * Get the underlying MBTiles object.
   * @returns {MBTiles} The MBTiles instance.
   */
  getMbTiles() {
    return this._mbtiles;
  }

  /**
   * Get the MBTiles metadata object.
   * @returns {Promise<object>} A promise that resolves with the MBTiles metadata object.
   */
  getInfo() {
    return this._getInfoP();
  }
}

/**
 * Open the given MBTiles file and return a promise that resolves with a MBTilesWrapper instance.
 * @param {string} inputFile - The path to the input MBTiles file.
 * @returns {Promise<MBTilesWrapper>} A promise that resolves with a MBTilesWrapper instance or rejects with an error.
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
