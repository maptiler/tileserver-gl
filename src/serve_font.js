'use strict';

var clone = require('clone'),
    express = require('express'),
    fs = require('fs'),
    path = require('path');

var utils = require('./utils');

module.exports = function(options, allowedFonts) {
  var app = express().disable('x-powered-by');

  var lastModified = new Date().toUTCString();

  var fontPath = options.paths.fonts;

  var existingFonts = {};
  var fontListingPromise = new Promise(function(resolve, reject) {
    fs.readdir(options.paths.fonts, function(err, files) {
      if (err) {
        reject(err);
        return;
      }
      files.forEach(function(file) {
        fs.stat(path.join(fontPath, file), function(err, stats) {
          if (err) {
            reject(err);
            return;
          }
          if (stats.isDirectory() &&
              fs.existsSync(path.join(fontPath, file, '0-255.pbf'))) {
            existingFonts[path.basename(file)] = true;
          }
        });
      });
      resolve();
    });
  });

  app.get('/fonts/:fontstack/:range([\\d]+-[\\d]+).pbf',
      function(req, res, next) {
    var fontstack = decodeURI(req.params.fontstack);
    var range = req.params.range;

    utils.getFontsPbf(options.serveAllFonts ? null : allowedFonts,
      fontPath, fontstack, range, existingFonts).then(function(concated) {
        res.header('Content-type', 'application/x-protobuf');
        res.header('Last-Modified', lastModified);
        return res.send(concated);
      }, function(err) {
        return res.status(400).send(err);
      }
    );
  });

  app.get('/fonts.json', function(req, res, next) {
    res.header('Content-type', 'application/json');
    return res.send(
      Object.keys(options.serveAllFonts ? existingFonts : allowedFonts).sort()
    );
  });

  return fontListingPromise.then(function() {
    return app;
  });
};
