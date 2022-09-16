const testStatic = function(prefix, q, format, status, scale, type, query) {
  if (scale) q += '@' + scale + 'x';
  let path = '/styles/' + prefix + '/static/' + q + '.' + format;
  if (query) {
    path += query;
  }
  it(path + ' returns ' + status, function(done) {
    const test = supertest(app).get(path);
    if (status) test.expect(status);
    if (type) test.expect('Content-Type', type);
    test.end(done);
  });
};

const prefix = 'test-style';

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
    });

    describe('invalid requests return 4xx', function() {
      testStatic(prefix, 'auto/256x256', 'png', 400);
      testStatic(prefix, 'auto/256x256', 'png', 400, undefined, undefined, '?path=10,10');
      testStatic(prefix, 'auto/2560x2560', 'png', 400, undefined, undefined, '?path=10,10|20,20');
    });
  });
});
