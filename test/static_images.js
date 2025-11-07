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

// Check for the environment variable
const shouldGenerateFixtures = process.env.GENERATE_FIXTURES === 'true';

const tests = [
  {
    name: 'static-lat-lng',
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png',
  },
  {
    name: 'static-bearing',
    url: '/styles/test-style/static/8.5375,47.379,12@180/400x300.png',
  },
  {
    name: 'static-bearing-pitch',
    url: '/styles/test-style/static/8.5375,47.379,12@15,80/400x300.png',
  },
  {
    name: 'static-pixel-ratio-2x',
    url: '/styles/test-style/static/8.5375,47.379,11/200x150@2x.png',
  },
  {
    name: 'path-auto',
    url: '/styles/test-style/static/auto/400x300.png?fill=%23ff000080&path=8.53180,47.38713|8.53841,47.38248|8.53320,47.37457',
  },
  {
    name: 'encoded-path-auto',
    url: '/styles/test-style/static/auto/400x300.png?stroke=red&width=5&path=enc:wwg`Hyu}r@fNgn@hKyh@rR{ZlP{YrJmM`PJhNbH`P`VjUbNfJ|LzM~TtLnKxQZ',
  },
  {
    name: 'linecap-linejoin-round-round',
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?width=30&linejoin=round&linecap=round&path=enc:uhd`Hqk_s@kiA}nAnfAqpA',
  },
  {
    name: 'linecap-linejoin-bevel-square',
    url: '/styles/test-style/static/8.5375,47.379,12/400x300.png?width=30&linejoin=bevel&linecap=square&path=enc:uhd`Hqk_s@kiA}nAnfAqpA',
  },
];

/**
 *
 * @param buffer
 */
async function loadImageData(buffer) {
  const image = sharp(buffer);
  const { width, height } = await image.metadata();

  // Get raw RGBA pixel data
  const data = await image.ensureAlpha().raw().toBuffer();

  return { data, width, height };
}

/**
 *
 * @param url
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
 *
 * @param actualBuffer
 * @param expectedPath
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
// MOVED TO THE TOP TO ENSURE IT RUNS FIRST WHEN GENERATION IS ENABLED
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
  // THIS SUITE WILL BE SKIPPED DURING GENERATION BECAUSE NO TEST TITLES CONTAIN 'GENERATE'
  // AND IT'S NOT EXPLICITLY INCLUDED IN THE MOCHA CALL.
  // When running with `test:visual:generate`, this suite runs because you explicitly listed
  // `test/static_images.js` but the tests within are not filtered by --grep 'GENERATE'.
  // We will address this in the next suggestion.

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
