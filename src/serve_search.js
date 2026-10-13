// Optional, offline place search. Rendering and geocoding use separate databases.
import path from 'node:path';
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads';

/**
 * Parses "latitude,longitude[,zoom]" (commas or spaces).
 * @param {string} query - The search text.
 * @returns {{label: string, lat: number, lon: number, zoom: number}|null} The point, or null if the text is not coordinates.
 * @throws {Error} If the numbers are out of range.
 */
export function coordinates(query) {
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const match = query.match(
    new RegExp(
      `^(${number})(?:\\s*,\\s*|\\s+)(${number})(?:(?:\\s*,\\s*|\\s+)(${number}))?$`,
    ),
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  const zoom = match[3] === undefined ? 12 : Number(match[3]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 0 || zoom > 22) {
    throw new Error(
      'Use latitude -90..90, longitude -180..180, optional zoom 0..22.',
    );
  }
  return { label: `${lat}, ${lon}`, lat, lon, zoom };
}

/**
 * Turns search text into an FTS5 expression: every word must match as a prefix.
 * @param {string} query - The search text.
 * @returns {string} The MATCH expression, with every token quoted.
 */
export function matchQuery(query) {
  // Index text is stored without diacritics (NFKD, combining marks removed);
  // normalize queries the same way, and quote every token as an FTS5 prefix.
  return query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' AND ');
}

/**
 * Searches the index synchronously; called in a worker thread.
 * @param {string} database - Path of the SQLite index.
 * @param {string} query - The search text.
 * @returns {Promise<{results: object[], attribution: string}>} Up to ten places and the data credit.
 */
export async function searchFile(database, query) {
  // Only this optional feature needs Node's SQLite support (Node 22.13+ / 24).
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
    // The credit the data requires, if the index records one.
    let attribution = '';
    try {
      attribution = String(
        db.prepare("SELECT value FROM metadata WHERE key = 'attribution'").get()
          ?.value ?? '',
      );
    } catch {
      // no metadata table: no credit to show
    }
    const results = db
      .prepare(
        `SELECT p.label, p.lat, p.lon FROM place_names AS f
      JOIN places AS p ON p.id = f.rowid WHERE place_names MATCH ?
      ORDER BY p.population DESC, p.name, p.id LIMIT 10`,
      )
      .all(matchQuery(query))
      .filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon) &&
          Math.abs(p.lat) <= 90 &&
          Math.abs(p.lon) <= 180,
      )
      .map((p) => ({
        label: String(p.label).slice(0, 512),
        lat: p.lat,
        lon: p.lon,
        zoom: 12,
      }));
    return { results, attribution: attribution.slice(0, 256) };
  } finally {
    db.close();
  }
}

if (!isMainThread && workerData?.offlinePlaceSearch) {
  try {
    parentPort.postMessage(
      await searchFile(workerData.database, workerData.query),
    );
  } catch {
    parentPort.postMessage({
      error:
        'Cannot read the offline search index (missing tables or a damaged file).',
    });
  }
}

/**
 * Runs searchFile in a worker thread, so a slow query never blocks the server.
 * @param {string} database - Path of the SQLite index.
 * @param {string} query - The search text.
 * @param {number} timeout - Milliseconds before giving up.
 * @returns {Promise<{results: object[], attribution: string}>} Up to ten places and the data credit.
 */
export function searchWorker(database, query, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { offlinePlaceSearch: true, database, query },
    });
    let settled = false;
    const finish = (error, results) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(results);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error('Offline search timed out. Try a more specific name.'),
        ),
      timeout,
    );
    worker.once('message', (message) =>
      finish(message.error ? new Error(message.error) : null, message),
    );
    worker.once('error', () =>
      finish(
        new Error(
          'Offline search worker failed. Node 22.13+ or 24 is required.',
        ),
      ),
    );
    worker.once('exit', () => {
      if (!settled) finish(new Error('Offline search worker stopped.'));
    });
  });
}

/**
 * Creates the GET /search handler.
 * @param {string|null} database - Path of the SQLite index, or null for coordinates only.
 * @returns {(req: object, res: object) => Promise<object>} An express request handler.
 */
export function createSearchHandler(database) {
  const filename = database ? path.resolve(database) : null;
  let active = 0;
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (
      typeof req.query.q !== 'string' ||
      !req.query.q.trim() ||
      req.query.q.length > 256
    ) {
      return res.status(400).json({
        error: 'Enter a place name or lat,lon (maximum 256 characters).',
      });
    }
    const query = req.query.q.trim();
    try {
      const point = coordinates(query);
      if (point) return res.json({ results: [point], attribution: '' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!filename) {
      return res.status(503).json({
        error: 'No search index is configured; latitude,longitude works.',
      });
    }
    if (active >= 2)
      return res
        .status(429)
        .json({ error: 'Search is busy. Try again shortly.' });
    active++;
    try {
      const { results, attribution } = await searchWorker(filename, query);
      return res.json({ results, attribution });
    } catch (error) {
      return res.status(503).json({ error: error.message });
    } finally {
      active--;
    }
  };
}
