import sharp from 'sharp';
import mlcontour from '../node_modules/maplibre-contour/dist/index.mjs';
import { fetchTileData } from './utils.js';

/**
 * Manages local DEM (Digital Elevation Model) data using maplibre-contour.
 */
export class LocalDemManager {
  /**
   * Creates a new LocalDemManager instance.
   * @param {string} encoding - The encoding type for the DEM data.
   * @param {number} maxzoom - The maximum zoom level for the DEM data.
   * @param {object} source - The source object that contains either pmtiles or mbtiles.
   * @param {'pmtiles' | 'mbtiles'} sourceType - The type of data source
   * @param {Function} [GetTileFunction] - the function that returns a tile from the pmtiles object.
   * @param {Function} [GetImageFunction] - the function that returns a tile from the pmtiles object.
   * @param {Function} [extractZXYFromUrlFunction] - The function to extract the zxy from the url.
   */
  constructor(
    encoding,
    maxzoom,
    source,
    sourceType,
    GetTileFunction,
    GetImageFunction,
    extractZXYFromUrlFunction,
  ) {
    this.encoding = encoding;
    this.maxzoom = maxzoom;
    this.source = source;
    this.sourceType = sourceType;
    this._getTile = GetTileFunction;
    this._decodeImage = GetImageFunction;
    this._extractZXY = extractZXYFromUrlFunction;

    this.manager = new mlcontour.LocalDemManager({
      demUrlPattern: '/{z}/{x}/{y}',
      cacheSize: 100,
      encoding: this.encoding,
      maxzoom: this.maxzoom,
      timeoutMs: 10000,
      decodeImage: this.getImageFunction.bind(this),
      getTile: this.getTileFunction.bind(this),
    });
  }

  get getTileFunction() {
    return this._getTile ? this._getTile.bind(this) : this.GetTile.bind(this);
  }

  get getImageFunction() {
    return this._decodeImage
      ? this._decodeImage.bind(this)
      : this.getImageData.bind(this);
  }

  get extractZXYFromUrlTrim() {
    return this._extractZXY
      ? this._extractZXY.bind(this)
      : this._extractZXYFromUrl.bind(this);
  }

  /**
   * Processes image data from a blob.
   * @param {Blob} blob - The image data as a Blob.
   * @param {AbortController} abortController - An AbortController to cancel the image processing.
   * @returns {Promise<any>} - A Promise that resolves with the processed image data, or null if aborted.
   * @throws If an error occurs during image processing.
   */
  async getImageData(blob, abortController) {
    try {
      if (abortController?.signal?.aborted) return null;

      const buffer = await blob.arrayBuffer();
      const image = sharp(Buffer.from(buffer));

      if (abortController?.signal?.aborted) return null;

      const { data, info } = await image
        .ensureAlpha() // Ensure RGBA output
        .raw()
        .toBuffer({ resolveWithObject: true });

      if (abortController?.signal?.aborted) return null;

      const parsed = mlcontour.decodeParsedImage(
        info.width,
        info.height,
        this.encoding,
        data,
      );

      if (abortController?.signal?.aborted) return null;

      return parsed;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }

  /**
   * Fetches a tile using the provided url and abortController
   * @param {string} url - The url that should be used to fetch the tile.
   * @param {AbortController} abortController - An AbortController to cancel the request.
   * @returns {Promise<{data: Blob, expires: undefined, cacheControl: undefined}>} A promise that resolves with the response data.
   * @throws If an error occurs fetching or processing the tile.
   */
  async GetTile(url, abortController) {
    //console.log(url);
    const $zxy = this.extractZXYFromUrlTrim(url);
    if (!$zxy) {
      throw new Error(`Could not extract zxy from $url`);
    }
    if (abortController.signal.aborted) {
      return null;
    }

    try {
      const fetchTile = await fetchTileData(
        this.source,
        this.sourceType,
        $zxy.z,
        $zxy.x,
        $zxy.y,
      );
      if (fetchTile == null) return null;
      let data = fetchTile.data;

      if (!data) {
        throw new Error(`No tile returned for $`);
      }

      const blob = new Blob([data]);
      return {
        data: blob,
        expires: undefined,
        cacheControl: undefined,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('fetch canceled');
        return null;
      }
      throw error;
    }
  }

  /**
   * Default implementation for extracting z,x,y from a url
   * @param {string} url - The url to extract from
   * @returns {{z: number, x: number, y:number} | null} Returns the z,x,y of the url, or null if can't extract
   */
  _extractZXYFromUrl(url) {
    const segments = url.split('/').filter(Boolean); // Split and remove empty segments
    if (segments.length < 3) {
      return null;
    }

    const ySegment = segments[segments.length - 1];
    const xSegment = segments[segments.length - 2];
    const zSegment = segments[segments.length - 3];

    const lastDotIndex = ySegment.lastIndexOf('.');
    const cleanedYSegment =
      lastDotIndex === -1 ? ySegment : ySegment.substring(0, lastDotIndex);

    const z = parseInt(zSegment, 10);
    const x = parseInt(xSegment, 10);
    const y = parseInt(cleanedYSegment, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return null;
    }

    return { z, x, y };
  }

  /**
   * Get the underlying maplibre-contour LocalDemManager
   * @returns {mlcontour.LocalDemManager} the underlying maplibre-contour LocalDemManager
   */
  getManager() {
    return this.manager;
  }
}
