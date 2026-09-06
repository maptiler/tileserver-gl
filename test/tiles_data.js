const testTile = function (prefix, z, x, y, status, format = 'pbf') {
  const path = '/data/' + prefix + '/' + z + '/' + x + '/' + y + '.' + format;
  it(path + ' returns ' + status, function (done) {
    const test = supertest(app).get(path);
    if (status) test.expect(status);
    if (status === 200 && format === 'pbf')
      test.expect('Content-Type', /application\/x-protobuf/);
    if (status === 200 && format === 'geojson')
      test.expect('Content-Type', /application\/json/);
    test.end(done);
  });
};

const prefix = 'openmaptiles';

describe('Vector tiles', function () {
  describe('existing tiles', function () {
    testTile(prefix, 0, 0, 0, 200);
    testTile(prefix, 14, 8581, 5738, 200);
  });

  describe('non-existent requests return 4xx', function () {
    testTile('non_existent', 0, 0, 0, 404);
    testTile(prefix, -1, 0, 0, 404); // err zoom
    testTile(prefix, 20, 0, 0, 404); // zoom out of bounds
    testTile(prefix, 0, 1, 0, 404);
    testTile(prefix, 0, 0, 1, 404);

    testTile(prefix, 14, 0, 0, 204); // non existent tile (vector tiles default to 204)
  });

  describe('GeoJSON format', function () {
    it(
      '/data/' + prefix + '/14/8581/5738.geojson returns 200 with GeoJSON',
      function (done) {
        supertest(app)
          .get('/data/' + prefix + '/14/8581/5738.geojson')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body.type).to.equal('FeatureCollection');
            expect(res.body.features).to.be.a('array');
          })
          .end(done);
      },
    );

    it(
      '/data/' + prefix + '/0/0/0.geojson returns 200 with GeoJSON',
      function (done) {
        supertest(app)
          .get('/data/' + prefix + '/0/0/0.geojson')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body.type).to.equal('FeatureCollection');
          })
          .end(done);
      },
    );

    it('returns 404 for invalid format on vector source', function (done) {
      supertest(app)
        .get('/data/' + prefix + '/0/0/0.png')
        .expect(404, done);
    });
  });
});

describe('Data TileJSON', function () {
  it('/data/' + prefix + '.json returns 200 with TileJSON', function (done) {
    supertest(app)
      .get('/data/' + prefix + '.json')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(function (res) {
        expect(res.body.tiles).to.be.a('array');
        expect(res.body.tiles.length).to.be.greaterThan(0);
        expect(res.body.minzoom).to.be.a('number');
        expect(res.body.maxzoom).to.be.a('number');
        expect(res.body.format).to.be.a('string');
      })
      .end(done);
  });

  it('/data/' + prefix + '.json tile URLs are absolute', function (done) {
    supertest(app)
      .get('/data/' + prefix + '.json')
      .expect(function (res) {
        const tileUrl = res.body.tiles[0];
        expect(tileUrl).to.match(/^http/);
        expect(tileUrl).to.include(prefix);
      })
      .end(done);
  });

  it('/data/non_existent.json returns 404', function (done) {
    supertest(app).get('/data/non_existent.json').expect(404, done);
  });
});
