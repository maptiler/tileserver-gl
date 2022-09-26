'use strict';

const path = require('path');
const fs = require('fs');

const clone = require('clone');
const express = require('express');
import {validate} from '@maplibre/maplibre-gl-style-spec';

const utils = require('./utils');

const httpTester = /^(http(s)?:)?\/\//;

const fixUrl = (req, url, publicUrl, opt_nokey, options) => {
  if (!url || (typeof url !== 'string') || url.indexOf('local://') !== 0) {
    return url;
  }
  const queryParams = [];
  if (!opt_nokey && req.query[options.auth.keyName]) {
    queryParams.unshift(`${options.auth.keyName}=${encodeURIComponent(req.query[options.auth.keyName])}`);
  }
  let query = '';
  if (queryParams.length) {
    query = `?${queryParams.join('&')}`;
  }
  return url.replace(
    'local://', utils.getPublicUrl(publicUrl, req)) + query;
};

module.exports = {
  init: (options, repo) => {
    const app = express().disable('x-powered-by');

    app.get('/:id/style.json', (req, res, next) => {
      const item = repo[req.params.id];
      if (!item) {
        return res.sendStatus(404);
      }
      const styleJSON_ = clone(item.styleJSON);
      for (const name of Object.keys(styleJSON_.sources)) {
        const source = styleJSON_.sources[name];
        source.url = fixUrl(req, source.url, item.publicUrl, false, options);
      }
      // mapbox-gl-js viewer cannot handle sprite urls with query
      if (styleJSON_.sprite) {
        styleJSON_.sprite = fixUrl(req, styleJSON_.sprite, item.publicUrl, false, options);
      }
      if (styleJSON_.glyphs) {
        styleJSON_.glyphs = fixUrl(req, styleJSON_.glyphs, item.publicUrl, false, options);
      }
      return res.send(styleJSON_);
    });

    app.get('/:id/sprite:scale(@[23]x)?.:format([\\w]+)', (req, res, next) => {
      const item = repo[req.params.id];
      if (!item || !item.spritePath) {
        return res.sendStatus(404);
      }
      const scale = req.params.scale,
        format = req.params.format;
      const filename = `${item.spritePath + (scale || '')}.${format}`;
      return fs.readFile(filename, (err, data) => {
        if (err) {
          console.log('Sprite load error:', filename);
          return res.sendStatus(404);
        } else {
          if (format === 'json') res.header('Content-type', 'application/json');
          if (format === 'png') res.header('Content-type', 'image/png');
          return res.send(data);
        }
      });
    });

    return app;
  },
  remove: (repo, id) => {
    delete repo[id];
  },
  add: (options, repo, params, id, publicUrl, reportTiles, reportFont) => {
    const styleFile = path.resolve(options.paths.styles, params.style);

    let styleFileData;
    try {
      styleFileData = fs.readFileSync(styleFile);
    } catch (e) {
      console.log('Error reading style file');
      return false;
    }

    let validationErrors = validate(styleFileData);
    if (validationErrors.length > 0) {
      console.log(`The file "${params.style}" is not valid a valid style file:`);
      for (const err of validationErrors) {
        console.log(`${err.line}: ${err.message}`);
      }
      return false;
    }
    let styleJSON = JSON.parse(styleFileData);

    for (const name of Object.keys(styleJSON.sources)) {
      const source = styleJSON.sources[name];
      const url = source.url;
      if (url && url.lastIndexOf('mbtiles:', 0) === 0) {
        let mbtilesFile = url.substring('mbtiles://'.length);
        const fromData = mbtilesFile[0] === '{' &&
          mbtilesFile[mbtilesFile.length - 1] === '}';

        if (fromData) {
          mbtilesFile = mbtilesFile.substr(1, mbtilesFile.length - 2);
          const mapsTo = (params.mapping || {})[mbtilesFile];
          if (mapsTo) {
            mbtilesFile = mapsTo;
          }
        }
        const identifier = reportTiles(mbtilesFile, fromData);
        if (!identifier) {
          return false;
        }
        source.url = `local://data/${identifier}.json`;
      }
    }

    for (let obj of styleJSON.layers) {
      if (obj['type'] === 'symbol') {
        const fonts = (obj['layout'] || {})['text-font'];
        if (fonts && fonts.length) {
          fonts.forEach(reportFont);
        } else {
          reportFont('Open Sans Regular');
          reportFont('Arial Unicode MS Regular');
        }
      }
    }

    let spritePath;

    if (styleJSON.sprite && !httpTester.test(styleJSON.sprite)) {
      spritePath = path.join(options.paths.sprites,
        styleJSON.sprite
          .replace('{style}', path.basename(styleFile, '.json'))
          .replace('{styleJsonFolder}', path.relative(options.paths.sprites, path.dirname(styleFile)))
      );
      styleJSON.sprite = `local://styles/${id}/sprite`;
    }
    if (styleJSON.glyphs && !httpTester.test(styleJSON.glyphs)) {
      styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';
    }

    repo[id] = {
      styleJSON,
      spritePath,
      publicUrl,
      name: styleJSON.name
    };

    return true;
  }
};
