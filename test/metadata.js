const testTileJSONArray = function(url) {
  describe(url + ' is array of TileJSONs', function() {
    it('is json', function(done) {
      supertest(app)
          .get(url)
          .expect(200)
          .expect('Content-Type', /application\/json/, done);
    });

    it('is non-empty array', function(done) {
      supertest(app)
          .get(url)
          .expect(function(res) {
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.be.greaterThan(0);
          }).end(done);
    });
  });
};

const testTileJSON = function(url) {
  describe(url + ' is TileJSON', function() {
    it('is json', function(done) {
      supertest(app)
          .get(url)
          .expect(200)
          .expect('Content-Type', /application\/json/, done);
    });

    it('has valid tiles', function(done) {
      supertest(app)
          .get(url)
          .expect(function(res) {
            expect(res.body.tiles.length).to.be.greaterThan(0);
          }).end(done);
    });
  });
};

describe('Metadata', function() {
  describe('/health', function() {
    it('returns 200', function(done) {
      supertest(app)
          .get('/health')
          .expect(200, done);
    });
  });

  testTileJSONArray('/index.json');
  testTileJSONArray('/rendered.json');
  testTileJSONArray('/data.json');

  describe('/styles.json is valid array', function() {
    it('is json', function(done) {
      supertest(app)
          .get('/styles.json')
          .expect(200)
          .expect('Content-Type', /application\/json/, done);
    });

    it('contains valid item', function(done) {
      supertest(app)
          .get('/styles.json')
          .expect(function(res) {
            expect(res.body).to.be.a('array');
            expect(res.body.length).to.be.greaterThan(0);
            expect(res.body[0].version).to.be.equal(8);
            expect(res.body[0].id).to.be.a('string');
            expect(res.body[0].name).to.be.a('string');
          }).end(done);
    });
  });

  testTileJSON('/styles/test-style.json');
  testTileJSON('/data/openmaptiles.json');
});
