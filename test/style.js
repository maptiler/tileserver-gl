const testIs = function(url, type, status) {
  it(url + ' return ' + (status || 200) + ' and is ' + type.toString(),
      function(done) {
        supertest(app)
            .get(url)
            .expect(status || 200)
            .expect('Content-Type', type, done);
      });
};

const prefix = 'test-style';

describe('Styles', function() {
  describe('/styles/' + prefix + '/style.json is valid style', function() {
    testIs('/styles/' + prefix + '/style.json', /application\/json/);

    it('contains expected properties', function(done) {
      supertest(app)
          .get('/styles/' + prefix + '/style.json')
          .expect(function(res) {
            expect(res.body.version).to.be.equal(8);
            expect(res.body.name).to.be.a('string');
            expect(res.body.sources).to.be.a('object');
            expect(res.body.glyphs).to.be.a('string');
            expect(res.body.sprite).to.be.a('string');
            expect(res.body.sprite).to.be.equal('/test/styles/test-style/sprite');
            expect(res.body.layers).to.be.a('array');
          }).end(done);
    });
  });
  describe('/styles/streets/style.json is not served', function() {
    testIs('/styles/streets/style.json', /./, 404);
  });

  describe('/styles/' + prefix + '/sprite[@2x].{format}', function() {
    testIs('/styles/' + prefix + '/sprite.json', /application\/json/);
    testIs('/styles/' + prefix + '/sprite@2x.json', /application\/json/);
    testIs('/styles/' + prefix + '/sprite.png', /image\/png/);
    testIs('/styles/' + prefix + '/sprite@2x.png', /image\/png/);
  });
});

describe('Fonts', function() {
  testIs('/fonts/Open Sans Bold/0-255.pbf', /application\/x-protobuf/);
  testIs('/fonts/Open Sans Regular/65280-65535.pbf', /application\/x-protobuf/);
  testIs('/fonts/Open Sans Bold,Open Sans Regular/0-255.pbf',
      /application\/x-protobuf/);
  testIs('/fonts/Nonsense,Open Sans Bold/0-255.pbf', /./, 400);

  testIs('/fonts/Nonsense/0-255.pbf', /./, 400);
  testIs('/fonts/Nonsense1,Nonsense2/0-255.pbf', /./, 400);
});
