import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import supertest from 'supertest';
import { server } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testData = path.join(__dirname, '../test_data');
const bucket = 'tiles';

/**
 * Starts a minimal path-style S3 endpoint that serves test_data from one bucket.
 * @returns {Promise<{server: http.Server, port: number, requests: string[]}>} The running endpoint.
 */
async function startFakeS3() {
  const requests = [];
  const s3 = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    requests.push(pathname);
    const prefix = `/${bucket}/`;
    const key = pathname.startsWith(prefix)
      ? pathname.slice(prefix.length)
      : null;
    const file = key ? path.join(testData, key) : null;
    if (
      req.method !== 'GET' ||
      !file ||
      !file.startsWith(testData) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      res.end(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          `<Error><Code>NoSuchKey</Code><Message>No such key</Message><Key>${key}</Key></Error>`,
      );
      return;
    }
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Length': data.length,
      'Content-Type': 'application/octet-stream',
      ETag: `"${data.length}"`,
      'Last-Modified': new Date(0).toUTCString(),
    });
    res.end(data);
  });
  await new Promise((resolve) => s3.listen(0, '127.0.0.1', resolve));
  return { server: s3, port: s3.address().port, requests };
}

describe('Styles from S3', function () {
  let fakeS3;
  let running;
  let request;
  const savedEnv = {};
  const listenerCounts = {};
  const envVars = {
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
  };

  before(async function () {
    for (const [name, value] of Object.entries(envVars)) {
      // eslint-disable-next-line security/detect-object-injection -- name is from the fixed envVars list
      savedEnv[name] = process.env[name];
      // eslint-disable-next-line security/detect-object-injection -- name is from the fixed envVars list
      process.env[name] = value;
    }

    for (const eventName of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
      // eslint-disable-next-line security/detect-object-injection -- eventName is from a fixed list
      listenerCounts[eventName] = process.listeners(eventName).length;
    }

    fakeS3 = await startFakeS3();
    const endpoint = `s3+http://127.0.0.1:${fakeS3.port}/${bucket}`;
    running = await server({
      config: {
        options: {
          paths: { root: testData, fonts: 'fonts', styles: 'styles' },
        },
        styles: {
          's3-style': {
            style: `${endpoint}/styles/osm-bright/style.json`,
            s3Region: 'garage',
            tilejson: {
              type: 'overlay',
              bounds: [8.529446, 47.364758, 8.55232, 47.380539],
            },
          },
          's3-missing': {
            style: `${endpoint}/styles/missing/style.json`,
            s3Region: 'garage',
          },
        },
        data: {
          openmaptiles: { mbtiles: 'zurich_switzerland.mbtiles' },
        },
      },
      port: 0,
      publicUrl: '/test/',
    });
    await running.startupPromise;
    request = supertest(running.app);
  });

  after(async function () {
    if (running) {
      await running.cleanup();
      if (running.server.listening) {
        await new Promise((resolve) => running.server.close(resolve));
      }
      for (const [eventName, count] of Object.entries(listenerCounts)) {
        for (const listener of process.listeners(eventName).slice(count)) {
          process.removeListener(eventName, listener);
        }
      }
    }
    if (fakeS3) {
      await new Promise((resolve) => fakeS3.server.close(resolve));
    }
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        // eslint-disable-next-line security/detect-object-injection -- name is from the fixed envVars list
        delete process.env[name];
      } else {
        // eslint-disable-next-line security/detect-object-injection -- name is from the fixed envVars list
        process.env[name] = value;
      }
    }
  });

  it('serves the style read from S3', async function () {
    const res = await request.get('/styles/s3-style/style.json').expect(200);
    expect(res.body.layers).to.be.an('array');
    expect(res.body.layers.length).to.be.greaterThan(0);
    expect(res.body.sprite).to.match(/\/styles\/s3-style\/sprite$/);
    expect(res.body.sources.openmaptiles.url).to.match(
      /\/data\/openmaptiles\.json$/,
    );
  });

  it('serves sprites from the style folder in S3', async function () {
    const res = await request
      .get('/styles/s3-style/sprite.json')
      .expect(200)
      .expect('Content-Type', /application\/json/);
    const local = JSON.parse(
      fs.readFileSync(
        path.join(testData, 'styles/osm-bright/sprite.json'),
        'utf8',
      ),
    );
    expect(res.body).to.deep.equal(local);
    expect(fakeS3.requests).to.include(
      `/${bucket}/styles/osm-bright/sprite.json`,
    );
  });

  it('serves scaled sprite images from S3', async function () {
    const res = await request
      .get('/styles/s3-style/sprite@2x.png')
      .buffer(true)
      .expect(200)
      .expect('Content-Type', /image\/png/);
    const local = fs.readFileSync(
      path.join(testData, 'styles/osm-bright/sprite@2x.png'),
    );
    expect(Buffer.compare(res.body, local)).to.equal(0);
  });

  it('renders tiles with the sprite read from S3', async function () {
    await request
      .get('/styles/s3-style/256/14/8590/5747.png')
      .expect(200)
      .expect('Content-Type', /image\/png/);
    expect(fakeS3.requests).to.include(
      `/${bucket}/styles/osm-bright/sprite.png`,
    );
  });

  it('skips a style whose S3 object is missing', async function () {
    await request.get('/styles/s3-missing/style.json').expect(404);
  });
});
