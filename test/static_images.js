// test/static_images.js
import { describe, it } from 'mocha';
import { expect } from 'chai';
import supertest from 'supertest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'visual');
const THRESHOLD = 0.1;
const MAX_DIFF_PIXELS = 100;

// Check for the environment variable to conditionally generate fixtures
const shouldGenerateFixtures = process.env.GENERATE_FIXTURES === 'true';

// --- Test Definitions ---
const tests = [
  {
    name: 'static-lat-lng',
    // Test default center format (lng,lat,zoom)
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png',
  },
  {
    name: 'static-bearing',
    // Test map bearing (rotation) at 180 degrees
    url: '/styles/test-style/static/8.5375,47.379,12@180/400x300.png',
  },
  {
    name: 'static-bearing-pitch',
    // Test map bearing and pitch (3D tilt)
    url: '/styles/test-style/static/8.5375,47.379,12@15,80/400x300.png',
  },
  {
    name: 'static-pixel-ratio-2x',
    // Test high-DPI rendering using @2x scale
    url: '/styles/test-style/static/8.5375,47.379,11/200x150@2x.png',
  },
  {
    name: 'path-auto',
    // Test path rendering with simple coordinates and auto-centering
    url: '/styles/test-style/static/auto/400x300.png?fill=%23ff000080&path=8.53180,47.38713|8.53841,47.38248|8.53320,47.37457',
  },
  {
    name: 'encoded-path-auto',
    // Test path rendering using encoded polyline and auto-centering
    url: '/styles/test-style/static/auto/400x300.png?stroke=red&width=5&path=enc:wwg`Hyu}r@fNgn@hKyh@rR{ZlP{YrJmM`PJhNbH`P`VjUbNfJ|LzM~TtLnKxQZ',
  },
  {
    name: 'linecap-linejoin-round-round',
    // Test custom line styling: round linejoin and round linecap
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?width=30&linejoin=round&linecap=round&path=enc:uhd`Hqk_s@kiA}nAnfAqpA',
  },
  {
    name: 'linecap-linejoin-bevel-square',
    // Test custom line styling: bevel linejoin and square linecap
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?width=30&linejoin=bevel&linecap=square&path=enc:uhd`Hqk_s@kiA}nAnfAqpA',
  },
  {
    name: 'static-markers',
    // Test multiple markers with scale and offset options
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?marker=8.531,47.38|marker-icon.png|scale:0.8&marker=8.545,47.375|marker-icon-2.png|offset:5,-10',
  },
  {
    name: 'static-bbox',
    // Test area-based map rendering using a bounding box (bbox)
    url: '/styles/test-style/static/8.5,47.35,8.6,47.4/400x300.png',
  },
  {
    name: 'static-multiple-paths',
    // Test rendering of multiple, individually styled path parameters
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?path=stroke:blue|width:8|fill:none|8.53,47.38|8.54,47.385&path=stroke:red|width:3|fill:yellow|8.53,47.37|8.54,47.375',
  },
  {
    name: 'static-path-latlng',
    // Test path rendering when the 'latlng' parameter reverses coordinate order
    url: '/styles/test-style/static/auto/400x300.png?latlng=true&path=47.38,8.53|47.385,8.54&fill=rgba(0,0,255,0.5)',
  },
  {
    name: 'static-path-border-stroke',
    // Test path border/halo functionality (line stroke with border halo)
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?path=stroke:yellow|width:10|border:black|borderwidth:2|8.53,47.37|8.54,47.38|8.53,47.39',
  },
  {
    name: 'static-path-border-isolated',
    // Test path border/halo in isolation (only border, no stroke)
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?path=border:black|borderwidth:10|8.53,47.37|8.54,47.38|8.53,47.39',
  },
  {
    name: 'static-border-global',
    // Test border functionality using global query parameters (less common, but valid)
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?stroke=yellow&width=10&border=black&borderwidth=2&path=8.53,47.37|8.54,47.38|8.53,47.39',
  },
];

/**
 * Loads an image buffer and extracts its raw pixel data.
 * @param {Buffer} buffer The raw image data buffer (e.g., from an HTTP response).
 * @returns {Promise<{data: Buffer, width: number, height: number}>} An object containing the raw RGBA pixel data, width, and height.
 */
async function loadImageData(buffer) {
  const image = sharp(buffer);
  const { width, height } = await image.metadata();

  // Get raw RGBA pixel data
  const data = await image.ensureAlpha().raw().toBuffer();

  return { data, width, height };
}

/**
 * Fetches an image from the test server URL.
 * @param {string} url The URL of the static image endpoint to fetch.
 * @returns {Promise<Buffer>} A promise that resolves with the image buffer.
 */
async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    supertest(global.app)
      .get(url)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .end((err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res.body);
        }
      });
  });
}

/**
 * Compares two images (actual result vs. expected fixture) and counts the differing pixels.
 * @param {Buffer} actualBuffer The buffer of the image rendered by the server.
 * @param {string} expectedPath The file path to the expected fixture image.
 * @returns {Promise<{numDiffPixels: number, diffBuffer: Buffer, width: number, height: number}>} Comparison results.
 */
async function compareImages(actualBuffer, expectedPath) {
  const actual = await loadImageData(actualBuffer);
  const expectedBuffer = fs.readFileSync(expectedPath);
  const expected = await loadImageData(expectedBuffer);

  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Image dimensions don't match: ${actual.width}x${actual.height} vs ${expected.width}x${expected.height}`,
    );
  }

  const diffBuffer = Buffer.alloc(actual.width * actual.height * 4);
  const numDiffPixels = pixelmatch(
    actual.data,
    expected.data,
    diffBuffer,
    actual.width,
    actual.height,
    { threshold: THRESHOLD },
  );

  return {
    numDiffPixels,
    diffBuffer,
    width: actual.width,
    height: actual.height,
  };
}

// Conditional definition: Only define this suite if the GENERATE_FIXTURES environment variable is true
if (shouldGenerateFixtures) {
  describe('GENERATE Visual Fixtures', function () {
    this.timeout(10000);

    it('should generate all fixture images', async function () {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
      console.log(`\nGenerating fixtures to ${FIXTURES_DIR}\n`);

      for (const { name, url } of tests) {
        try {
          const actualBuffer = await fetchImage(url);
          const fixturePath = path.join(FIXTURES_DIR, `${name}.png`);
          fs.writeFileSync(fixturePath, actualBuffer);
          console.log(
            `✓ Generated: ${name}.png (${actualBuffer.length} bytes)`,
          );
        } catch (error) {
          console.error(`❌ Failed to generate ${name}:`, error.message);
          throw error;
        }
      }

      console.log(
        `\n✓ Successfully generated ${tests.length} fixture images!\n`,
      );
    });
  });
}

describe('Static Image Visual Regression Tests', function () {
  this.timeout(10000);

  tests.forEach(({ name, url }) => {
    it(`should match expected output: ${name}`, async function () {
      const expectedPath = path.join(FIXTURES_DIR, `${name}.png`);

      if (!fs.existsSync(expectedPath)) {
        this.skip();
        return;
      }

      const actualBuffer = await fetchImage(url);
      const { numDiffPixels, diffBuffer, width, height } = await compareImages(
        actualBuffer,
        expectedPath,
      );

      if (numDiffPixels > MAX_DIFF_PIXELS) {
        const diffPath = path.join(FIXTURES_DIR, 'diffs', `${name}-diff.png`);
        fs.mkdirSync(path.dirname(diffPath), { recursive: true });

        await sharp(diffBuffer, {
          raw: {
            width,
            height,
            channels: 4,
          },
        })
          .png()
          .toFile(diffPath);

        console.log(`Diff image saved to: ${diffPath}`);
      }

      expect(numDiffPixels).to.be.at.most(
        MAX_DIFF_PIXELS,
        `Expected at most ${MAX_DIFF_PIXELS} different pixels, but got ${numDiffPixels}`,
      );
    });
  });
});
