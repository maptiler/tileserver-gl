'use strict';

var fs = require('fs'),
    path = require('path'),
    zlib = require('zlib');

var clone = require('clone'),
    express = require('express'),
    mbtiles = require('@mapbox/mbtiles'),
    pbf = require('pbf'),
    VectorTile = require('@mapbox/vector-tile').VectorTile;

var tileshrinkGl;
try {
  tileshrinkGl = require('tileshrink-gl');
  global.addStyleParam = true;
} catch (e) {}

var utils = require('./utils');

module.exports = function(options, repo, params, id, styles) {
  var app = express().disable('x-powered-by');

  var mbtilesFile = path.resolve(options.paths.mbtiles, params.mbtiles);
  var tileJSON = {
    'tiles': params.domains || options.domains
  };

  var shrinkers = {};

  repo[id] = tileJSON;

  var mbtilesFileStats = fs.statSync(mbtilesFile);
  if (!mbtilesFileStats.isFile() || mbtilesFileStats.size == 0) {
    throw Error('Not valid MBTiles file: ' + mbtilesFile);
  }
  var source;
  var sourceInfoPromise = new Promise(function(resolve, reject) {
    source = new mbtiles(mbtilesFile, function(err) {
      if (err) {
        reject(err);
        return;
      }
      source.getInfo(function(err, info) {
        if (err) {
          reject(err);
          return;
        }
        tileJSON['name'] = id;
        tileJSON['format'] = 'pbf';

        Object.assign(tileJSON, info);

        tileJSON['tilejson'] = '2.0.0';
        delete tileJSON['filesize'];
        delete tileJSON['mtime'];
        delete tileJSON['scheme'];

        Object.assign(tileJSON, params.tilejson || {});
        utils.fixTileJSONCenter(tileJSON);

        if (options.dataDecoratorFunc) {
          tileJSON = options.dataDecoratorFunc(id, 'tilejson', tileJSON);
        }
        resolve();
      });
    });
  });

  var tilePattern = '/' + id + '/:z(\\d+)/:x(\\d+)/:y(\\d+).:format([\\w.]+)';

  app.get(tilePattern, function(req, res, next) {
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
    source.getTile(z, x, y, function(err, data, headers) {
      if (err) {
        if (/does not exist/.test(err.message)) {
          return res.status(404).send(err.message);
        } else {
          return res.status(500).send(err.message);
        }
      } else {
        if (data == null) {
          return res.status(404).send('Not found');
        } else {
          if (tileJSON['format'] == 'pbf') {
            var isGzipped = data.slice(0,2).indexOf(
                new Buffer([0x1f, 0x8b])) === 0;
            var style = req.query.style;
            if (style && tileshrinkGl) {
              if (!shrinkers[style]) {
                var styleJSON = styles[style];
                if (styleJSON) {
                  var sourceName = null;
                  for (var sourceName_ in styleJSON.sources) {
                    var source = styleJSON.sources[sourceName_];
                    if (source &&
                        source.type == 'vector' &&
                        source.url.endsWith('/' + id + '.json')) {
                      sourceName = sourceName_;
                    }
                  }
                  shrinkers[style] = tileshrinkGl.createPBFShrinker(styleJSON, sourceName);
                }
              }
              if (shrinkers[style]) {
                if (isGzipped) {
                  data = zlib.unzipSync(data);
                  isGzipped = false;
                }
                data = shrinkers[style](data, z, tileJSON.maxzoom);
                //console.log(shrinkers[style].getStats());
              }
            }
            if (options.dataDecoratorFunc) {
              if (isGzipped) {
                data = zlib.unzipSync(data);
                isGzipped = false;
              }
              data = options.dataDecoratorFunc(id, 'data', data, z, x, y);
            }
          }
          if (format == 'pbf') {
            headers['Content-Type'] = 'application/x-protobuf';
          } else if (format == 'geojson') {
            headers['Content-Type'] = 'application/json';

            if (isGzipped) {
              data = zlib.unzipSync(data);
              isGzipped = false;
            }

            var tile = new VectorTile(new pbf(data));
            var geojson = {
              "type": "FeatureCollection",
              "features": []
            };
            for (var layerName in tile.layers) {
              var layer = tile.layers[layerName];
              for (var i = 0; i < layer.length; i++) {
                var feature = layer.feature(i);
                var featureGeoJSON = feature.toGeoJSON(x, y, z);
                featureGeoJSON.properties.layer = layerName;
                geojson.features.push(featureGeoJSON);
              }
            }
            data = JSON.stringify(geojson);
          }
          delete headers['ETag']; // do not trust the tile ETag -- regenerate
          headers['Content-Encoding'] = 'gzip';
          res.set(headers);

          if (!isGzipped) {
            data = zlib.gzipSync(data);
            isGzipped = true;
          }

          return res.status(200).send(data);
        }
      }
    });
  });

  app.get('/' + id + '.json', function(req, res, next) {
    var info = clone(tileJSON);
    info.tiles = utils.getTileUrls(req, info.tiles,
                                   'data/' + id, info.format, {
                                     'pbf': options.pbfAlias
                                   });
    return res.send(info);
  });

  return sourceInfoPromise.then(function() {
    return app;
  });
};
