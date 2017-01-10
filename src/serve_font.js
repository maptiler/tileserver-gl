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
  fs.readdir(options.paths.fonts, function(err, files) {
    files.forEach(function(file) {
      fs.stat(path.join(fontPath, file), function(err, stats) {
        if (!err) {
          if (stats.isDirectory()) {
            existingFonts[path.basename(file)] = true;
          }
        }
      });
    });
  });

  app.get('/fontstacks.json', function(req, res, next) {
    res.header('Content-type', 'application/json');
    return res.send(Object.keys(existingFonts));
  });

  app.get('/:fontstack/:range([\\d]+-[\\d]+).pbf',
      function(req, res, next) {
    var fontstack = decodeURI(req.params.fontstack);
    var range = req.params.range;

    return utils.getFontsPbf(allowedFonts, fontPath, fontstack, range, existingFonts,
        function(err, concated) {
      if (err || concated.length === 0) {
        console.log(err);
        console.log(concated.length);
        return res.status(400).send('');
      } else {
        res.header('Content-type', 'application/x-protobuf');
        res.header('Last-Modified', lastModified);
        return res.send(concated);
      }
    });
  });

  return app;
};
