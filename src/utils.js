'use strict';

var async = require('async'),
    path = require('path'),
    fs = require('fs');

var glyphCompose = require('glyph-pbf-composite');

module.exports.getTileUrls = function(req, domains, path, format, baseURL) {
  var key = req.query.key;
  var query = (key && key.length > 0) ? ('?key=' + key) : '';

  if (baseURL) {
    return [baseURL + path + '/{z}/{x}/{y}.' + format + query]
  }

  if (domains) {
    if (domains.constructor === String && domains.length > 0) {
      domains = domains.split(',');
    }

  }
  if (!domains || domains.length == 0) {
    domains = [req.headers.host];
  }

  var uris = [];
  domains.forEach(function(domain) {
    uris.push(req.protocol + '://' + domain + '/' + path +
              '/{z}/{x}/{y}.' + format + query);
  });

  return uris;
};

module.exports.fixTileJSONCenter = function(tileJSON) {
  if (tileJSON.bounds && !tileJSON.center) {
    var fitWidth = 1024;
    var tiles = fitWidth / 256;
    tileJSON.center = [
      (tileJSON.bounds[0] + tileJSON.bounds[2]) / 2,
      (tileJSON.bounds[1] + tileJSON.bounds[3]) / 2,
      Math.round(
        -Math.log((tileJSON.bounds[2] - tileJSON.bounds[0]) / 360 / tiles) /
        Math.LN2
      )
    ];
  }
};

module.exports.getFontsPbf = function(allowedFonts, fontPath, names, range, callback) {
  var getFontPbf = function(name, range, callback) {
    if (!allowedFonts || allowedFonts[name]) {
      var filename = path.join(fontPath, name, range + '.pbf');
      return fs.readFile(filename, function(err, data) {
        if (err) {
          return callback(new Error('Font load error: ' + name));
        } else {
          return callback(null, data);
        }
      });
    } else {
      return callback(new Error('Font not allowed: ' + name));
    }
  };

  var fonts = names.split(',');
  var queue = [];
  fonts.forEach(function(font) {
    queue.push(function(callback) {
      getFontPbf(font, range, callback);
    });
  });

  return async.parallel(queue, function(err, results) {
    if (err) {
      callback(err, new Buffer([]));
    } else {
      callback(err, glyphCompose.combine(results));
    }
  });
};
