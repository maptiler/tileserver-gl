'use strict';

const path = require('path');
const fs = require('fs');

const clone = require('clone');
const glyphCompose = require('@mapbox/glyph-pbf-composite');


module.exports.getPublicUrl = (publicUrl, req) => {
  if (publicUrl) {
    const isRelative = !publicUrl.startsWith('http');
    if (isRelative && process.env.TILESERVER_GL_RESOLVE_RELATIVE_PUBLIC_URL === 'true') {
      return `${req.protocol}://${req.headers.host}${publicUrl}`;
    }
    return publicUrl;
  }
  return `${req.protocol}://${req.headers.host}/`;
}

module.exports.getTileUrls = (req, domains, path, format, publicUrl, aliases) => {

  if (domains) {
    if (domains.constructor === String && domains.length > 0) {
      domains = domains.split(',');
    }
    const host = req.headers.host;
    const hostParts = host.split('.');
    const relativeSubdomainsUsable = hostParts.length > 1 &&
      !/^([0-9]{1,3}\.){3}[0-9]{1,3}(\:[0-9]+)?$/.test(host);
    const newDomains = [];
    for (const domain of domains) {
      if (domain.indexOf('*') !== -1) {
        if (relativeSubdomainsUsable) {
          const newParts = hostParts.slice(1);
          newParts.unshift(domain.replace('*', hostParts[0]));
          newDomains.push(newParts.join('.'));
        }
      } else {
        newDomains.push(domain);
      }
    }
    domains = newDomains;
  }
  if (!domains || domains.length == 0) {
    domains = [req.headers.host];
  }

  const key = req.query.key;
  const queryParams = [];
  if (req.query.key) {
    queryParams.push(`key=${encodeURIComponent(req.query.key)}`);
  }
  if (req.query.style) {
    queryParams.push(`style=${encodeURIComponent(req.query.style)}`);
  }
  const query = queryParams.length > 0 ? (`?${queryParams.join('&')}`) : '';

  if (aliases && aliases[format]) {
    format = aliases[format];
  }

  const uris = [];
  if (!publicUrl) {
    for (const domain of domains) {
      uris.push(`${req.protocol}://${domain}/${path}/{z}/{x}/{y}.${format}${query}`);
    }
  } else {
    uris.push(`${publicUrl}${path}/{z}/{x}/{y}.${format}${query}`)
  }

  return uris;
};

module.exports.fixTileJSONCenter = tileJSON => {
  if (tileJSON.bounds && !tileJSON.center) {
    const fitWidth = 1024;
    const tiles = fitWidth / 256;
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

const getFontPbf = (allowedFonts, fontPath, name, range, fallbacks) => new Promise((resolve, reject) => {
  if (!allowedFonts || (allowedFonts[name] && fallbacks)) {
    const filename = path.join(fontPath, name, `${range}.pbf`);
    if (!fallbacks) {
      fallbacks = clone(allowedFonts || {});
    }
    delete fallbacks[name];
    fs.readFile(filename, (err, data) => {
      if (err) {
        console.error(`ERROR: Font not found: ${name}`);
        if (fallbacks && Object.keys(fallbacks).length) {
          let fallbackName;

          let fontStyle = name.split(' ').pop();
          if (['Regular', 'Bold', 'Italic'].indexOf(fontStyle) < 0) {
            fontStyle = 'Regular';
          }
          fallbackName = `Noto Sans ${fontStyle}`;
          if (!fallbacks[fallbackName]) {
            fallbackName = `Open Sans ${fontStyle}`;
            if (!fallbacks[fallbackName]) {
              fallbackName = Object.keys(fallbacks)[0];
            }
          }

          console.error(`ERROR: Trying to use ${fallbackName} as a fallback`);
          delete fallbacks[fallbackName];
          getFontPbf(null, fontPath, fallbackName, range, fallbacks).then(resolve, reject);
        } else {
          reject(`Font load error: ${name}`);
        }
      } else {
        resolve(data);
      }
    });
  } else {
    reject(`Font not allowed: ${name}`);
  }
});

module.exports.getFontsPbf = (allowedFonts, fontPath, names, range, fallbacks) => {
  const fonts = names.split(',');
  const queue = [];
  for (const font of fonts) {
    queue.push(
      getFontPbf(allowedFonts, fontPath, font, range, clone(allowedFonts || fallbacks))
    );
  }

  return Promise.all(queue).then(values => glyphCompose.combine(values));
};
