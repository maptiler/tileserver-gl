import { server } from '../src/server.js';

const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'];

// Resolved against paths.root, which is the cwd (test_data) when the config is
// passed as an object rather than a file.
const DECORATOR = '../test/fixtures/data-decorator.js';

describe('data decorator', function () {
  let running;
  let listenerBaseline;

  before(async function () {
    globalThis.__dataDecoratorCalls = [];
    listenerBaseline = SIGNALS.map((eventName) => ({
      eventName,
      count: process.listeners(eventName).length,
    }));

    running = await server({
      config: {
        options: {
          paths: { fonts: 'fonts', styles: 'styles' },
          dataDecorator: DECORATOR,
        },
        // The style pulls in the same source through a mbtiles:// url, which
        // is the path serve_rendered decorates.
        styles: { 'test-style': { style: 'osm-bright/style.json' } },
        data: { openmaptiles: { mbtiles: 'zurich_switzerland.mbtiles' } },
      },
      port: 0,
      publicUrl: '/test/',
    });
    await running.startupPromise;
  });

  after(async function () {
    await running.cleanup();
    if (running.server.listening) {
      await new Promise((resolve) => running.server.close(resolve));
    }
    for (const { eventName, count } of listenerBaseline) {
      for (const listener of process.listeners(eventName).slice(count)) {
        process.removeListener(eventName, listener);
      }
    }
    delete globalThis.__dataDecoratorCalls;
  });

  // Regression test: the decorator path is absolute, and on Windows that means
  // it starts with a drive letter. import() rejects that as an unknown URL
  // scheme, and the failure is swallowed by a try/catch, so the decorator was
  // never called at all and the server started as though none was configured.
  it('loads and is called for a configured data source', function () {
    const calls = globalThis.__dataDecoratorCalls;
    expect(calls).to.be.an('array');
    expect(calls.length).to.be.greaterThan(0);
    expect(calls.map((c) => c.id)).to.include('openmaptiles');
  });

  it('receives the TileJSON it is meant to decorate', function () {
    const tilejsonCall = globalThis.__dataDecoratorCalls.find(
      (c) => c.type === 'tilejson' && c.id === 'openmaptiles',
    );
    expect(tilejsonCall, 'no tilejson call recorded').to.not.equal(undefined);
    expect(tilejsonCall.format).to.equal('pbf');
  });

  it('is applied to the local sources a style pulls in', function () {
    // serve_rendered decorates each local source of a style. That call carries
    // the source object, whose tiles url is the internal mbtiles:// form - the
    // only thing distinguishing it from the /data tilejson call for the same id.
    const styleSourceCall = globalThis.__dataDecoratorCalls.find(
      (c) =>
        c.type === 'tilejson' &&
        Array.isArray(c.tiles) &&
        c.tiles.some((t) => t.startsWith('mbtiles://openmaptiles/')),
    );
    expect(styleSourceCall, 'style source was never decorated').to.not.equal(
      undefined,
    );
    expect(styleSourceCall.id).to.equal('openmaptiles');
  });
});
