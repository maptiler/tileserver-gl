import { expect } from 'chai';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  coordinates,
  createSearchHandler,
  searchWorker,
} from '../src/serve_search.js';

// A tiny index in the documented schema (docs/config.rst, offlineSearch).
async function makeIndex(directory) {
  const { DatabaseSync } = await import('node:sqlite');
  const filename = path.join(directory, 'search.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO metadata VALUES ('attribution', 'GeoNames, CC BY 4.0');
    CREATE TABLE places(id INTEGER PRIMARY KEY, name TEXT, label TEXT,
      lat REAL, lon REAL, population INTEGER);
    CREATE VIRTUAL TABLE place_names USING fts5(names,
      tokenize='unicode61 remove_diacritics 2');`);
  const place = db.prepare('INSERT INTO places VALUES (?, ?, ?, ?, ?, ?)');
  const names = db.prepare(
    'INSERT INTO place_names(rowid, names) VALUES (?, ?)',
  );
  for (const [id, name, label, lat, lon, pop, aliases] of [
    [1, 'Rome', 'Rome, 07, IT', 41.9, 12.5, 2700000, 'Rome Roma IT 07'],
    [2, 'Rome', 'Rome, GA, US', 34.2, -85.2, 37000, 'Rome US GA'],
    [
      3,
      'München',
      'München, 02, DE',
      48.1,
      11.5,
      1500000,
      'Munchen Munich DE 02',
    ],
    [4, "L'Aquila", "L'Aquila, 01, IT", 42.3, 13.4, 70000, "L'Aquila IT 01"],
  ]) {
    place.run(id, name, label, lat, lon, pop);
    names.run(id, aliases);
  }
  db.close();
  return filename;
}

// Calls the express handler with a fake request and response.
async function request(handler, q) {
  const response = {
    code: 200,
    headers: {},
    set(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler({ query: { q } }, response);
  return response;
}

describe('Offline search', function () {
  let directory;
  let filename;
  let handler;

  before(async function () {
    try {
      await import('node:sqlite');
    } catch {
      this.skip(); // Node < 22.13: the feature reports itself unavailable
    }
    directory = mkdtempSync(path.join(tmpdir(), 'tileserver-search-'));
    filename = await makeIndex(directory);
    handler = createSearchHandler(filename);
  });

  after(function () {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('parses coordinates with an optional zoom, within bounds', function () {
    expect(coordinates('41.9, 12.5, 13')).to.deep.equal({
      label: '41.9, 12.5',
      lat: 41.9,
      lon: 12.5,
      zoom: 13,
    });
    expect(coordinates('Rome')).to.equal(null);
    for (const q of ['91,0', '0,181', '1,2,23']) {
      expect(() => coordinates(q)).to.throw();
    }
  });

  it('matches prefixes, aliases and names without diacritics, by population', async function () {
    const labels = async (q) =>
      (await searchWorker(filename, q)).results.map((p) => p.label);
    expect(await labels('Rom')).to.deep.equal(['Rome, 07, IT', 'Rome, GA, US']);
    expect(await labels('Roma IT')).to.deep.equal(['Rome, 07, IT']);
    expect(await labels('Munchen')).to.deep.equal(['München, 02, DE']);
    expect(await labels('München')).to.deep.equal(['München, 02, DE']);
    expect(await labels("L'Aquila")).to.deep.equal(["L'Aquila, 01, IT"]);
  });

  it('returns the attribution stored in the index', async function () {
    const response = await request(handler, 'Roma');
    expect(response.code).to.equal(200);
    expect(response.headers['Cache-Control']).to.equal('no-store');
    expect(response.body.attribution).to.equal('GeoNames, CC BY 4.0');
  });

  it('treats FTS and SQL syntax in queries as text', async function () {
    const before = readFileSync(filename);
    for (const q of [
      '" OR *',
      "'; DROP TABLE places; --",
      'Rome OR München',
      '<img src=x>',
    ]) {
      const response = await request(handler, q);
      expect(response.code).to.equal(200);
      expect(response.body.results).to.deep.equal([]);
    }
    expect(readFileSync(filename).equals(before)).to.equal(true);
  });

  it('rejects malformed queries', async function () {
    for (const q of [
      undefined,
      [],
      ['Rome'],
      {},
      '',
      ' ',
      'x'.repeat(257),
      '91,0',
    ]) {
      expect((await request(handler, q)).code).to.equal(400);
    }
  });

  it('answers coordinates without an index, and never creates one', async function () {
    expect((await request(createSearchHandler(null), '1,2')).code).to.equal(
      200,
    );
    expect((await request(createSearchHandler(null), 'Rome')).code).to.equal(
      503,
    );
    const missing = path.join(directory, 'missing.sqlite');
    expect((await request(createSearchHandler(missing), 'Rome')).code).to.equal(
      503,
    );
    expect(existsSync(missing)).to.equal(false);
  });

  it('gives up on slow searches', async function () {
    let error;
    try {
      await searchWorker(filename, 'Rome', 1);
    } catch (e) {
      error = e;
    }
    expect(error?.message).to.match(/timed out/);
  });
});
