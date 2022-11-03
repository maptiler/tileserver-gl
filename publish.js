#!/usr/bin/env node

'use strict';

/*
 * This script creates `tileserver-gl-light` version
 * (without native dependencies) and publishes
 * `tileserver-gl` and `tileserver-gl-light` to npm.
 */

/* CREATE tileserver-gl-light */

// SYNC THE `light` FOLDER

import child_process from 'child_process'
child_process.execSync('rsync -av --exclude="light" --exclude=".git" --exclude="node_modules" --delete . light', {
  stdio: 'inherit'
});

// PATCH `package.json`
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8'))

packageJson.name += '-light';
packageJson.description = 'Map tile server for JSON GL styles - serving vector tiles';
delete packageJson.dependencies['canvas'];
delete packageJson.dependencies['@maplibre/maplibre-gl-native'];
delete packageJson.dependencies['sharp'];

delete packageJson.optionalDependencies;
delete packageJson.devDependencies;

packageJson.engines.node = '>= 14.15.0';

const str = JSON.stringify(packageJson, undefined, 2);
fs.writeFileSync('light/package.json', str);
fs.renameSync('light/README_light.md', 'light/README.md');
fs.renameSync('light/Dockerfile_light', 'light/Dockerfile');
fs.renameSync('light/docker-entrypoint_light.sh', 'light/docker-entrypoint.sh');

// for Build tileserver-gl-light docker image, don't publish
if (process.argv.length > 2 && process.argv[2] == '--no-publish') {
  process.exit(0);
}

/* PUBLISH */

// tileserver-gl
child_process.execSync('npm publish . --access public', {
  stdio: 'inherit'
});

// tileserver-gl-light
child_process.execSync('npm publish ./light --access public', {
  stdio: 'inherit'
});
