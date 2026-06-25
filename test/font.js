describe('Fonts', function () {
  describe('/fonts.json', function () {
    it('returns 200 with application/json', function (done) {
      supertest(app)
        .get('/fonts.json')
        .expect(200)
        .expect('Content-Type', /application\/json/, done);
    });

    it('returns non-empty array of font names', function (done) {
      supertest(app)
        .get('/fonts.json')
        .expect(function (res) {
          expect(res.body).to.be.a('array');
          expect(res.body.length).to.be.greaterThan(0);
        })
        .end(done);
    });

    it('returns sorted font names', function (done) {
      supertest(app)
        .get('/fonts.json')
        .expect(function (res) {
          const sorted = [...res.body].sort();
          expect(res.body).to.deep.equal(sorted);
        })
        .end(done);
    });
  });

  describe('/fonts/:fontstack/:range.pbf', function () {
    describe('valid single font', function () {
      it('returns 200 with application/x-protobuf', function (done) {
        supertest(app)
          .get('/fonts/Open%20Sans%20Bold/0-255.pbf')
          .expect(200)
          .expect('Content-Type', /application\/x-protobuf/, done);
      });

      it('returns non-empty body', function (done) {
        supertest(app)
          .get('/fonts/Open%20Sans%20Bold/0-255.pbf')
          .expect(function (res) {
            const length = parseInt(res.headers['content-length'], 10);
            expect(length).to.be.greaterThan(0);
          })
          .end(done);
      });

      it('sets Last-Modified header', function (done) {
        supertest(app)
          .get('/fonts/Open%20Sans%20Regular/0-255.pbf')
          .expect(200)
          .expect(function (res) {
            expect(res.headers['last-modified']).to.be.a('string');
          })
          .end(done);
      });
    });

    describe('valid combined font stack', function () {
      it('returns 200 for comma-separated font stack', function (done) {
        supertest(app)
          .get('/fonts/Open%20Sans%20Bold%2COpen%20Sans%20Regular/0-255.pbf')
          .expect(200)
          .expect('Content-Type', /application\/x-protobuf/, done);
      });
    });

    describe('304 Not Modified caching', function () {
      it('returns 304 when If-Modified-Since matches Last-Modified', function (done) {
        supertest(app)
          .get('/fonts/Open%20Sans%20Bold/0-255.pbf')
          .end(function (err, res) {
            if (err) return done(err);
            const lastModified = res.headers['last-modified'];
            supertest(app)
              .get('/fonts/Open%20Sans%20Bold/0-255.pbf')
              .set('If-Modified-Since', lastModified)
              .expect(304, done);
          });
      });

      it('returns 200 when Cache-Control: no-cache overrides If-Modified-Since', function (done) {
        supertest(app)
          .get('/fonts/Open%20Sans%20Bold/0-255.pbf')
          .end(function (err, res) {
            if (err) return done(err);
            const lastModified = res.headers['last-modified'];
            supertest(app)
              .get('/fonts/Open%20Sans%20Bold/0-255.pbf')
              .set('If-Modified-Since', lastModified)
              .set('Cache-Control', 'no-cache')
              .expect(200, done);
          });
      });
    });

    describe('invalid requests return 400', function () {
      it('returns 400 for fully nonexistent font', function (done) {
        supertest(app).get('/fonts/Nonsense/0-255.pbf').expect(400, done);
      });

      it('returns 400 when all fonts in stack are nonexistent', function (done) {
        supertest(app)
          .get('/fonts/Nonsense1%2CNonsense2/0-255.pbf')
          .expect(400, done);
      });

      it('returns 400 when first font in stack is nonexistent', function (done) {
        supertest(app)
          .get('/fonts/Nonsense%2COpen%20Sans%20Bold/0-255.pbf')
          .expect(400, done);
      });
    });
  });
});
