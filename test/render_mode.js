import assert from 'node:assert/strict';
import {
  getMapLibreRenderZoom,
  getStaticOverlayZoom,
} from '../src/render_mode.js';

describe('MapLibre render zoom', function () {
  it('uses the overlay-aligned zoom for a 512px static map', function () {
    assert.equal(getMapLibreRenderZoom(12, 512, 'static'), 11);
  });

  it('uses the overlay-aligned zoom for a 400px static map', function () {
    assert.equal(getMapLibreRenderZoom(12, 400, 'static'), 11);
  });

  it('uses the 256px tile zoom for a 256px tile', function () {
    assert.equal(getMapLibreRenderZoom(12, 256, 'tile'), 11);
  });

  it('uses the 512px tile zoom for a 512px tile', function () {
    assert.equal(getMapLibreRenderZoom(12, 512, 'tile'), 12);
  });

  it('rejects an unsupported render mode', function () {
    assert.throws(
      () => getMapLibreRenderZoom(12, 512, 'preview'),
      /Unsupported render mode: preview/,
    );
  });
});

describe('Static overlay zoom', function () {
  it('raises the zoom when the world would not fill the viewport height', function () {
    assert.equal(getStaticOverlayZoom(1, 600, 600), Math.log2(600 / 256));
  });

  it('does not raise the zoom for a wide but short viewport', function () {
    assert.equal(getStaticOverlayZoom(1, 1000, 500), 1);
  });

  it('preserves a requested zoom above the viewport minimum', function () {
    assert.equal(getStaticOverlayZoom(12, 1000, 1000), 12);
  });

  it('preserves the dedicated 256px zoom-zero render path', function () {
    assert.equal(getStaticOverlayZoom(0, 256, 256), 0);
  });
});
