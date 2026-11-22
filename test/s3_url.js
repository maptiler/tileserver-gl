import { expect } from 'chai';
import {
  appendToS3Key,
  parseS3Url,
  resolveS3SpriteUrl,
  resolveS3Url,
} from '../src/s3.js';

describe('S3 URL parsing', function () {
  it('reads s3://bucket/key as AWS S3', function () {
    const parsed = parseS3Url('s3://my-bucket/tiles/world.pmtiles');
    expect(parsed.endpoint).to.equal(null);
    expect(parsed.bucket).to.equal('my-bucket');
    expect(parsed.key).to.equal('tiles/world.pmtiles');
  });

  it('reads a dotted first segment as an https endpoint', function () {
    const parsed = parseS3Url('s3://storage.example.com/my-bucket/a/b.json');
    expect(parsed.endpoint).to.equal('https://storage.example.com');
    expect(parsed.bucket).to.equal('my-bucket');
    expect(parsed.key).to.equal('a/b.json');
  });

  it('reads s3+http:// as a plain-http endpoint with a port', function () {
    const parsed = parseS3Url('s3+http://garage:3900/tiles/styles/a.json');
    expect(parsed.endpoint).to.equal('http://garage:3900');
    expect(parsed.bucket).to.equal('tiles');
    expect(parsed.key).to.equal('styles/a.json');
  });

  it('reads s3+https:// as an https endpoint without needing a dot', function () {
    const parsed = parseS3Url('s3+https://minio:9000/tiles/world.pmtiles');
    expect(parsed.endpoint).to.equal('https://minio:9000');
    expect(parsed.bucket).to.equal('tiles');
    expect(parsed.key).to.equal('world.pmtiles');
  });

  it('keeps an endpoint for s3+http:// even when s3UrlFormat is aws', function () {
    const parsed = parseS3Url('s3+http://10.0.0.5:3900/tiles/a.pmtiles', 'aws');
    expect(parsed.endpoint).to.equal('http://10.0.0.5:3900');
    expect(parsed.bucket).to.equal('tiles');
  });

  it('reads query parameters on s3+http:// URLs', function () {
    const parsed = parseS3Url(
      's3+http://garage:3900/tiles/a.pmtiles?profile=garage&region=garage',
    );
    expect(parsed.profile).to.equal('garage');
    expect(parsed.region).to.equal('garage');
    expect(parsed.key).to.equal('a.pmtiles');
  });

  it('rejects an s3+http:// URL without a key', function () {
    expect(() => parseS3Url('s3+http://garage:3900/tiles')).to.throw(
      /Invalid S3 URL format/,
    );
  });

  it('prefers config settings over URL parameters', function () {
    const resolved = resolveS3Url(
      's3+http://garage:3900/tiles/a.pmtiles?profile=url&region=url',
      { s3Profile: 'config', s3Region: 'config', requestPayer: false },
    );
    expect(resolved.profile).to.equal('config');
    expect(resolved.region).to.equal('config');
    expect(resolved.requestPayer).to.equal(false);
  });
});

describe('S3 sprite locations', function () {
  const style = 's3+http://garage:3900/tiles/styles/osm/style.json';

  it('puts {styleJsonFolder} sprites of an S3 style next to the style', function () {
    expect(resolveS3SpriteUrl('{styleJsonFolder}/sprite', style)).to.equal(
      's3+http://garage:3900/tiles/styles/osm/sprite',
    );
  });

  it('carries the style query string over to a sprite beside it', function () {
    expect(
      resolveS3SpriteUrl(
        '{styleJsonFolder}/{style}',
        `${style}?profile=garage`,
      ),
    ).to.equal('s3+http://garage:3900/tiles/styles/osm/style?profile=garage');
  });

  it('keeps an explicit S3 sprite URL, for local styles too', function () {
    expect(
      resolveS3SpriteUrl('s3://my-bucket/sprites/{style}', 'osm/bright.json'),
    ).to.equal('s3://my-bucket/sprites/bright');
  });

  it('leaves local and HTTP sprites alone', function () {
    expect(
      resolveS3SpriteUrl('{styleJsonFolder}/sprite', 'osm/style.json'),
    ).to.equal(null);
    expect(resolveS3SpriteUrl('sprites/osm', style)).to.equal(null);
    expect(resolveS3SpriteUrl('https://example.com/sprite', style)).to.equal(
      null,
    );
  });

  it('adds the scale and extension before the query string', function () {
    expect(
      appendToS3Key('s3+http://garage:3900/tiles/sprite?profile=x', '@2x.png'),
    ).to.equal('s3+http://garage:3900/tiles/sprite@2x.png?profile=x');
  });
});
