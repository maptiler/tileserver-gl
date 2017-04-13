'use strict';

var fs = require('fs'),
    path = require('path'),
    zlib = require('zlib');

var clone = require('clone'),
    express = require('express'),
    mbtiles = require('mbtiles'),
    pbf = require('pbf'),
    VectorTile = require('vector-tile').VectorTile;

var tileshrinkGl;
try {
  tileshrinkGl = require('tileshrink-gl');
  global.addStyleParam = true;
} catch (e) {}

var utils = require('./utils');

function isGzipped(data) {
  return data[0] === 0x1f && data[1] === 0x8b;
}

function unzip(tile, fn) {
  if (!tile.isGzipped) {
    return fn();
  }
  zlib.gunzip(tile.data, function(err, buffer) {
    if (!err) {
      tile.data = buffer;
      tile.isGzipped = false;
    }
    fn(err);
  });
}

function zip(tile, fn) {
  if (tile.isGzipped) {
    return fn();
  }
  zlib.gzip(tile.data, function(err, buffer) {
    if (!err) {
      tile.data = buffer;
      tile.isGzipped = true;
    }
    fn(err);
  });
}

module.exports = function(options, repo, params, id, styles) {
  var app = express().disable('x-powered-by');

  var mbtilesFile = path.resolve(options.paths.mbtiles, params.mbtiles);
  var tileJSON = {
    'tiles': params.domains || options.domains
  };

  var shrinkers = {};

  function lookupShrinker(style) {
    if (shrinkers[style]) {
      return shrinkers[style];
    }
    var styleJSON = styles[style];
    if (!styleJSON) {
      return;
    }
    var sourceName = null;
    for (var sourceName_ in styleJSON.sources) {
      var source = styleJSON.sources[sourceName_];
      if (source && source.type == 'vector' && source.url.endsWith('/' + id + '.json')) {
        sourceName = sourceName_;
      }
    }
    shrinkers[style] = tileshrinkGl.createPBFShrinker(styleJSON, sourceName);
    return shrinkers[style];
  }

  repo[id] = tileJSON;

  var mbtilesFileStats = fs.statSync(mbtilesFile);
  if (!mbtilesFileStats.isFile() || mbtilesFileStats.size === 0) {
    throw Error('Not valid MBTiles file: ' + mbtilesFile);
  }
  var source = new mbtiles(mbtilesFile, function(err) {
    source.getInfo(function(err, info) {
      tileJSON['name'] = id;
      tileJSON['format'] = 'pbf';

      Object.assign(tileJSON, info);

      tileJSON['tilejson'] = '2.0.0';
      delete tileJSON['filesize'];
      delete tileJSON['mtime'];
      delete tileJSON['scheme'];

      Object.assign(tileJSON, params.tilejson || {});
      utils.fixTileJSONCenter(tileJSON);
    });
  });

  var tilePattern = '/' + id + '/:z(\\d+)/:x(\\d+)/:y(\\d+).:format([\\w.]+)';

  function checkParams(req, res, next) {
    var z = req.params.z | 0,
        x = req.params.x | 0,
        y = req.params.y | 0;
    var format = req.params.format;
    if (format == options.pbfAlias) {
      format = 'pbf';
    }
    if (format != tileJSON.format &&
        !(format == 'geojson' && tileJSON.format == 'pbf')) {
      return res.status(404).send('Invalid format');
    }
    if (z < tileJSON.minzoom || 0 || x < 0 || y < 0 ||
        z > tileJSON.maxzoom ||
        x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
      return res.status(404).send('Out of bounds');
    }
    req.params.format = format;
    req.params.z = z;
    req.params.x = x;
    req.params.y = y;
    next();
  }

  function getTile(req, res, next) {
    var p = req.params;
    source.getTile(p.z, p.x, p.y, function(err, data, headers) {
      if (err) {
        var status = /does not exist/.test(err.message) ? 404 : 500;
        return res.status(status).send(err.message);
      }
      if (data == null) {
        return res.status(404).send('Not found');
      }
      req.tile = {
        data: data,
        headers: headers,
        contentType: 'application/x-protobuf',
        isGzipped: isGzipped(data)
      };
      next();
    });
  }

  function shrinkTile(req, res, next) {
    if (!tileshrinkGl) {
      return next();
    }
    if (tileJSON['format'] !== 'pbf') {
      return next();
    }
    var style = req.query.style;
    if (!style) {
      return next();
    }
    var tile = req.tile;
    var shrinker = lookupShrinker(style);
    if (!shrinker) {
      return next();
    }
    unzip(tile, function(err) {
      if (!err) {
        tile.data = shrinker(tile.data, req.params.z, tileJSON.maxzoom);
        //console.log(shrinker.getStats());
      }
      next(err);
    });
  }

  function formatTile(req, res, next) {
    var format = req.params.format;
    if (format !== 'geojson') {
      return next();
    }
    var tile = req.tile;
    var x = req.params.x,
      y = req.params.y,
      z = req.params.z;

    tile.contentType = 'application/json';
    unzip(tile, function(err) {
      if (err) {
        return next(err);
      }

      var vectorTile = new VectorTile(new pbf(tile.data));
      var geojson = {
        "type": "FeatureCollection",
        "features": []
      };

      for (var layerName in vectorTile.layers) {
        var layer = vectorTile.layers[layerName];
        for (var i = 0; i < layer.length; i++) {
          var feature = layer.feature(i);
          var featureGeoJSON = feature.toGeoJSON(x, y, z);
          featureGeoJSON.properties.layer = layerName;
          geojson.features.push(featureGeoJSON);
        }
      }

      tile.data = JSON.stringify(geojson);

      next();
    });
  }

  function zipTile(req, res, next) {
    zip(req.tile, next);
  }

  function sendTile(req, res) {
    var headers = req.tile.headers;

    delete headers['ETag']; // do not trust the tile ETag -- regenerate
    headers['Content-Type'] = req.tile.contentType;
    headers['Content-Encoding'] = 'gzip';
    res.set(headers);

    res.status(200).send(req.tile.data);
  }

  app.get(tilePattern,
    checkParams,
    getTile,
    shrinkTile,
    formatTile,
    zipTile,
    sendTile
  );

  app.get('/' + id + '.json', function(req, res, next) {
    var info = clone(tileJSON);
    info.tiles = utils.getTileUrls(req, info.tiles,
                                   'data/' + id, info.format, {
                                     'pbf': options.pbfAlias
                                   });
    return res.send(info);
  });

  return app;
};
