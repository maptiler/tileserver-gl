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
            var fallbackName = Object.keys(fallbacks)[0];
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

  return new Promise(function(resolve, reject) {
    Promise.all(queue).then(function(values) {
      return resolve(glyphCompose.combine(values));
    }, reject);
  });
};

// From: https://github.com/mapbox/polyline/blob/master/src/polyline.js
module.exports.decodePolyline = function(str, precision) {
    var index = 0,
        lat = 0,
        lng = 0,
        coordinates = [],
        shift = 0,
        result = 0,
        byte = null,
        latitude_change,
        longitude_change,
        factor = Math.pow(10, precision || 5);

    if(str==null){
      return [];
    }

    // Coordinates have variable length when encoded, so just keep
    // track of whether we've hit the end of the string. In each
    // loop iteration, a single coordinate is decoded.
    while (index < str.length) {

        // Reset shift, result, and byte
        byte = null;
        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        shift = result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        lat += latitude_change;
        lng += longitude_change;

        coordinates.push([lng / factor, lat / factor]);
    }

    return coordinates;
};