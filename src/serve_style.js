'use strict';

var path = require('path'),
    fs = require('fs');

var clone = require('clone'),
    express = require('express');


module.exports = function(options, repo, params, id, reportTiles, reportFont) {
  var app = express().disable('x-powered-by');

  var styleFile = path.resolve(options.paths.styles, params.style);

  var styleJSON = clone(require(styleFile));
  Object.keys(styleJSON.sources).forEach(function(name) {
    var source = styleJSON.sources[name];
    var url = source.url;
    if (url && url.lastIndexOf('mbtiles:', 0) === 0) {
      var mbtilesFile = url.substring('mbtiles://'.length);
      var fromData = mbtilesFile[0] == '{' &&
                     mbtilesFile[mbtilesFile.length - 1] == '}';

      if (fromData) {
        mbtilesFile = mbtilesFile.substr(1, mbtilesFile.length - 2);
        var mapsTo = (params.mapping || {})[mbtilesFile];
        if (mapsTo) {
          mbtilesFile = mapsTo;
        }
      }
      var identifier = reportTiles(mbtilesFile, fromData);
      source.url = 'local://data/' + identifier + '.json';
    }
  });

  styleJSON.layers.forEach(function(obj) {
    if (obj['type'] == 'symbol') {
      var fonts = (obj['layout'] || {})['text-font'];
      if (fonts && fonts.length) {
        fonts.forEach(reportFont);
      } else {
        reportFont('Open Sans Regular');
        reportFont('Arial Unicode MS Regular');
      }
    }
  });

  var spritePath;

  var httpTester = /^(http(s)?:)?\/\//;
  if (styleJSON.sprite && !httpTester.test(styleJSON.sprite)) {
    spritePath = path.join(options.paths.sprites,
        styleJSON.sprite
            .replace('{style}', path.basename(styleFile, '.json'))
            .replace('{styleJsonFolder}', path.relative(options.paths.sprites, path.dirname(styleFile)))
            );
    styleJSON.sprite = 'local://styles/' + id + '/sprite';
  }
  if (styleJSON.glyphs && !httpTester.test(styleJSON.glyphs)) {
    styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';
  }

  repo[id] = styleJSON;

  app.get('/' + id + '/style.json', function(req, res, next) {
    var fixUrl = function(url, opt_nokey, opt_nostyle) {
      if (!url || (typeof url !== 'string') || url.indexOf('local://') !== 0) {
        return url;
      }
      var queryParams = [];
      if (!opt_nostyle && global.addStyleParam) {
        queryParams.push('style=' + id);
      }
      if (!opt_nokey && req.query.key) {
        queryParams.unshift('key=' + req.query.key);
      }
      var query = '';
      if (queryParams.length) {
        query = '?' + queryParams.join('&');
      }
      return url.replace(
          'local://', req.protocol + '://' + req.headers.host + '/') + query;
    };

    var styleJSON_ = clone(styleJSON);
    Object.keys(styleJSON_.sources).forEach(function(name) {
      var source = styleJSON_.sources[name];
      source.url = fixUrl(source.url);
    });
    // mapbox-gl-js viewer cannot handle sprite urls with query
    if (styleJSON_.sprite) {
      styleJSON_.sprite = fixUrl(styleJSON_.sprite, true, true);
    }
    if (styleJSON_.glyphs) {
      styleJSON_.glyphs = fixUrl(styleJSON_.glyphs, false, true);
    }
    return res.send(styleJSON_);
  });

  app.get('/' + id + '/sprite:scale(@[23]x)?\.:format([\\w]+)',
      function(req, res, next) {
    if (!spritePath) {
      return res.status(404).send('File not found');
    }
    var scale = req.params.scale,
        format = req.params.format;
    var filename = spritePath + (scale || '') + '.' + format;
    return fs.readFile(filename, function(err, data) {
      if (err) {
        console.log('Sprite load error:', filename);
        return res.status(404).send('File not found');
      } else {
        if (format == 'json') res.header('Content-type', 'application/json');
        if (format == 'png') res.header('Content-type', 'image/png');
        return res.send(data);
      }
    });
  });

  return Promise.resolve(app);
};
