'use strict';

var path = require('path'),
    fs = require('fs');

var clone = require('clone'),
    express = require('express');


module.exports = function(options, repo, params, id, reportTiles, reportFont) {
  var app = express().disable('x-powered-by');

  var styleFile = path.join(options.paths.styles, params.style);

  var baseURL = options.baseURL;

  var styleJSON = clone(require(styleFile));
  Object.keys(styleJSON.sources).forEach(function(name) {
    var source = styleJSON.sources[name];
    var url = source.url;
    if (url.lastIndexOf('mbtiles:', 0) === 0) {
      var mbtilesFile = url.substring('mbtiles://'.length);
      var fromData = mbtilesFile[0] == '{' &&
                     mbtilesFile[mbtilesFile.length - 1] == '}';

      if (fromData) {
        mbtilesFile = mbtilesFile.substr(1, mbtilesFile.length - 2);
      }
      var identifier = reportTiles(mbtilesFile, fromData);
      source.url = 'local://data/' + identifier + '.json';
    }
  });

  var findFontReferences = function(obj) {
    Object.keys(obj).forEach(function(key) {
      var value = obj[key];
      if (key == 'text-font') {
        if (value && value.length > 0) {
          value.forEach(reportFont);
        }
      } else if (value && typeof value == 'object') {
        findFontReferences(value);
      }
    });
  };
  styleJSON.layers.forEach(findFontReferences);

  var spritePath = path.join(options.paths.sprites,
                             path.basename(styleFile, '.json'));

  styleJSON.sprite = 'local://styles/' + id + '/sprite';
  styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';

  repo[id] = styleJSON;

  app.get('/' + id + '.json', function(req, res, next) {
    var fixUrl = function(url, opt_nokey) {
      var query = '';
      if (!opt_nokey && req.query.key) {
        query = '?key=' + req.query.key;
      }
      return url.replace('local://',
        (baseURL ? baseURL : req.protocol + '://' + req.headers.host) + '/') + query;
    };

    var styleJSON_ = clone(styleJSON);
    Object.keys(styleJSON_.sources).forEach(function(name) {
      var source = styleJSON_.sources[name];
      source.url = fixUrl(source.url);
    });
    // mapbox-gl-js viewer cannot handle sprite urls with query
    styleJSON_.sprite = fixUrl(styleJSON_.sprite, true);
    styleJSON_.glyphs = fixUrl(styleJSON_.glyphs);
    return res.send(styleJSON_);
  });

  app.get('/' + id + '/sprite:scale(@[23]x)?\.:format([\\w]+)',
      function(req, res, next) {
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

  return app;
};
