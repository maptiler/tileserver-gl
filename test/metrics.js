'use strict';

import { server } from '../src/server.js';
import http from 'node:http';

/**
 * Helper: GET a URL, returns { statusCode, headers, body }
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body }),
      );
    }).on('error', reject);
  });
}

describe('Prometheus metrics', function () {
  this.timeout(15000);

  let metricsServer;
  let tileServer;

  before(async function () {
    const running = await server({
      configPath: 'config.json',
      port: 8889,
      publicUrl: '/test/',
      metrics: true,
      metricsPort: 9999,
    });
    tileServer = running.server;
    metricsServer = running.metricsServer;
    await running.startupPromise;
    // give metrics server a moment if needed
    await new Promise((r) => setTimeout(r, 100));
  });

  after(function () {
    tileServer?.close();
    metricsServer?.close();
  });

  it('GET /metrics returns 200 with text/plain content type', async function () {
    const { statusCode, headers } = await httpGet('http://localhost:9999/metrics');
    expect(statusCode).to.equal(200);
    expect(headers['content-type']).to.include('text/plain');
  });

  it('GET /metrics body includes expected metric names', async function () {
    const { body } = await httpGet('http://localhost:9999/metrics');
    expect(body).to.include('tileserver_http_requests_total');
    expect(body).to.include('tileserver_tiles_served_total');
    expect(body).to.include('tileserver_render_pool_size');
  });

  it('making a request increments tileserver_http_requests_total', async function () {
    await httpGet('http://localhost:8889/test/health');
    const { body } = await httpGet('http://localhost:9999/metrics');
    const match = body.match(/tileserver_http_requests_total\{[^}]+\}\s+(\d+)/);
    expect(match).to.not.be.null;
    expect(parseInt(match[1], 10)).to.be.greaterThan(0);
  });

  it('metrics server does NOT start when metrics: false', function (done) {
    server({
      configPath: 'config.json',
      port: 8890,
      publicUrl: '/test/',
      metrics: false,
      metricsPort: 9998,
    }).then((running) => {
      running.startupPromise.then(() => {
        setTimeout(() => {
          http
            .get('http://localhost:9998/metrics', () => {
              running.server.close();
              done(new Error('Should not have connected'));
            })
            .on('error', (err) => {
              running.server.close();
              expect(err.code).to.equal('ECONNREFUSED');
              done();
            });
        }, 200);
      });
    });
  });
});
