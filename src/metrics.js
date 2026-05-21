// src/metrics.js
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'tileserver_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'tileserver_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const tilesServedTotal = new Counter({
  name: 'tileserver_tiles_served_total',
  help: 'Total number of tiles served',
  labelNames: ['type', 'name'],
  registers: [registry],
});

export const tileRenderDuration = new Histogram({
  name: 'tileserver_tile_render_duration_seconds',
  help: 'Tile pipeline duration in seconds (includes pool wait + render + encode)',
  labelNames: ['name', 'zoom'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const tileErrorsTotal = new Counter({
  name: 'tileserver_tile_errors_total',
  help: 'Total number of tile errors',
  labelNames: ['type', 'name'],
  registers: [registry],
});

export const renderPoolSize = new Gauge({
  name: 'tileserver_render_pool_size',
  help: 'Total objects in render pool',
  labelNames: ['name'],
  registers: [registry],
});

export const renderPoolActive = new Gauge({
  name: 'tileserver_render_pool_active',
  help: 'Active (borrowed) objects in render pool',
  labelNames: ['name'],
  registers: [registry],
});

export const renderPoolWaiting = new Gauge({
  name: 'tileserver_render_pool_waiting',
  help: 'Clients waiting for a render pool object',
  labelNames: ['name'],
  registers: [registry],
});
