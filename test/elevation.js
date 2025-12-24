// Test terrain tiles elevation values:
// Zoom 0: tile (0,0) = 100m (entire world)
// Zoom 1: tile (0,0) = 200m (top-left, lon<0 lat>0)
//         tile (1,0) = 500m (top-right, lon>0 lat>0)
//         tile (0,1) = 1000m (bottom-left, lon<0 lat<0)
//         tile (1,1) = 2500m (bottom-right, lon>0 lat<0)

describe('Elevation API', function () {
  describe('non-existent data source', function () {
    it('/data/non_existent/elevation/0/0/0 returns 404', function (done) {
      supertest(app)
        .get('/data/non_existent/elevation/0/0/0')
        .expect(404)
        .end(done);
    });
  });

  describe('data source without encoding', function () {
    it('/data/openmaptiles/elevation/0/0/0 returns 400 missing encoding', function (done) {
      supertest(app)
        .get('/data/openmaptiles/elevation/0/0/0')
        .expect(400)
        .expect('Missing tileJSON.encoding')
        .end(done);
    });
  });

  describe('terrain data source', function () {
    describe('valid tile requests with correct elevation values', function () {
      it('/data/terrain/elevation/0/0/0 returns elevation 100m', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/0/0/0')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.be.an('object');
            expect(res.body).to.have.property('elevation', 100);
            expect(res.body).to.have.property('z', 0);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('/data/terrain/elevation/1/0/0 returns elevation 200m (top-left)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/0/0')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 200);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('/data/terrain/elevation/1/1/0 returns elevation 500m (top-right)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/1/0')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('/data/terrain/elevation/1/0/1 returns elevation 1000m (bottom-left)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/0/1')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 1000);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 1);
          })
          .end(done);
      });

      it('/data/terrain/elevation/1/1/1 returns elevation 2500m (bottom-right)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/1/1')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 2500);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 1);
          })
          .end(done);
      });
    });

    describe('coordinate-based requests with correct elevation values', function () {
      // Note: coordinates must be non-integer to be treated as lon/lat, not tile x/y
      it('top-right quadrant (lon>0, lat>0) returns 500m', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/45.5/45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
            expect(res.body).to.have.property('long', 45.5);
            expect(res.body).to.have.property('lat', 45.5);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 0);
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
            expect(res.body).to.have.property('long', -45.5);
            expect(res.body).to.have.property('lat', 45.5);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 0);
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
            expect(res.body).to.have.property('long', -45.5);
            expect(res.body).to.have.property('lat', -45.5);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 1);
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
            expect(res.body).to.have.property('long', 45.5);
            expect(res.body).to.have.property('lat', -45.5);
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 1);
          })
          .end(done);
      });
    });

    describe('tile boundary conditions', function () {
      // At zoom 1, tiles are divided at lon=0 and lat=0
      // Testing coordinates very close to these boundaries

      it('just east of prime meridian (lon=0.001) returns top-right tile (500m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/0.001/45')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('just west of prime meridian (lon=-0.001) returns top-left tile (200m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/-0.001/45')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 200);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('just north of equator (lat=0.001) returns top-right tile (500m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/45/0.001')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('just south of equator (lat=-0.001) returns bottom-right tile (2500m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/45/-0.001')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 2500);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 1);
          })
          .end(done);
      });

      it('near corner - just NE of origin (lon=0.001, lat=0.001) returns top-right (500m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/0.001/0.001')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('near corner - just NW of origin (lon=-0.001, lat=0.001) returns top-left (200m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/-0.001/0.001')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 200);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 0);
          })
          .end(done);
      });

      it('near corner - just SE of origin (lon=0.001, lat=-0.001) returns bottom-right (2500m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/0.001/-0.001')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 2500);
            expect(res.body).to.have.property('x', 1);
            expect(res.body).to.have.property('y', 1);
          })
          .end(done);
      });

      it('near corner - just SW of origin (lon=-0.001, lat=-0.001) returns bottom-left (1000m)', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/-0.001/-0.001')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 1000);
            expect(res.body).to.have.property('x', 0);
            expect(res.body).to.have.property('y', 1);
          })
          .end(done);
      });

      it('at origin (lon=0, lat=0) returns consistent tile', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/0/0')
          .expect(200)
          .expect(function (res) {
            // At exactly 0,0 it should pick one of the tiles consistently
            expect(res.body.elevation).to.be.oneOf([200, 500, 1000, 2500]);
          })
          .end(done);
      });

      it('near western edge (lon=-179.999) returns correct tile', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/-179.999/45')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 200);
            expect(res.body).to.have.property('x', 0);
          })
          .end(done);
      });

      it('near eastern edge (lon=179.999) returns correct tile', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/1/179.999/45')
          .expect(200)
          .expect(function (res) {
            expect(res.body).to.have.property('elevation', 500);
            expect(res.body).to.have.property('x', 1);
          })
          .end(done);
      });
    });

    describe('zoom clamping', function () {
      it('zoom is clamped to maxzoom for coordinate requests', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/20/45.5/45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('z', 1);
            expect(res.body).to.have.property('elevation', 500);
          })
          .end(done);
      });

      it('zoom is clamped to minzoom for coordinate requests', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/-5/45.5/45.5')
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(function (res) {
            expect(res.body).to.have.property('z', 0);
            expect(res.body).to.have.property('elevation', 100);
          })
          .end(done);
      });
    });

    describe('invalid tile requests', function () {
      it('tile out of bounds returns 404', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/0/1/0')
          .expect(404)
          .expect('Out of bounds')
          .end(done);
      });

      it('zoom below minzoom for tile request returns 404', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/-1/0/0')
          .expect(404)
          .expect('Out of bounds')
          .end(done);
      });

      it('zoom above maxzoom for tile request returns 404', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/2/0/0')
          .expect(404)
          .expect('Out of bounds')
          .end(done);
      });

      it('negative x coordinate returns 404', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/0/-1/0')
          .expect(404)
          .expect('Out of bounds')
          .end(done);
      });

      it('negative y coordinate returns 404', function (done) {
        supertest(app)
          .get('/data/terrain/elevation/0/0/-1')
          .expect(404)
          .expect('Out of bounds')
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
  });
});
