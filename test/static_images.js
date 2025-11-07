// test/static_images.js
import { describe, it } from 'mocha';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:8080';
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'visual');
const THRESHOLD = 0.1;
const MAX_DIFF_PIXELS = 100;

const tests = [
  { name: 'static-lat-lng', url: '/styles/basic-preview/static/8.5375,47.379,12/400x300.png' },
  { name: 'static-bearing', url: '/styles/basic-preview/static/8.5375,47.379,12@180/400x300.png' },
  { name: 'static-bearing-pitch', url: '/styles/basic-preview/static/8.5375,47.379,12@15,80/400x300.png' },
  { name: 'static-pixel-ratio-2x', url: '/styles/basic-preview/static/8.5375,47.379,11/200x150@2x.png' },
  { name: 'path-auto', url: '/styles/basic-preview/static/auto/400x300.png?fill=%23ff000080&path=8.53180,47.38713|8.53841,47.38248|8.53320,47.37457' },
  { name: 'encoded-path-auto', url: '/styles/basic-preview/static/auto/400x300.png?stroke=red&width=5&path=enc:wwg`Hyu}r@fNgn@hKyh@rR{ZlP{YrJmM`PJhNbH`P`VjUbNfJ|LzM~TtLnKxQZ' },
  { name: 'linecap-linejoin-round-round', url: '/styles/basic-preview/static/8.5375,47.379,12/400x300.png?width=30&linejoin=round&linecap=round&path=enc:uhd`Hqk_s@kiA}nAnfAqpA' },
  { name: 'linecap-linejoin-bevel-square', url: '/styles/basic-preview/static/8.5375,47.379,12/400x300.png?width=30&linejoin=bevel&linecap=square&path=enc:uhd`Hqk_s@kiA}nAnfAqpA' },
  { name: 'markers', url: '/styles/basic-preview/static/8.5375,47.379,12/400x300.png?marker=8.53180,47.38713|http://localhost:8080/images/logo.png|scale:0.3&marker=8.53180,47.37457|http://localhost:8080/images/logo.png|scale:0.3' },
];

function loadPNG(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

async function fetchImage(url) {
  const response = await fetch(BASE_URL + url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function compareImages(actualBuffer, expectedPath) {
  const actual = await loadPNG(actualBuffer);
  const expectedBuffer = fs.readFileSync(expectedPath);
  const expected = await loadPNG(expectedBuffer);

  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`Image dimensions don't match: ${actual.width}x${actual.height} vs ${expected.width}x${expected.height}`);
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const numDiffPixels = pixelmatch(
    actual.data,
    expected.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: THRESHOLD }
  );

  return { numDiffPixels, diff };
}

describe('Static Image Visual Regression Tests', function() {
  this.timeout(10000);

  tests.forEach(({ name, url }) => {
    it(`should match expected output: ${name}`, async function() {
      const expectedPath = path.join(FIXTURES_DIR, `${name}.png`);
      
      if (!fs.existsSync(expectedPath)) {
        this.skip();
        return;
      }

      const actualBuffer = await fetchImage(url);
      const { numDiffPixels, diff } = await compareImages(actualBuffer, expectedPath);

      if (numDiffPixels > MAX_DIFF_PIXELS) {
        const diffPath = path.join(FIXTURES_DIR, 'diffs', `${name}-diff.png`);
        fs.mkdirSync(path.dirname(diffPath), { recursive: true });
        fs.writeFileSync(diffPath, PNG.sync.write(diff));
        console.log(`Diff image saved to: ${diffPath}`);
      }

      expect(numDiffPixels).to.be.at.most(
        MAX_DIFF_PIXELS,
        `Expected at most ${MAX_DIFF_PIXELS} different pixels, but got ${numDiffPixels}`
      );
    });
  });
});

// Separate describe block for generation - use --grep to run this
describe('@generate Visual Fixtures', function() {
  this.timeout(10000);

  it('should generate all fixture images', async function() {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    console.log(`\nGenerating fixtures to ${FIXTURES_DIR}\n`);
    
    for (const { name, url } of tests) {
      try {
        const actualBuffer = await fetchImage(url);
        const fixturePath = path.join(FIXTURES_DIR, `${name}.png`);
        fs.writeFileSync(fixturePath, actualBuffer);
        console.log(`✓ Generated: ${name}.png (${actualBuffer.length} bytes)`);
      } catch (error) {
        console.error(`❌ Failed to generate ${name}:`, error.message);
        throw error;
      }
    }
    
    console.log(`\n✓ Successfully generated ${tests.length} fixture images!\n`);
  });
});
