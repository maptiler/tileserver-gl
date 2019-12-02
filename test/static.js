var testStatic = function(prefix, q, format, status, scale, type, query) {
  if (scale) q += '@' + scale + 'x';
  var path = '/styles/' + prefix + '/static/' + q + '.' + format;
  if (query) {
    path += query;
  }
  it(path + ' returns ' + status, function(done) {
    var test = supertest(app).get(path);
    if (status) test.expect(status);
    if (type) test.expect('Content-Type', type);
    test.end(done);
  });
};

var testStaticPathCustomHeaders = function(path, expectCenterLat, expectCenterLng, expectZoom) {
  it(path + ' returns headers tileserver-center and tileserver-zoom', function(done) {
    var test = supertest(app).get(path);
    test.expect(200);
    test.end(function(err, res) {
      if (err) {
        return done(err);
      }
      res.headers['tileserver-center'].should.be.ok();
      res.headers['tileserver-zoom'].should.be.ok();

      var epsilon = 0.000005;
      var match = /^lat=([^,]+),lon=(.*)/.exec(res.headers['tileserver-center']);
      match.should.be.ok()
      match.should.have.lengthOf(3);

      var lat = parseFloat(match[1])
      lat.should.be.within(expectCenterLat - epsilon, expectCenterLat + epsilon);

      var lng = parseFloat(match[2])
      lng.should.be.within(expectCenterLng - epsilon, expectCenterLng + epsilon);

      var zoom = parseFloat(res.headers['tileserver-zoom'])
      zoom.should.be.within(expectZoom - epsilon, expectZoom + epsilon)

      done();
    })
  })
}

var prefix = 'test-style';

describe('Static endpoints', function() {
  describe('center-based', function() {
    describe('valid requests', function() {
      describe('various formats', function() {
        testStatic(prefix, '0,0,0/256x256', 'png', 200, undefined, /image\/png/);
        testStatic(prefix, '0,0,0/256x256', 'jpg', 200, undefined, /image\/jpeg/);
        testStatic(prefix, '0,0,0/256x256', 'jpeg', 200, undefined, /image\/jpeg/);
        testStatic(prefix, '0,0,0/256x256', 'webp', 200, undefined, /image\/webp/);
      });

      describe('different parameters', function() {
        testStatic(prefix, '0,0,0/300x300', 'png', 200, 2);
        testStatic(prefix, '0,0,0/300x300', 'png', 200, 3);

        testStatic(prefix, '0,0,1.5/256x256', 'png', 200);

        testStatic(prefix, '80,40,20/600x300', 'png', 200, 3);
        testStatic(prefix, '8.5,40.5,20/300x150', 'png', 200, 3);
        testStatic(prefix, '-8.5,-40.5,20/300x150', 'png', 200, 3);

        testStatic(prefix, '8,40,2@0,0/300x150', 'png', 200);
        testStatic(prefix, '8,40,2@180,45/300x150', 'png', 200, 2);
        testStatic(prefix, '8,40,2@10/300x150', 'png', 200, 3);
        testStatic(prefix, '8,40,2@10.3,20.4/300x300', 'png', 200);
        testStatic(prefix, '0,0,2@390,120/300x300', 'png', 200);
      });
    });

    describe('invalid requests return 4xx', function() {
      testStatic(prefix, '190,0,0/256x256', 'png', 400);
      testStatic(prefix, '0,86,0/256x256', 'png', 400);
      testStatic(prefix, '80,40,20/0x0', 'png', 400);
      testStatic(prefix, '0,0,0/256x256', 'gif', 400);
      testStatic(prefix, '0,0,0/256x256', 'png', 404, 1);

      testStatic(prefix, '0,0,-1/256x256', 'png', 404);
      testStatic(prefix, '0,0,0/256.5x256.5', 'png', 404);

      testStatic(prefix, '0,0,0,/256x256', 'png', 404);
      testStatic(prefix, '0,0,0,0,/256x256', 'png', 404);
    });
  });

  describe('area-based', function() {
    describe('valid requests', function() {
      describe('various formats', function() {
        testStatic(prefix, '-180,-80,180,80/10x10', 'png', 200, undefined, /image\/png/);
        testStatic(prefix, '-180,-80,180,80/10x10', 'jpg', 200, undefined, /image\/jpeg/);
        testStatic(prefix, '-180,-80,180,80/10x10', 'jpeg', 200, undefined, /image\/jpeg/);
        testStatic(prefix, '-180,-80,180,80/10x10', 'webp', 200, undefined, /image\/webp/);
      });

      describe('different parameters', function() {
        testStatic(prefix, '-180,-90,180,90/20x20', 'png', 200, 2);
        testStatic(prefix, '0,0,1,1/200x200', 'png', 200, 3);

        testStatic(prefix, '-280,-80,0,80/280x160', 'png', 200);
      });
    });

    describe('invalid requests return 4xx', function() {
      testStatic(prefix, '0,87,1,88/5x2', 'png', 400);

      testStatic(prefix, '0,0,1,1/1x1', 'gif', 400);

      testStatic(prefix, '-180,-80,180,80/0.5x2.6', 'png', 404);
    });
  });

  describe('autofit path', function() {
    describe('valid requests', function() {
      testStatic(prefix, 'auto/256x256', 'png', 200, undefined, /image\/png/, '?path=10,10|20,20');

      describe('different parameters', function() {
        testStatic(prefix, 'auto/20x20', 'png', 200, 2, /image\/png/, '?path=10,10|20,20');
        testStatic(prefix, 'auto/200x200', 'png', 200, 3, /image\/png/, '?path=-10,-10|-20,-20');
      });

      describe('custom response headers', function() {
        var url = '/styles/' + prefix + '/static/auto/800x600.png'
          + '?path=33.060812,-117.183899|48.759505,-98.151760|24.815825,-80.524364'
          + '&latlng=true&padding=0.2'
          ;
        testStaticPathCustomHeaders(
          url,
          37.746285, // expected lat
          -98.854131, // exected lng
          4.310567 // exected zoom
        );

        var url = '/styles/' + prefix + '/static/auto/800x600.png'
          + '?path=53.225355,-168.610992|69.559099,-141.079404'
          + '&latlng=true&padding=0.2'
          ;
        testStaticPathCustomHeaders(
          url,
          62.487815, // expected lat
          -154.845198, // exected lng
          4.103840 // exected zoom
        );
      });
    });

    describe('invalid requests return 4xx', function() {
      testStatic(prefix, 'auto/256x256', 'png', 400);
      testStatic(prefix, 'auto/256x256', 'png', 400, undefined, undefined, '?path=10,10');
      testStatic(prefix, 'auto/2560x2560', 'png', 400, undefined, undefined, '?path=10,10|20,20');
    });
  });
});
