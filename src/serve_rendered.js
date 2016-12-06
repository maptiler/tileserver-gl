'use strict';

var async = require('async'),
    advancedPool = require('advanced-pool'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    zlib = require('zlib');

// sharp has to be required before node-canvas
// see https://github.com/lovell/sharp/issues/371
var sharp = require('sharp');

var Canvas = require('canvas'),
    clone = require('clone'),
    Color = require('color'),
    express = require('express'),
    mercator = new (require('sphericalmercator'))(),
    mbgl = require('mapbox-gl-native'),
    mbtiles = require('mbtiles'),
    pngquant = require('node-pngquant-native'),
    request = require('request');

var utils = require('./utils');

var FLOAT_PATTERN = '[+-]?(?:\\d+|\\d+\.?\\d+)';
var SCALE_PATTERN = '@[234]x';

var getScale = function(scale) {
  return (scale || '@1x').slice(1, 2) | 0;
};

mbgl.on('message', function(e) {
  if (e.severity == 'WARNING' || e.severity == 'ERROR') {
    console.log('mbgl:', e);
  }
});

module.exports = function(options, repo, params, id, dataResolver) {
  var app = express().disable('x-powered-by');

  var lastModified = new Date().toUTCString();

  var rootPath = options.paths.root;
  var baseURL = options.baseURL;

  var styleFile = params.style;
  var map = {
    renderers: [],
    sources: {}
  };

  var styleJSON;
  var createPool = function(ratio, min, max) {
    var createRenderer = function(ratio, createCallback) {
      var renderer = new mbgl.Map({
        ratio: ratio,
        request: function(req, callback) {
          var protocol = req.url.split(':')[0];
          //console.log('Handling request:', req);
          if (protocol == 'sprites') {
            var dir = options.paths[protocol];
            var file = unescape(req.url).substring(protocol.length + 3);
            fs.readFile(path.join(dir, file), function(err, data) {
              callback(err, { data: data });
            });
          } else if (protocol == 'fonts') {
            var parts = req.url.split('/');
            var fontstack = unescape(parts[2]);
            var range = parts[3].split('.')[0];
            utils.getFontsPbf(null, options.paths[protocol], fontstack, range,
                function(err, concated) {
              callback(err, {data: concated});
            });
          } else if (protocol == 'mbtiles') {
            var parts = req.url.split('/');
            var source = map.sources[parts[2]];
            var z = parts[3] | 0,
                x = parts[4] | 0,
                y = parts[5].split('.')[0] | 0,
                format = parts[5].split('.')[1];
            source.getTile(z, x, y, function(err, data, headers) {
              if (err) {
                //console.log('MBTiles error, serving empty', err);
                callback(null, { data: source.emptyTile });
              } else {
                var response = {};

                if (headers['Last-Modified']) {
                  response.modified = new Date(headers['Last-Modified']);
                }

                if (format == 'pbf') {
                  response.data = zlib.unzipSync(data);
                } else {
                  response.data = data;
                }

                callback(null, response);
              }
            });
          } else if (protocol == 'http' || protocol == 'https') {
            request({
                url: req.url,
                encoding: null,
                gzip: true
            }, function(err, res, body) {
                if (err) {
                  //console.log('HTTP tile error', err);
                  callback(null, { data: new Buffer(0) });
                } else if (res.statusCode == 200) {
                  var response = {};

                  if (res.headers.modified) {
                    response.modified = new Date(res.headers.modified);
                  }
                  if (res.headers.expires) {
                    response.expires = new Date(res.headers.expires);
                  }
                  if (res.headers.etag) {
                    response.etag = res.headers.etag;
                  }

                  response.data = body;

                  callback(null, response);
                } else {
                  //console.log('HTTP error', JSON.parse(body).message);
                  callback(null, { data: new Buffer(0) });
                }
            });
          }
        }
      });
      renderer.load(styleJSON);
      createCallback(null, renderer);
    };
    return new advancedPool.Pool({
      min: min,
      max: max,
      create: createRenderer.bind(null, ratio),
      destroy: function(renderer) {
        renderer.release();
      }
    });
  };

  styleJSON = clone(require(path.join(options.paths.styles, styleFile)));
  styleJSON.sprite = 'sprites://' + path.basename(styleFile, '.json');
  styleJSON.glyphs = 'fonts://{fontstack}/{range}.pbf';

  var tileJSON = {
    'tilejson': '2.0.0',
    'name': styleJSON.name,
    'attribution': '',
    'basename': id,
    'minzoom': 0,
    'maxzoom': 20,
    'bounds': [-180, -85.0511, 180, 85.0511],
    'format': 'png',
    'type': 'baselayer'
  };
  var attributionOverride = params.tilejson && params.tilejson.attribution;
  Object.assign(tileJSON, params.tilejson || {});
  tileJSON.tiles = params.domains || options.domains;
  utils.fixTileJSONCenter(tileJSON);

  var queue = [];
  Object.keys(styleJSON.sources).forEach(function(name) {
    var source = styleJSON.sources[name];
    var url = source.url;

    if (url.lastIndexOf('mbtiles:', 0) === 0) {
      // found mbtiles source, replace with info from local file
      delete source.url;

      var mbtilesFile = url.substring('mbtiles://'.length);
      var fromData = mbtilesFile[0] == '{' &&
                     mbtilesFile[mbtilesFile.length - 1] == '}';

      if (fromData) {
        mbtilesFile = dataResolver(
          mbtilesFile.substr(1, mbtilesFile.length - 2));
        if (!mbtilesFile) {
          console.log('ERROR: data "' + mbtilesFile + '" not found!');
          process.exit(1);
        }
      }

      queue.push(function(callback) {
        mbtilesFile = path.resolve(options.paths.mbtiles, mbtilesFile);
        var mbtilesFileStats = fs.statSync(mbtilesFile);
        if (!mbtilesFileStats.isFile() || mbtilesFileStats.size == 0) {
          throw Error('Not valid MBTiles file: ' + mbtilesFile);
        }
        map.sources[name] = new mbtiles(mbtilesFile, function(err) {
          map.sources[name].getInfo(function(err, info) {
            var type = source.type;
            Object.assign(source, info);
            source.type = type;
            source.basename = name;
            source.tiles = [
              // meta url which will be detected when requested
              'mbtiles://' + name + '/{z}/{x}/{y}.' + (info.format || 'pbf')
            ];
            delete source.scheme;
            if (source.format == 'pbf') {
              map.sources[name].emptyTile = new Buffer(0);
            } else {
              var color = new Color(source.color || '#fff');
              var format = source.format;
              if (format == 'jpg') {
                format = 'jpeg';
              }
              sharp(new Buffer(color.rgbArray()), {
                raw: {
                  width: 1,
                  height: 1,
                  channels: 3
                }
              }).toFormat(format).toBuffer(function(err, buffer, info) {
                map.sources[name].emptyTile = buffer;
              });
            }
            if (!attributionOverride &&
                source.attribution && source.attribution.length > 0) {
              if (tileJSON.attribution.length > 0) {
                tileJSON.attribution += '; ';
              }
              tileJSON.attribution += source.attribution;
            }
            callback(null);
          });
        });
      });
    }
  });

  async.parallel(queue, function(err, results) {
    // TODO: make pool sizes configurable
    map.renderers[1] = createPool(1, 4, 16);
    map.renderers[2] = createPool(2, 2, 8);
    map.renderers[3] = createPool(3, 2, 4);
    map.renderers[4] = createPool(4, 2, 4);
  });

  repo[id] = tileJSON;

  var tilePattern = '/rendered/:z(\\d+)/:x(\\d+)/:y(\\d+)' +
                    ':scale(' + SCALE_PATTERN + ')?\.:format([\\w]+)';

  var respondImage = function(z, lon, lat, bearing, pitch,
                              width, height, scale, format, res, next,
                              opt_overlay) {
    if (Math.abs(lon) > 180 || Math.abs(lat) > 85.06) {
      return res.status(400).send('Invalid center');
    }
    if (Math.min(width, height) <= 0 ||
        Math.max(width, height) * scale > (options.maxSize || 2048)) {
      return res.status(400).send('Invalid size');
    }
    if (format == 'png' || format == 'webp') {
    } else if (format == 'jpg' || format == 'jpeg') {
      format = 'jpeg';
    } else {
      return res.status(400).send('Invalid format');
    }

    var pool = map.renderers[scale];
    pool.acquire(function(err, renderer) {
      var mbglZ = Math.max(0, z - 1);
      var params = {
        zoom: mbglZ,
        center: [lon, lat],
        bearing: bearing,
        pitch: pitch,
        width: width,
        height: height
      };
      if (z == 0) {
        params.width *= 2;
        params.height *= 2;
      }
      renderer.render(params, function(err, data) {
        pool.release(renderer);
        if (err) console.log(err);

        var image = sharp(data, {
          raw: {
            width: params.width * scale,
            height: params.height * scale,
            channels: 4
          }
        });

        if (z == 0) {
          // HACK: when serving zoom 0, resize the 0 tile from 512 to 256
          image.resize(width * scale, height * scale);
        }

        if (opt_overlay) {
          image.overlayWith(opt_overlay);
        }

        image.toFormat(format);

        var formatQuality = (params.formatQuality || {})[format] ||
                            (options.formatQuality || {})[format];
        if (format == 'png') {
          image.withoutAdaptiveFiltering();
        } else if (format == 'jpeg') {
          image.quality(formatQuality || 80);
        } else if (format == 'webp') {
          image.quality(formatQuality || 90);
        }
        image.toBuffer(function(err, buffer, info) {
          if (!buffer) {
            return res.status(404).send('Not found');
          }

          if (format == 'png') {
            var usePngQuant =
                (options.formatQuality || {}).pngQuantization === true;
            if (usePngQuant) {
              buffer = pngquant.compress(buffer, {
                quality: [0, formatQuality || 90]
              });
            }
          }

          res.set({
            'Last-Modified': lastModified,
            'Content-Type': 'image/' + format
          });
          return res.status(200).send(buffer);
        });
      });
    });
  };

  app.get(tilePattern, function(req, res, next) {
    var modifiedSince = req.get('if-modified-since'), cc = req.get('cache-control');
    if (modifiedSince && (!cc || cc.indexOf('no-cache') == -1)) {
      if (new Date(lastModified) <= new Date(modifiedSince)) {
        return res.sendStatus(304);
      }
    }

    var z = req.params.z | 0,
        x = req.params.x | 0,
        y = req.params.y | 0,
        scale = getScale(req.params.scale),
        format = req.params.format;
    if (z < 0 || x < 0 || y < 0 ||
        z > 20 || x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
      return res.status(404).send('Out of bounds');
    }
    var tileSize = 256;
    var tileCenter = mercator.ll([
      ((x + 0.5) / (1 << z)) * (256 << z),
      ((y + 0.5) / (1 << z)) * (256 << z)
    ], z);
    return respondImage(z, tileCenter[0], tileCenter[1], 0, 0,
                        tileSize, tileSize, scale, format, res, next);
  });

  var extractPathFromQuery = function(query) {
    var pathParts = (query.path || '').split('|');
    var path = [];
    pathParts.forEach(function(pair) {
      var pairParts = pair.split(',');
      if (pairParts.length == 2) {
        if (query.latlng == '1' || query.latlng == 'true') {
          path.push([+(pairParts[1]), +(pairParts[0])]);
        } else {
          path.push([+(pairParts[0]), +(pairParts[1])]);
        }
      }
    });
    return path;
  };

  var renderOverlay = function(z, x, y, bearing, pitch, w, h, scale,
                               path, query) {
    if (!path || path.length < 2) {
      return null;
    }
    var precisePx = function(ll, zoom) {
      var px = mercator.px(ll, 20);
      var scale = Math.pow(2, zoom - 20);
      return [px[0] * scale, px[1] * scale];
    };

    var canvas = new Canvas(scale * w, scale * h);
    var ctx = canvas.getContext('2d');
    var center = precisePx([x, y], z);
    ctx.scale(scale, scale);
    if (bearing) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-bearing / 180 * Math.PI);
      ctx.translate(-center[0], -center[1]);
    } else {
      // optimized path
      ctx.translate(-center[0] + w / 2, -center[1] + h / 2);
    }
    var lineWidth = query.width !== undefined ?
                    parseFloat(query.width) : 1;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = query.stroke || 'rgba(0,64,255,0.7)';
    ctx.fillStyle = query.fill || 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    path.forEach(function(pair) {
      var px = precisePx(pair, z);
      ctx.lineTo(px[0], px[1]);
    });
    if (path[0][0] == path[path.length - 1][0] &&
        path[0][1] == path[path.length - 1][1]) {
      ctx.closePath();
    }
    ctx.fill();
    if (lineWidth > 0) {
      ctx.stroke();
    }

    return canvas.toBuffer();
  };

  var calcZForBBox = function(bbox, w, h, query) {
    var z = 25;

    var padding = query.padding !== undefined ?
                  parseFloat(query.padding) : 0.1;

    var minCorner = mercator.px([bbox[0], bbox[3]], z),
        maxCorner = mercator.px([bbox[2], bbox[1]], z);
    var w_ = w / (1 + 2 * padding);
    var h_ = h / (1 + 2 * padding);

    z -= Math.max(
      Math.log((maxCorner[0] - minCorner[0]) / w_),
      Math.log((maxCorner[1] - minCorner[1]) / h_)
    ) / Math.LN2;

    z = Math.max(Math.log(Math.max(w, h) / 256) / Math.LN2, Math.min(25, z));

    return z;
  };

  var staticPattern =
      '/static/:raw(raw)?/%s/:width(\\d+)x:height(\\d+)' +
      ':scale(' + SCALE_PATTERN + ')?\.:format([\\w]+)';

  var centerPattern =
      util.format(':x(%s),:y(%s),:z(%s)(@:bearing(%s)(,:pitch(%s))?)?',
                  FLOAT_PATTERN, FLOAT_PATTERN, FLOAT_PATTERN,
                  FLOAT_PATTERN, FLOAT_PATTERN);

  app.get(util.format(staticPattern, centerPattern), function(req, res, next) {
    var raw = req.params.raw;
    var z = +req.params.z,
        x = +req.params.x,
        y = +req.params.y,
        bearing = +(req.params.bearing || '0'),
        pitch = +(req.params.pitch || '0'),
        w = req.params.width | 0,
        h = req.params.height | 0,
        scale = getScale(req.params.scale),
        format = req.params.format;

    if (z < 0) {
      return res.status(404).send('Invalid zoom');
    }

    if (raw) {
      var ll = mercator.inverse([x, y]);
      x = ll[0];
      y = ll[1];
    }

    var path = extractPathFromQuery(req.query);
    var overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale,
                                path, req.query);

    return respondImage(z, x, y, bearing, pitch, w, h, scale, format,
                        res, next, overlay);
  });

  var boundsPattern =
      util.format(':minx(%s),:miny(%s),:maxx(%s),:maxy(%s)',
                  FLOAT_PATTERN, FLOAT_PATTERN, FLOAT_PATTERN, FLOAT_PATTERN);

  app.get(util.format(staticPattern, boundsPattern), function(req, res, next) {
    var raw = req.params.raw;
    var bbox = [+req.params.minx, +req.params.miny,
                +req.params.maxx, +req.params.maxy];

    if (raw) {
      var minCorner = mercator.inverse(bbox.slice(0, 2));
      var maxCorner = mercator.inverse(bbox.slice(2));
      bbox[0] = minCorner[0];
      bbox[1] = minCorner[1];
      bbox[2] = maxCorner[0];
      bbox[3] = maxCorner[1];
    }

    var w = req.params.width | 0,
        h = req.params.height | 0,
        scale = getScale(req.params.scale),
        format = req.params.format;

    var z = calcZForBBox(bbox, w, h, req.query),
        x = (bbox[0] + bbox[2]) / 2,
        y = (bbox[1] + bbox[3]) / 2,
        bearing = 0,
        pitch = 0;

    var path = extractPathFromQuery(req.query);
    var overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale,
                                path, req.query);
    return respondImage(z, x, y, bearing, pitch, w, h, scale, format,
                        res, next, overlay);
  });

  var autoPattern = 'auto';

  app.get(util.format(staticPattern, autoPattern), function(req, res, next) {
    var path = extractPathFromQuery(req.query);
    if (path.length < 2) {
      return res.status(400).send('Invalid path');
    }

    var raw = req.params.raw;
    var w = req.params.width | 0,
        h = req.params.height | 0,
        bearing = 0,
        pitch = 0,
        scale = getScale(req.params.scale),
        format = req.params.format;

    var bbox = [Infinity, Infinity, -Infinity, -Infinity];
    path.forEach(function(pair) {
      bbox[0] = Math.min(bbox[0], pair[0]);
      bbox[1] = Math.min(bbox[1], pair[1]);
      bbox[2] = Math.max(bbox[2], pair[0]);
      bbox[3] = Math.max(bbox[3], pair[1]);
    });

    var z = calcZForBBox(bbox, w, h, req.query),
        x = (bbox[0] + bbox[2]) / 2,
        y = (bbox[1] + bbox[3]) / 2;

    if (raw) {
      var ll = mercator.inverse([x, y]);
      x = ll[0];
      y = ll[1];
    }

    var overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale,
                                path, req.query);

    return respondImage(z, x, y, bearing, pitch, w, h, scale, format,
                        res, next, overlay);
  });

  app.get('/rendered.json', function(req, res, next) {
    var info = clone(tileJSON);
    info.tiles = utils.getTileUrls(req, info.tiles,
                                   'styles/' + id + '/rendered', info.format, baseURL);
    return res.send(info);
  });

  return app;
};
