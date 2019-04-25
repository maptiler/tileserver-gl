'use strict';

var path = require('path'),
    fs = require('fs');

var clone = require('clone'),
    glyphCompose = require('glyph-pbf-composite');

module.exports.getTileUrls = function(req, domains, path, format, aliases) {

  if (domains) {
    if (domains.constructor === String && domains.length > 0) {
      domains = domains.split(',');
    }
    var host = req.headers.host;
    var hostParts = host.split('.');
    var relativeSubdomainsUsable = hostParts.length > 1 &&
        !/^([0-9]{1,3}\.){3}[0-9]{1,3}(\:[0-9]+)?$/.test(host);
    var newDomains = [];
    domains.forEach(function(domain) {
      if (domain.indexOf('*') !== -1) {
        if (relativeSubdomainsUsable) {
          var newParts = hostParts.slice(1);
          newParts.unshift(domain.replace('*', hostParts[0]));
          newDomains.push(newParts.join('.'));
        }
      } else {
        newDomains.push(domain);
      }
    });
    domains = newDomains;
  }
  if (!domains || domains.length == 0) {
    domains = [req.headers.host];
  }

  var key = req.query.key;
  var queryParams = [];
  if (req.query.key) {
    queryParams.push('key=' + req.query.key);
  }
  if (req.query.style) {
    queryParams.push('style=' + req.query.style);
  }
  var query = queryParams.length > 0 ? ('?' + queryParams.join('&')) : '';

  if (aliases && aliases[format]) {
    format = aliases[format];
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

var getFontPbf = function(allowedFonts, fontPath, name, range, fallbacks) {
  return new Promise(function(resolve, reject) {
    if (!allowedFonts || (allowedFonts[name] && fallbacks)) {
      var filename = path.join(fontPath, name, range + '.pbf');
      if (!fallbacks) {
        fallbacks = clone(allowedFonts || {});
      }
      delete fallbacks[name];
      fs.readFile(filename, function(err, data) {
        if (err) {
          console.error('ERROR: Font not found:', name);
          if (fallbacks && Object.keys(fallbacks).length) {
            var fallbackName;

            var fontStyle = name.split(' ').pop();
            if (['Regular', 'Bold', 'Italic'].indexOf(fontStyle) < 0) {
              fontStyle = 'Regular';
            }
            fallbackName = 'Noto Sans ' + fontStyle;
            if (!fallbacks[fallbackName]) {
              fallbackName = 'Open Sans ' + fontStyle;
              if (!fallbacks[fallbackName]) {
                fallbackName = Object.keys(fallbacks)[0];
              }
            }

            console.error('ERROR: Trying to use', fallbackName, 'as a fallback');
            delete fallbacks[fallbackName];
            getFontPbf(null, fontPath, fallbackName, range, fallbacks).then(resolve, reject);
          } else {
            reject('Font load error: ' + name);
          }
        } else {
          resolve(data);
        }
      });
    } else {
      reject('Font not allowed: ' + name);
    }
  });
};

module.exports.getFontsPbf = function(allowedFonts, fontPath, names, range, fallbacks) {
  var fonts = names.split(',');
  var queue = [];
  fonts.forEach(function(font) {
    queue.push(
      getFontPbf(allowedFonts, fontPath, font, range, clone(allowedFonts || fallbacks))
    );
  });

  return Promise.all(queue).then(function(values) {
    return glyphCompose.combine(values);
  });
};
