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
   * @returns {MBTiles}
   */
  getMbTiles() {
    return this._mbtiles;
  }

  /**
   * Get the MBTiles metadata object.
   * @returns {Promise<object>}
   */
  getInfo() {
    return this._getInfoP();
  }
}

/**
 * Open the given MBTiles file and return a promise that resolves with a
 * MBTilesWrapper instance.
 * @param inputFile Input file
 * @returns {Promise<MBTilesWrapper>}
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
