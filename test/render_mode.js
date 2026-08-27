import assert from 'node:assert/strict';
import { getMapLibreRenderZoom } from '../src/render_mode.js';

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
