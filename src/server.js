#!/usr/bin/env node
'use strict';

process.env.UV_THREADPOOL_SIZE =
    Math.ceil(Math.max(4, require('os').cpus().length * 1.5));

var fs = require('fs'),
    path = require('path');

var base64url = require('base64url'),
    clone = require('clone'),
    cors = require('cors'),
    enableShutdown = require('http-shutdown'),
    express = require('express'),
    handlebars = require('handlebars'),
    mercator = new (require('@mapbox/sphericalmercator'))(),
    morgan = require('morgan');

var packageJson = require('../package'),
    serve_font = require('./serve_font'),
    serve_rendered = null,
    serve_style = require('./serve_style'),
    serve_data = require('./serve_data'),
    utils = require('./utils');

var isLight = packageJson.name.slice(-6) == '-light';
if (!isLight) {
  // do not require `serve_rendered` in the light package
  serve_rendered = require('./serve_rendered');
}

function start(opts) {
  console.log('Starting server');

  var app = express().disable('x-powered-by'),
      serving = {
        styles: {},
        rendered: {},
        data: {},
        fonts: {}
      };

  app.enable('trust proxy');

  if (process.env.NODE_ENV == 'production') {
    app.use(morgan('tiny'));
  } else if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  var config = opts.config || null;
  var configPath = null;
  if (opts.configPath) {
    configPath = path.resolve(opts.configPath);
    try {
      config = clone(require(configPath));
    } catch (e) {
      console.log('ERROR: Config file not found or invalid!');
      console.log('       See README.md for instructions and sample data.');
      process.exit(1);
    }
  }
  if (!config) {
    console.log('ERROR: No config file not specified!');
    process.exit(1);
  }

  var options = config.options || {};
  var paths = options.paths || {};
  options.paths = paths;
  paths.root = path.resolve(
    configPath ? path.dirname(configPath) : process.cwd(),
    paths.root || '');
  paths.styles = path.resolve(paths.root, paths.styles || '');
  paths.fonts = path.resolve(paths.root, paths.fonts || '');
  paths.sprites = path.resolve(paths.root, paths.sprites || '');
  paths.mbtiles = path.resolve(paths.root, paths.mbtiles || '');

  var startupPromises = [];

  var checkPath = function(type) {
    if (!fs.existsSync(paths[type])) {
      console.error('The specified path for "' + type + '" does not exist (' + paths[type] + ').');
      process.exit(1);
    }
  };
  checkPath('styles');
  checkPath('fonts');
  checkPath('sprites');
  checkPath('mbtiles');

  if (options.dataDecorator) {
    try {
      options.dataDecoratorFunc = require(path.resolve(paths.root, options.dataDecorator));
    } catch (e) {}
  }

  var data = clone(config.data || {});

  if (opts.cors) {
    app.use(cors());
  }

  Object.keys(config.styles || {}).forEach(function(id) {
    var item = config.styles[id];
    if (!item.style || item.style.length == 0) {
      console.log('Missing "style" property for ' + id);
      return;
    }

    if (item.serve_data !== false) {
      startupPromises.push(serve_style(options, serving.styles, item, id,
        function(mbtiles, fromData) {
          var dataItemId;
          Object.keys(data).forEach(function(id) {
            if (fromData) {
              if (id == mbtiles) {
                dataItemId = id;
              }
            } else {
              if (data[id].mbtiles == mbtiles) {
                dataItemId = id;
              }
            }
          });
          if (dataItemId) { // mbtiles exist in the data config
            return dataItemId;
          } else if (fromData) {
            console.log('ERROR: data "' + mbtiles + '" not found!');
            process.exit(1);
          } else {
            var id = mbtiles.substr(0, mbtiles.lastIndexOf('.')) || mbtiles;
            while (data[id]) id += '_';
            data[id] = {
              'mbtiles': mbtiles
            };
            return id;
          }
        }, function(font) {
          serving.fonts[font] = true;
        }).then(function(sub) {
          app.use('/styles/', sub);
        }));
    }
    if (item.serve_rendered !== false) {
      if (serve_rendered) {
        startupPromises.push(
          serve_rendered(options, serving.rendered, item, id,
            function(mbtiles) {
              var mbtilesFile;
              Object.keys(data).forEach(function(id) {
                if (id == mbtiles) {
                  mbtilesFile = data[id].mbtiles;
                }
              });
              return mbtilesFile;
            }
          ).then(function(sub) {
            app.use('/styles/', sub);
          })
        );
      } else {
        item.serve_rendered = false;
      }
    }
  });

  startupPromises.push(
    serve_font(options, serving.fonts).then(function(sub) {
      app.use('/', sub);
    })
  );

  Object.keys(data).forEach(function(id) {
    var item = data[id];
    if (!item.mbtiles || item.mbtiles.length == 0) {
      console.log('Missing "mbtiles" property for ' + id);
      return;
    }

    startupPromises.push(
      serve_data(options, serving.data, item, id, serving.styles).then(function(sub) {
        app.use('/data/', sub);
      })
    );
  });

  app.get('/styles.json', function(req, res, next) {
    var result = [];
    var query = req.query.key ? ('?key=' + req.query.key) : '';
    Object.keys(serving.styles).forEach(function(id) {
      var styleJSON = serving.styles[id];
      result.push({
        version: styleJSON.version,
        name: styleJSON.name,
        id: id,
        url: req.protocol + '://' + req.headers.host +
             '/styles/' + id + '/style.json' + query
      });
    });
    res.send(result);
  });

  var addTileJSONs = function(arr, req, type) {
    Object.keys(serving[type]).forEach(function(id) {
      var info = clone(serving[type][id]);
      var path = '';
      if (type == 'rendered') {
        path = 'styles/' + id;
      } else {
        path = type + '/' + id;
      }
      info.tiles = utils.getTileUrls(req, info.tiles, path, info.format, {
        'pbf': options.pbfAlias
      });
      arr.push(info);
    });
    return arr;
  };

  app.get('/rendered.json', function(req, res, next) {
    res.send(addTileJSONs([], req, 'rendered'));
  });
  app.get('/data.json', function(req, res, next) {
    res.send(addTileJSONs([], req, 'data'));
  });
  app.get('/index.json', function(req, res, next) {
    res.send(addTileJSONs(addTileJSONs([], req, 'rendered'), req, 'data'));
  });

  //------------------------------------
  // serve web presentations
  app.use('/', express.static(path.join(__dirname, '../public/resources')));

  var templates = path.join(__dirname, '../public/templates');
  var serveTemplate = function(urlPath, template, dataGetter) {
    var templateFile = templates + '/' + template + '.tmpl';
    if (template == 'index') {
      if (options.frontPage === false) {
        return;
      } else if (options.frontPage &&
                 options.frontPage.constructor === String) {
        templateFile = path.resolve(paths.root, options.frontPage);
      }
    }
    startupPromises.push(new Promise(function(resolve, reject) {
      fs.readFile(templateFile, function(err, content) {
        if (err) {
          err = new Error('Template not found: ' + err.message);
          reject(err);
          return;
        }
        var compiled = handlebars.compile(content.toString());

        app.use(urlPath, function(req, res, next) {
          var data = {};
          if (dataGetter) {
            data = dataGetter(req);
            if (!data) {
              return res.status(404).send('Not found');
            }
          }
          data['server_version'] = packageJson.name + ' v' + packageJson.version;
          data['is_light'] = isLight;
          data['key_query_part'] =
              req.query.key ? 'key=' + req.query.key + '&amp;' : '';
          data['key_query'] = req.query.key ? '?key=' + req.query.key : '';
          return res.status(200).send(compiled(data));
        });
        resolve();
      });
    }));
  };

  serveTemplate('/$', 'index', function(req) {
    var styles = clone(config.styles || {});
    Object.keys(styles).forEach(function(id) {
      var style = styles[id];
      style.name = (serving.styles[id] || serving.rendered[id] || {}).name;
      style.serving_data = serving.styles[id];
      style.serving_rendered = serving.rendered[id];
      if (style.serving_rendered) {
        var center = style.serving_rendered.center;
        if (center) {
          style.viewer_hash = '#' + center[2] + '/' +
                              center[1].toFixed(5) + '/' +
                              center[0].toFixed(5);

          var centerPx = mercator.px([center[0], center[1]], center[2]);
          style.thumbnail = center[2] + '/' +
              Math.floor(centerPx[0] / 256) + '/' +
              Math.floor(centerPx[1] / 256) + '.png';
        }

        var query = req.query.key ? ('?key=' + req.query.key) : '';
        style.wmts_link = 'http://wmts.maptiler.com/' +
          base64url('http://' + req.headers.host +
            '/styles/' + id + '.json' + query) + '/wmts';

        var tiles = utils.getTileUrls(
            req, style.serving_rendered.tiles,
            'styles/' + id, style.serving_rendered.format);
        style.xyz_link = tiles[0];
      }
    });
    var data = clone(serving.data || {});
    Object.keys(data).forEach(function(id) {
      var data_ = data[id];
      var center = data_.center;
      if (center) {
        data_.viewer_hash = '#' + center[2] + '/' +
                            center[1].toFixed(5) + '/' +
                            center[0].toFixed(5);
      }
      data_.is_vector = data_.format == 'pbf';
      if (!data_.is_vector) {
        if (center) {
          var centerPx = mercator.px([center[0], center[1]], center[2]);
          data_.thumbnail = center[2] + '/' +
              Math.floor(centerPx[0] / 256) + '/' +
              Math.floor(centerPx[1] / 256) + '.' + data_.format;
        }

        var query = req.query.key ? ('?key=' + req.query.key) : '';
        data_.wmts_link = 'http://wmts.maptiler.com/' +
          base64url('http://' + req.headers.host +
            '/data/' + id + '.json' + query) + '/wmts';

        var tiles = utils.getTileUrls(
            req, data_.tiles, 'data/' + id, data_.format, {
              'pbf': options.pbfAlias
            });
        data_.xyz_link = tiles[0];
      }
      if (data_.filesize) {
        var suffix = 'kB';
        var size = parseInt(data_.filesize, 10) / 1024;
        if (size > 1024) {
          suffix = 'MB';
          size /= 1024;
        }
        if (size > 1024) {
          suffix = 'GB';
          size /= 1024;
        }
        data_.formatted_filesize = size.toFixed(2) + ' ' + suffix;
      }
    });
    return {
      styles: Object.keys(styles).length ? styles : null,
      data: Object.keys(data).length ? data : null
    };
  });

  serveTemplate('/styles/:id/$', 'viewer', function(req) {
    var id = req.params.id;
    var style = clone((config.styles || {})[id]);
    if (!style) {
      return null;
    }
    style.id = id;
    style.name = (serving.styles[id] || serving.rendered[id]).name;
    style.serving_data = serving.styles[id];
    style.serving_rendered = serving.rendered[id];
    return style;
  });

  /*
  app.use('/rendered/:id/$', function(req, res, next) {
    return res.redirect(301, '/styles/' + req.params.id + '/');
  });
  */

  serveTemplate('/data/:id/$', 'data', function(req) {
    var id = req.params.id;
    var data = clone(serving.data[id]);
    if (!data) {
      return null;
    }
    data.id = id;
    data.is_vector = data.format == 'pbf';
    return data;
  });

  var startupComplete = false;
  var startupPromise = Promise.all(startupPromises).then(function() {
    console.log('Startup complete');
    startupComplete = true;
  });
  app.get('/health', function(req, res, next) {
    if (startupComplete) {
      return res.status(200).send('OK');
    } else {
      return res.status(503).send('Starting');
    }
  });

  var server = app.listen(process.env.PORT || opts.port, process.env.BIND || opts.bind, function() {
    var address = this.address().address;
    if (address.indexOf('::') === 0) {
      address = '[' + address + ']'; // literal IPv6 address
    }
    console.log('Listening at http://%s:%d/', address, this.address().port);
  });

  // add server.shutdown() to gracefully stop serving
  enableShutdown(server);

  return {
    app: app,
    server: server,
    startupPromise: startupPromise
  };
}

module.exports = function(opts) {
  var running = start(opts);

  running.startupPromise.catch(function(err) {
    console.error(err.message);
    process.exit(1);
  });

  process.on('SIGINT', function() {
    process.exit();
  });

  process.on('SIGHUP', function() {
    console.log('Stopping server and reloading config');

    running.server.shutdown(function() {
      for (var key in require.cache) {
        delete require.cache[key];
      }

      var restarted = start(opts);
      running.server = restarted.server;
      running.app = restarted.app;
    });
  });

  return running;
};
