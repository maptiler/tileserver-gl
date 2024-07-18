import util from 'node:util';
import fsp from 'node:fs/promises';
import zlib from 'zlib';

export const gzipP = util.promisify(zlib.gzip);
export const gunzipP = util.promisify(zlib.gunzip);
export const existsP = async (path) => {
  try {
    await fsp.access(path); // Defaults to F_OK: indicating that the file is visible to the calling process
    return true;
  } catch (err) {
    return false;
  }
};
