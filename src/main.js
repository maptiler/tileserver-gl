#!/usr/bin/env node

'use strict';

var fs = require('fs'),
    path = require('path'),
    request = require('request');

var mbtiles = require('@mapbox/mbtiles');

var packageJson = require('../package');

var opts = require('nomnom')
  .option('mbtiles', {
    default: undefined,
    help: 'MBTiles file (uses demo configuration);\n' +
          '\t    ignored if the configuration file is also specified',
    position: 0
  })
  .option('config', {
    abbr: 'c',
    default: 'config.json',
    help: 'Configuration file'
  })
  .option('bind', {
    abbr: 'b',
    default: undefined,
    help: 'Bind address'
  })
  .option('port', {
    abbr: 'p',
    default: 8080,
    help: 'Port'
  })
  .option('cors', {
    default: true,
    help: 'Enable Cross-origin resource sharing headers'
  })
  .option('verbose', {
    abbr: 'V',
    flag: true,
    help: 'More verbose output'
  })
  .option('version', {
    abbr: 'v',
    flag: true,
    help: 'Version info',
    callback: function() {
      return packageJson.name + ' v' + packageJson.version;
    }
  }).parse();


console.log('Starting ' + packageJson.name + ' v' + packageJson.version);

var startServer = function(configPath, config) {
  return require('./server')({
    configPath: configPath,
    config: config,
    bind: opts.bind,
    port: opts.port,
    cors: opts.cors
  });
};

var startWithMBTiles = function(mbtilesFile) {
  console.log('Automatically creating config file for ' + mbtilesFile);

  mbtilesFile = path.resolve(process.cwd(), mbtilesFile);

  var mbtilesStats = fs.statSync(mbtilesFile);
  if (!mbtilesStats.isFile() || mbtilesStats.size === 0) {
    console.log('ERROR: Not valid MBTiles file: ' + mbtilesFile);
    process.exit(1);
  }
  var instance = new mbtiles(mbtilesFile, function(err) {
    instance.getInfo(function(err, info) {
      if (err || !info) {
        console.log('ERROR: Metadata missing in the MBTiles.');
        console.log('       Make sure ' + path.basename(mbtilesFile) +
                    ' is valid MBTiles.');
        process.exit(1);
      }
      var bounds = info.bounds;

      var styleDir = path.resolve(__dirname, "../node_modules/tileserver-gl-styles/");

      var config = {
        "options": {
          "paths": {
            "root": styleDir,
            "fonts": "fonts",
            "styles": "styles",
            "mbtiles": path.dirname(mbtilesFile)
          }
        },
        "styles": {},
        "data": {}
      };

      if (info.format == 'pbf' &&
          info.name.toLowerCase().indexOf('openmaptiles') > -1) {
        var omtV = (info.version || '').split('.');

        config['data']['v' + omtV[0]] = {
          "mbtiles": path.basename(mbtilesFile)
        };


        var styles = fs.readdirSync(path.resolve(styleDir, 'styles'));
        for (var i = 0; i < styles.length; i++) {
          var styleName = styles[i];
          var styleFileRel = styleName + '/style.json';
          var styleFile = path.resolve(styleDir, 'styles', styleFileRel);
          if (fs.existsSync(styleFile)) {
            var styleJSON = require(styleFile);
            var omtVersionCompatibility =
              ((styleJSON || {}).metadata || {})['openmaptiles:version'] || 'x';
            var m = omtVersionCompatibility.toLowerCase().split('.');

            var isCompatible = !(
              m[0] != 'x' && (
                m[0] != omtV[0] || (
                  (m[1] || 'x') != 'x' && (
                    m[1] != omtV[1] || (
                      (m[2] || 'x') != 'x' &&
                      m[2] != omtV[2]
                    )
                  )
                )
              )
            );

            if (isCompatible) {
              var styleObject = {
                "style": styleFileRel,
                "tilejson": {
                  "bounds": bounds
                }
              };
              config['styles'][styleName] = styleObject;
            } else {
              console.log('Style', styleName, 'requires OpenMapTiles version',
              omtVersionCompatibility, 'but mbtiles is version', info.version);
            }
          }
        }
      } else {
        console.log('WARN: MBTiles not in "openmaptiles" format. ' +
                    'Serving raw data only...');
        config['data'][(info.id || 'mbtiles')
                           .replace(/\//g, '_')
                           .replace(/\:/g, '_')
                           .replace(/\?/g, '_')] = {
          "mbtiles": path.basename(mbtilesFile)
        };
      }

      if (opts.verbose) {
        console.log(JSON.stringify(config, undefined, 2));
      } else {
        console.log('Run with --verbose to see the config file here.');
      }

      return startServer(null, config);
    });
  });
};

fs.stat(path.resolve(opts.config), function(err, stats) {
  if (err || !stats.isFile() || stats.size === 0) {
    var mbtiles = opts.mbtiles;
    if (!mbtiles) {
      // try to find in the cwd
      var files = fs.readdirSync(process.cwd());
      for (var i=0; i < files.length; i++) {
        var filename = files[i];
        if (filename.endsWith('.mbtiles')) {
          var mbTilesStats = fs.statSync(filename);
          if (mbTilesStats.isFile() && mbTilesStats.size > 0) {
            mbtiles = filename;
            break;
          }
        }
      }
      if (mbtiles) {
        console.log('No MBTiles specified, using ' + mbtiles);
        return startWithMBTiles(mbtiles);
      } else {
        var url = 'https://github.com/klokantech/tileserver-gl/releases/download/v1.3.0/zurich_switzerland.mbtiles';
        var filename = 'zurich_switzerland.mbtiles';
        var stream = fs.createWriteStream(filename);
        console.log('Downloading sample data (' + filename + ') from ' + url);
        stream.on('finish', function() {
          return startWithMBTiles(filename);
        });
        return request.get(url).pipe(stream);
      }
    }
    if (mbtiles) {
      return startWithMBTiles(mbtiles);
    }
  } else {
    console.log('Using specified config file from ' + opts.config);
    return startServer(opts.config, null);
  }
});
