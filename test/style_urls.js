const prefix = 'test-style';
const styleUrl = '/styles/' + prefix + '/style.json';

describe('Style URL rewriting', function () {
  describe('sprite URL', function () {
    it('is rewritten to absolute URL', function (done) {
      supertest(app)
        .get(styleUrl)
        .expect(function (res) {
          expect(res.body.sprite).to.match(/^http/);
        })
        .end(done);
    });

    it('contains correct style id path', function (done) {
      supertest(app)
        .get(styleUrl)
        .expect(function (res) {
          expect(res.body.sprite).to.include('/styles/' + prefix + '/sprite');
        })
        .end(done);
    });
  });

  describe('glyphs URL', function () {
    it('is rewritten to absolute URL', function (done) {
      supertest(app)
        .get(styleUrl)
        .expect(function (res) {
          expect(res.body.glyphs).to.match(/^http/);
        })
        .end(done);
    });

    it('preserves {fontstack} and {range} template placeholders', function (done) {
      supertest(app)
        .get(styleUrl)
        .expect(function (res) {
          expect(res.body.glyphs).to.include('{fontstack}');
          expect(res.body.glyphs).to.include('{range}');
        })
        .end(done);
    });
  });

  describe('source URLs', function () {
    it('all source tile URLs are absolute', function (done) {
      supertest(app)
        .get(styleUrl)
        .expect(function (res) {
          for (const name of Object.keys(res.body.sources)) {
            const source = res.body.sources[name];
            if (source.url) {
              expect(source.url).to.match(/^http/);
            }
          }
        })
        .end(done);
    });
  });
});

describe('styles.json listing', function () {
  it('each item has an absolute url field', function (done) {
    supertest(app)
      .get('/styles.json')
      .expect(function (res) {
        for (const item of res.body) {
          expect(item.url).to.match(/^http/);
          expect(item.url).to.include('/styles/');
          expect(item.url).to.include('/style.json');
        }
      })
      .end(done);
  });

  it('contains both configured styles', function (done) {
    supertest(app)
      .get('/styles.json')
      .expect(function (res) {
        const ids = res.body.map((s) => s.id);
        expect(ids).to.include('test-style');
        expect(ids).to.include('maptiler-basic');
      })
      .end(done);
  });
});

describe('Rendered TileJSON', function () {
  it(
    '/styles/' + prefix + '.json has tileSize 256 by default',
    function (done) {
      supertest(app)
        .get('/styles/' + prefix + '.json')
        .expect(200)
        .expect(function (res) {
          expect(res.body.tileSize).to.equal(256);
          expect(res.body.tiles).to.be.a('array');
          expect(res.body.tiles[0]).to.match(/^http/);
        })
        .end(done);
    },
  );

  it('/styles/512/' + prefix + '.json has tileSize 512', function (done) {
    supertest(app)
      .get('/styles/512/' + prefix + '.json')
      .expect(200)
      .expect(function (res) {
        expect(res.body.tileSize).to.equal(512);
        expect(res.body.tiles[0]).to.include('/512/');
      })
      .end(done);
  });

  it('/styles/non_existent.json returns 404', function (done) {
    supertest(app).get('/styles/non_existent.json').expect(404, done);
  });
});

describe('Listing endpoints content', function () {
  describe('/rendered.json', function () {
    it('items have absolute tile URLs', function (done) {
      supertest(app)
        .get('/rendered.json')
        .expect(function (res) {
          for (const item of res.body) {
            expect(item.tiles[0]).to.match(/^http/);
          }
        })
        .end(done);
    });
  });

  describe('/data.json', function () {
    it('contains configured data sources', function (done) {
      supertest(app)
        .get('/data.json')
        .expect(function (res) {
          expect(res.body.length).to.be.greaterThan(0);
        })
        .end(done);
    });

    it('items have absolute tile URLs', function (done) {
      supertest(app)
        .get('/data.json')
        .expect(function (res) {
          for (const item of res.body) {
            expect(item.tiles[0]).to.match(/^http/);
          }
        })
        .end(done);
    });
  });
});

describe('Health endpoint', function () {
  it('returns OK body when server is up', function (done) {
    supertest(app).get('/health').expect(200).expect('OK', done);
  });
});
