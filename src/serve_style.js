'use strict';

import path from 'path';
import fs from 'node:fs';

import clone from 'clone';
import express from 'express';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

import { fixUrl, allowedOptions } from './utils.js';

const httpTester = /^https?:\/\//i;
const allowedSpriteFormats = allowedOptions(['png', 'json']);

/**
 * Checks if a string is a valid sprite scale and returns it if it is within the allowed range, and null if it does not conform.
 * @param {string} scale - The scale string to validate (e.g., '2x', '3x').
 * @param {number} [maxScale] - The maximum scale value. If no value is passed in, it defaults to a value of 3.
 * @returns {string|null} - The valid scale string or null if invalid.
 */
function allowedSpriteScales(scale, maxScale = 3) {
  if (!scale) {
    return '';
  }
  const match = scale?.match(/^([2-9]\d*)x$/);
  if (!match) {
    return null;
  }
  const parsedScale = parseInt(match[1], 10);
  if (parsedScale <= maxScale) {
    return `@${parsedScale}x`;
  }
  return null;
}
export const serve_style = {
  /**
   * Initializes the serve_style module.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} programOpts - An object containing the program options.
   * @returns {express.Application} The initialized Express application.
   */
  init: function (options, repo, programOpts) {
    const { verbose } = programOpts;
    const app = express().disable('x-powered-by');
    /**
     * Handles requests for style.json files.
     * @param {express.Request} req - Express request object.
     * @param {express.Response} res - Express response object.
     * @param {express.NextFunction} next - Express next function.
     * @param {string} req.params.id - ID of the style.
     * @returns {Promise<void>}
     */
    app.get('/:id/style.json', (req, res, next) => {
      const { id } = req.params;
      if (verbose) {
        console.log(`Handling style request for: /styles/${id}/style.json`);
      }
      try {
        const item = repo[id];
        if (!item) {
          return res.sendStatus(404);
        }
        const styleJSON_ = clone(item.styleJSON);
        for (const name of Object.keys(styleJSON_.sources)) {
          const source = styleJSON_.sources[name];
          source.url = fixUrl(req, source.url, item.publicUrl);
          if (typeof source.data == 'string') {
            source.data = fixUrl(req, source.data, item.publicUrl);
          }
        }
        if (styleJSON_.sprite) {
          if (Array.isArray(styleJSON_.sprite)) {
            styleJSON_.sprite.forEach((spriteItem) => {
              spriteItem.url = fixUrl(req, spriteItem.url, item.publicUrl);
            });
          } else {
            styleJSON_.sprite = fixUrl(req, styleJSON_.sprite, item.publicUrl);
          }
        }
        if (styleJSON_.glyphs) {
          styleJSON_.glyphs = fixUrl(req, styleJSON_.glyphs, item.publicUrl);
        }
        return res.send(styleJSON_);
      } catch (e) {
        next(e);
      }
    });

    /**
     * Handles GET requests for sprite images and JSON files.
     * @param {express.Request} req - Express request object.
     * @param {express.Response} res - Express response object.
     * @param {express.NextFunction} next - Express next function.
     * @param {string} req.params.id - ID of the sprite.
     * @param {string} [req.params.spriteID='default'] - ID of the specific sprite image, defaults to 'default'.
     * @param {string} [req.params.scale] - Scale of the sprite image, defaults to ''.
     * @param {string} req.params.format - Format of the sprite file, 'png' or 'json'.
     * @returns {Promise<void>}
     */
    app.get(`/:id/sprite{/:spriteID}{@:scale}{.:format}`, (req, res, next) => {
      const { spriteID = 'default', id, format, scale } = req.params;
      if (verbose) {
        console.log(
          `Handling sprite request for: /styles/%s/sprite/%s%s%s`,
          id,
          spriteID,
          scale ? scale : '',
          format ? '.' + format : '',
        );
      }
      const item = repo[id];
      const validatedFormat = allowedSpriteFormats(format);
      if (!item || !validatedFormat) {
        if (verbose)
          console.error(
            `Sprite item, format, or scale not found for: /styles/%s/sprite/%s%s%s`,
            id,
            spriteID,
            scale ? scale : '',
            format ? '.' + format : '',
          );
        return res.sendStatus(404);
      }
      const spriteScale = allowedSpriteScales(scale);
      const sprite = item.spritePaths.find((sprite) => sprite.id === spriteID);
      if (!sprite || spriteScale === null) {
        if (verbose)
          console.error(
            `Sprite not found for: /styles/%s/sprite/%s%s%s`,
            id,
            spriteID,
            scale ? scale : '',
            format ? '.' + format : '',
          );
        return res.status(400).send('Bad Sprite ID or Scale');
      }

      const filename = `${sprite.path}${spriteScale}.${validatedFormat}`;
      if (verbose) console.log(`Loading sprite from: %s`, filename);

      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.readFile(filename, (err, data) => {
        if (err) {
          if (verbose)
            console.error(
              'Sprite load error: %s, Error: %s',
              filename,
              String(err),
            );
          return res.sendStatus(404);
        }

        if (format === 'json') {
          res.header('Content-type', 'application/json');
        } else if (format === 'png') {
          res.header('Content-type', 'image/png');
        }
        if (verbose)
          console.log(
            `Responding with sprite data for /styles/%s/sprite/%s%s%s`,
            id,
            spriteID,
            scale ? scale : '',
            format ? '.' + format : '',
          );
        return res.send(data);
      });
    });

    return app;
  },
  /**
   * Removes an item from the repository.
   * @param {object} repo Repository object.
   * @param {string} id ID of the item to remove.
   * @returns {void}
   */
  remove: function (repo, id) {
    delete repo[id];
  },
  /**
   * Adds a new style to the repository.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} params Parameters object containing style path
   * @param {string} id ID of the style.
   * @param {object} programOpts - An object containing the program options
   * @param {Function} reportTiles Function for reporting tile sources.
   * @param {Function} reportFont Function for reporting font usage
   * @returns {boolean} true if add is succesful
   */
  add: function (
    options,
    repo,
    params,
    id,
    programOpts,
    reportTiles,
    reportFont,
  ) {
    const { publicUrl } = programOpts;
    const styleFile = path.resolve(options.paths.styles, params.style);

    let styleFileData;
    try {
      styleFileData = fs.readFileSync(styleFile); // TODO: could be made async if this function was
    } catch (e) {
      console.log(`Error reading style file "${params.style}"`);
      return false;
    }

    const styleJSON = JSON.parse(styleFileData);
    const validationErrors = validateStyleMin(styleJSON);
    if (validationErrors.length > 0) {
      console.log(`The file "${params.style}" is not a valid style file:`);
      for (const err of validationErrors) {
        console.log(`${err.line}: ${err.message}`);
      }
      return false;
    }

    for (const name of Object.keys(styleJSON.sources)) {
      const source = styleJSON.sources[name];
      let url = source.url;
      if (
        url &&
        (url.startsWith('pmtiles://') || url.startsWith('mbtiles://'))
      ) {
        const protocol = url.split(':')[0];

        let dataId = url.replace('pmtiles://', '').replace('mbtiles://', '');
        if (dataId.startsWith('{') && dataId.endsWith('}')) {
          dataId = dataId.slice(1, -1);
        }

        const mapsTo = (params.mapping || {})[dataId];
        if (mapsTo) {
          dataId = mapsTo;
        }

        const identifier = reportTiles(dataId, protocol);
        if (!identifier) {
          return false;
        }
        source.url = `local://data/${identifier}.json`;
      }

      let data = source.data;
      if (data && typeof data == 'string' && data.startsWith('file://')) {
        source.data =
          'local://files' +
          path.resolve(
            '/',
            data.replace('file://', '').replace(options.paths.files, ''),
          );
      }
    }

    for (const obj of styleJSON.layers) {
      if (obj['type'] === 'symbol') {
        const fonts = (obj['layout'] || {})['text-font'];
        if (fonts && fonts.length) {
          fonts.forEach(reportFont);
        } else {
          reportFont('Open Sans Regular');
          reportFont('Arial Unicode MS Regular');
        }
      }
    }

    let spritePaths = [];
    if (styleJSON.sprite) {
      if (!Array.isArray(styleJSON.sprite)) {
        if (!httpTester.test(styleJSON.sprite)) {
          let spritePath = path.join(
            options.paths.sprites,
            styleJSON.sprite
              .replace('{style}', path.basename(styleFile, '.json'))
              .replace(
                '{styleJsonFolder}',
                path.relative(options.paths.sprites, path.dirname(styleFile)),
              ),
          );
          styleJSON.sprite = `local://styles/${id}/sprite`;
          spritePaths.push({ id: 'default', path: spritePath });
        }
      } else {
        for (let spriteItem of styleJSON.sprite) {
          if (!httpTester.test(spriteItem.url)) {
            let spritePath = path.join(
              options.paths.sprites,
              spriteItem.url
                .replace('{style}', path.basename(styleFile, '.json'))
                .replace(
                  '{styleJsonFolder}',
                  path.relative(options.paths.sprites, path.dirname(styleFile)),
                ),
            );
            spriteItem.url = `local://styles/${id}/sprite/` + spriteItem.id;
            spritePaths.push({ id: spriteItem.id, path: spritePath });
          }
        }
      }
    }

    if (styleJSON.glyphs && !httpTester.test(styleJSON.glyphs)) {
      styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';
    }

    repo[id] = {
      styleJSON,
      spritePaths,
      publicUrl,
      name: styleJSON.name,
    };

    return true;
  },
};
