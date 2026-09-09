/**
 * Vendors `@maplibre/mlt` into src/vendor/mlt so plain Node can import it.
 *
 * The published `@maplibre/mlt` package is tsc output written in ESM syntax, but its
 * package.json has no "type": "module" and its relative specifiers carry no
 * file extension:
 *
 *   export { default as decodeTile } from "./mltDecoder";
 *
 * Node detects the ESM syntax, re-parses the file as a module, and then cannot
 * resolve "./mltDecoder" -- so the package only works behind a bundler, which is
 * how maplibre-gl consumes it. Appending the extension is a safe mechanical
 * transform here: the dist is plain tsc output with no directory imports.
 *
 * Run by `prepare`, alongside the copy:* scripts that vendor maplibre-gl and
 * leaflet into public/resources. The output is gitignored and regenerated on
 * install, so upgrading the decoder is a version bump and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '../node_modules/@maplibre/mlt/dist');
const out = path.join(__dirname, '../src/vendor/mlt');

/**
 * Appends .js to extensionless relative import specifiers.
 * @param {string} code - The module source.
 * @returns {string} The source with resolvable specifiers.
 */
function addExtensions(code) {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.\.?\/[^"']*?)\2/g,
    (match, keyword, quote, specifier) =>
      path.extname(specifier)
        ? match
        : `${keyword}${quote}${specifier}.js${quote}`,
  );
}

if (!fs.existsSync(src)) {
  throw new Error(`@maplibre/mlt is not installed: ${src} does not exist`);
}

fs.rmSync(out, { recursive: true, force: true });

let count = 0;
for (const entry of fs.readdirSync(src, {
  recursive: true,
  withFileTypes: true,
})) {
  if (entry.isDirectory() || !entry.name.endsWith('.js')) {
    continue;
  }
  const from = path.join(entry.parentPath, entry.name);
  const to = path.join(out, path.relative(src, from));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, addExtensions(fs.readFileSync(from, 'utf8')));
  count++;
}

// The package this is vendored from declares no module type, and tileserver-gl
// is ESM, so say so explicitly rather than relying on Node's syntax detection.
fs.writeFileSync(path.join(out, 'package.json'), '{ "type": "module" }\n');

console.log(`Vendored ${count} @maplibre/mlt modules to src/vendor/mlt`);
