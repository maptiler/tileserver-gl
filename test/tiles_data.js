const testTile = function(prefix, z, x, y, status) {
  const path = '/data/' + prefix + '/' + z + '/' + x + '/' + y + '.pbf';
  it(path + ' returns ' + status, function(done) {
    const test = supertest(app).get(path);
    if (status) test.expect(status);
    if (status == 200) test.expect('Content-Type', /application\/x-protobuf/);
    test.end(done);
  });
};

const prefix = 'openmaptiles';

describe('Vector tiles', function() {
  describe('existing tiles', function() {
    testTile(prefix, 0, 0, 0, 200);
    testTile(prefix, 14, 8581, 5738, 200);
  });

  describe('non-existent requests return 4xx', function() {
    testTile('non_existent', 0, 0, 0, 404);
    testTile(prefix, -1, 0, 0, 404); // err zoom
    testTile(prefix, 20, 0, 0, 404); // zoom out of bounds
    testTile(prefix, 0, 1, 0, 404);
    testTile(prefix, 0, 0, 1, 404);

    testTile(prefix, 14, 0, 0, 204); // non existent tile
  });
});
