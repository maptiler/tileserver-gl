// Test terrain tiles elevation values:
// Zoom 0: tile (0,0) = 100m (entire world)
// Zoom 1: tile (0,0) = 200m (top-left, lon<0 lat>0)
//         tile (1,0) = 500m (top-right, lon>0 lat>0)
//         tile (0,1) = 1000m (bottom-left, lon<0 lat<0)
//         tile (1,1) = 2500m (bottom-right, lon>0 lat<0)

describe('Elevation API', function () {
  describe('GET endpoint errors', function () {
    it('returns 404 for non-existent data source', function (done) {
      supertest(app)
        .get('/data/non_existent/elevation/0/0/0')
        .expect(404)
        .end(done);
    });

    it('returns 400 for data source without encoding', function (done) {
      supertest(app)
        .get('/data/openmaptiles/elevation/0/0/0')
        .expect(400)
        .expect('Missing tileJSON.encoding')
        .end(done);
    });

    it('returns 400 for invalid coordinates', function (done) {
      supertest(app)
        .get('/data/terrain/elevation/1/invalid/45')
        .expect(400)
        .expect('Invalid coordinates')
        .end(done);
    });
  });

  describe('terrain data source', function () {
    describe('coordinate-based GET requests', function () {
      it('top-right quadrant (lon>0, lat>0) returns 500m', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/45.5/45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
          })
          .end(done);
      });

      it('top-left quadrant (lon<0, lat>0) returns 200m', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/-45.5/45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 200);
          })
          .end(done);
      });

      it('bottom-left quadrant (lon<0, lat<0) returns 1000m', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/-45.5/-45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 1000);
          })
          .end(done);
      });

      it('bottom-right quadrant (lon>0, lat<0) returns 2500m', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/45.5/-45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 2500);
          })
          .end(done);
      });

      it('zoom 0 returns 100m for any coordinate', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/0/45.5/45.5')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 100);
          })
          .end(done);
      });
    });

    describe('batch elevation requests', function () {
      it('returns elevations for multiple points in different tiles', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [
              { lon: 45.5, lat: 45.5, z: 1 }, // top-right: 500m
              { lon: -45.5, lat: 45.5, z: 1 }, // top-left: 200m
              { lon: -45.5, lat: -45.5, z: 1 }, // bottom-left: 1000m
              { lon: 45.5, lat: -45.5, z: 1 }, // bottom-right: 2500m
            ],
          })
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.length(4);
            expect(res.body[0]).to.equal(500);
            expect(res.body[1]).to.equal(200);
            expect(res.body[2]).to.equal(1000);
            expect(res.body[3]).to.equal(2500);
          })
          .end(done);
      });

      it('returns elevations for multiple points in the same tile', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [
              { lon: 45.5, lat: 45.5, z: 1 }, // top-right tile
              { lon: 90, lat: 30, z: 1 }, // also top-right tile
              { lon: 10, lat: 10, z: 1 }, // also top-right tile
            ],
          })
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.length(3);
            // All points are in top-right tile which has 500m elevation
            expect(res.body[0]).to.equal(500);
            expect(res.body[1]).to.equal(500);
            expect(res.body[2]).to.equal(500);
          })
          .end(done);
      });

      it('supports different zoom levels per point', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [
              { lon: 45.5, lat: 45.5, z: 0 }, // zoom 0: 100m (whole world)
              { lon: 45.5, lat: 45.5, z: 1 }, // zoom 1: 500m (top-right)
            ],
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.length(2);
            expect(res.body[0]).to.equal(100);
            expect(res.body[1]).to.equal(500);
          })
          .end(done);
      });

      it('clamps zoom to maxzoom', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [{ lon: 45.5, lat: 45.5, z: 20 }], // maxzoom is 1
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body[0]).to.equal(500);
          })
          .end(done);
      });

      it('clamps zoom to minzoom', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [{ lon: 45.5, lat: 45.5, z: -5 }], // minzoom is 0
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            // At zoom 0, entire world is one tile with 100m elevation
            expect(res.body[0]).to.equal(100);
          })
          .end(done);
      });

      it('returns 400 for invalid point', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [{ lon: 'invalid', lat: 45.5, z: 1 }],
          })
          .expect(400)
          .end(done);
      });

      it('returns 400 for missing points array', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({})
          .expect(400)
          .expect('Missing or empty points array')
          .end(done);
      });

      it('returns 400 for empty points array', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({ points: [] })
          .expect(400)
          .expect('Missing or empty points array')
          .end(done);
      });

      it('returns 404 for non-existent data source', function (done) {
        supertest(app)
          .post('/data/non_existent/elevation')
          .send({ points: [{ lon: 45.5, lat: 45.5, z: 1 }] })
          .expect(404)
          .end(done);
      });

      it('returns 400 for data source without encoding', function (done) {
        supertest(app)
          .post('/data/openmaptiles/elevation')
          .send({ points: [{ lon: 45.5, lat: 45.5, z: 1 }] })
          .expect(400)
          .expect('Missing tileJSON.encoding')
          .end(done);
      });
    });

    describe('bilinear interpolation', function () {
      // Test terrain tiles have uniform elevation per tile at zoom 1:
      // tile (0,0) = 200m, tile (1,0) = 500m
      // tile (0,1) = 1000m, tile (1,1) = 2500m
      // At zoom 0, single tile with 100m

      it('returns exact elevation for points well within a tile', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [{ lon: 90, lat: 45, z: 1 }],
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body[0]).to.equal(500);
          })
          .end(done);
      });

      it('interpolates between tiles for points near lon=0 boundary', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [
              // Point in center of tile - no interpolation needed
              { lon: 90, lat: 45, z: 1 },
              // Point near right edge of tile (0,0), interpolates with tile (1,0)
              // tile (0,0) = 200m, tile (1,0) = 500m
              { lon: -0.001, lat: 45, z: 1 },
            ],
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.length(2);
            // Center of tile should be exact
            expect(res.body[0]).to.equal(500);
            // Near edge: interpolated value ~499.15 (mostly tile 1,0's 500m with small influence from tile 0,0's 200m)
            expect(res.body[1]).to.be.closeTo(499.15, 0.1);
          })
          .end(done);
      });

      it('efficiently batches tile fetches for multiple points in same tile', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [
              { lon: 45, lat: 45, z: 1 },
              { lon: 60, lat: 50, z: 1 },
              { lon: 90, lat: 30, z: 1 },
              { lon: 120, lat: 60, z: 1 },
            ],
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.length(4);
            // All points in top-right tile (500m)
            res.body.forEach((elev) => {
              expect(elev).to.equal(500);
            });
          })
          .end(done);
      });

      it('handles points at tile edges requiring adjacent tile fetch', function (done) {
        supertest(app)
          .post('/data/terrain/elevation')
          .send({
            points: [
              // Very close to right edge of tile (0,0), needs tile (1,0)
              // tile (0,0) = 200m, tile (1,0) = 500m
              { lon: -0.0001, lat: 45, z: 1 },
              // Very close to bottom edge of tile (1,0), needs tile (1,1)
              // tile (1,0) = 500m, tile (1,1) = 2500m
              { lon: 90, lat: 0.0001, z: 1 },
            ],
          })
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.length(2);
            // First point: very close to boundary, ~499.91 (almost entirely 500m)
            expect(res.body[0]).to.be.closeTo(499.91, 0.1);
            // Second point: very close to equator boundary, ~2499.43
            expect(res.body[1]).to.be.closeTo(2499.43, 0.1);
          })
          .end(done);
      });
    });
  });
});
