'use strict';

var fs = require('fs'),
    path = require('path');

var clone = require('clone'),
    express = require('express'),
    mbtiles = require('mbtiles');

var utils = require('./utils');

module.exports = function(options, repo, params, id) {
  var app = express().disable('x-powered-by');

  var mbtilesFile = path.resolve(options.paths.mbtiles, params.mbtiles);
  var baseURL = options.baseURL;
  var tileJSON = {
    'tiles': params.domains || options.domains
  };

  repo[id] = tileJSON;

  var mbtilesFileStats = fs.statSync(mbtilesFile);
  if (!mbtilesFileStats.isFile() || mbtilesFileStats.size == 0) {
    throw Error('Not valid MBTiles file: ' + mbtilesFile);
  }
  var source = new mbtiles(mbtilesFile, function(err) {
    source.getInfo(function(err, info) {
      tileJSON['name'] = id;
      tileJSON['format'] = 'pbf';

      Object.assign(tileJSON, info);

      tileJSON['tilejson'] = '2.0.0';
      tileJSON['basename'] = id;
      tileJSON['filesize'] = mbtilesFileStats['size'];
      delete tileJSON['scheme'];

      Object.assign(tileJSON, params.tilejson || {});
      utils.fixTileJSONCenter(tileJSON);
    });
  });

  var tilePattern = '/' + id + '/:z(\\d+)/:x(\\d+)/:y(\\d+).:format([\\w]+)';

  app.get(tilePattern, function(req, res, next) {
    var z = req.params.z | 0,
        x = req.params.x | 0,
        y = req.params.y | 0;
    if (req.params.format != tileJSON.format) {
      return res.status(404).send('Invalid format');
    }
    if (z < tileJSON.minzoom || 0 || x < 0 || y < 0 ||
        z > tileJSON.maxzoom ||
        x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
      return res.status(404).send('Out of bounds');
    }
    source.getTile(z, x, y, function(err, data, headers) {
      if (err) {
        if (/does not exist/.test(err.message)) {
          return res.status(404).send(err.message);
        } else {
          return res.status(500).send(err.message);
        }
      } else {
        if (tileJSON['format'] == 'pbf') {
          headers['Content-Type'] = 'application/x-protobuf';
          headers['Content-Encoding'] = 'gzip';
        }
        delete headers['ETag']; // do not trust the tile ETag -- regenerate
        res.set(headers);

        if (data == null) {
          return res.status(404).send('Not found');
        } else {
          return res.status(200).send(data);
        }
      }
    });
  });

  app.get('/' + id + '.json', function(req, res, next) {
    var info = clone(tileJSON);
    info.tiles = utils.getTileUrls(req, info.tiles,
                                   'data/' + id, info.format, baseURL);
    return res.send(info);
  });

  return app;
};
