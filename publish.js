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
delete packageJson.dependencies['@mapbox/mapbox-gl-native'];
delete packageJson.dependencies['sharp'];

delete packageJson.optionalDependencies;
delete packageJson.devDependencies;

var str = JSON.stringify(packageJson, undefined, 2);
fs.writeFileSync('light/package.json', str);
fs.renameSync('light/README_light.md', 'light/README.md');
fs.renameSync('light/Dockerfile_light', 'light/Dockerfile');

/* PUBLISH */

// tileserver-gl
require('child_process').execSync('npm publish .', {
  stdio: 'inherit'
});

// tileserver-gl-light
require('child_process').execSync('npm publish light', {
  stdio: 'inherit'
});
