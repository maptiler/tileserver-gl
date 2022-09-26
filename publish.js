#!/usr/bin/env node

'use strict';

/*
 * This script creates `tileserver-gl-light` version
 * (without native dependencies) and publishes
 * `tileserver-gl` and `tileserver-gl-light` to npm.
 */

/* CREATE tileserver-gl-light */

// SYNC THE `light` FOLDER
require('child_process').execSync('rsync -av --exclude="light" --exclude=".git" --exclude="node_modules" --delete . light', {
  stdio: 'inherit'
});

// PATCH `package.json`
var fs = require('fs');
var packageJson = require('./package');

packageJson.name += '-light';
packageJson.description = 'Map tile server for JSON GL styles - serving vector tiles';
delete packageJson.dependencies['canvas'];
delete packageJson.dependencies['@maplibre/maplibre-gl-native'];
delete packageJson.dependencies['sharp'];

delete packageJson.optionalDependencies;
delete packageJson.devDependencies;

packageJson.engines.node = '>= 10';

var str = JSON.stringify(packageJson, undefined, 2);
fs.writeFileSync('light/package.json', str);
fs.renameSync('light/README_light.md', 'light/README.md');
fs.renameSync('light/Dockerfile_light', 'light/Dockerfile');
fs.renameSync('light/docker-entrypoint_light.sh', 'light/docker-entrypoint.sh');

// for Build tileserver-gl-light docker image, don't publish
if (process.argv.length > 2 && process.argv[2] == "--no-publish") {
  process.exit(0)
}

/* PUBLISH */

// tileserver-gl
require('child_process').execSync('npm publish .', {
  stdio: 'inherit'
});

// tileserver-gl-light
require('child_process').execSync('npm publish light', {
  stdio: 'inherit'
});
