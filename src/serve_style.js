'use strict';

import path from 'path';

import clone from 'clone';
import express from 'express';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

import {
  allowedSpriteScales,
  allowedSpriteFormats,
  fixUrl,
  readFile,
  isValidHttpUrl,
} from './utils.js';

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
      if (verbose >= 1) {
        console.log(
          'Handling style request for: /styles/%s/style.json',
          String(id).replace(/\n|\r/g, ''),
        );
      }
      try {
        // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
        const item = repo[id];
        if (!item) {
          return res.sendStatus(404);
        }
        const styleJSON_ = clone(item.styleJSON);
        for (const name of Object.keys(styleJSON_.sources)) {
          // eslint-disable-next-line security/detect-object-injection -- name is from Object.keys of style sources
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
    app.get(
      `/:id/sprite{/:spriteID}{@:scale}{.:format}`,
      async (req, res, next) => {
        const { spriteID = 'default', id, format, scale } = req.params;
        const sanitizedId = String(id).replace(/\n|\r/g, '');
        const sanitizedScale = scale ? String(scale).replace(/\n|\r/g, '') : '';
        const sanitizedSpriteID = String(spriteID).replace(/\n|\r/g, '');
        const sanitizedFormat = format
          ? '.' + String(format).replace(/\n|\r/g, '')
          : '';
        if (verbose >= 1) {
          console.log(
            `Handling sprite request for: /styles/%s/sprite/%s%s%s`,
            sanitizedId,
            sanitizedSpriteID,
            sanitizedScale,
            sanitizedFormat,
          );
        }
        // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
        const item = repo[id];
        const validatedFormat = allowedSpriteFormats(format);
        if (!item || !validatedFormat) {
          if (verbose >= 1)
            console.error(
              `Sprite item or format not found for: /styles/%s/sprite/%s%s%s`,
              sanitizedId,
              sanitizedSpriteID,
              sanitizedScale,
              sanitizedFormat,
            );
          return res.sendStatus(404);
        }
        const sprite = item.spritePaths.find(
          (sprite) => sprite.id === spriteID,
        );
        const spriteScale = allowedSpriteScales(scale);
        if (!sprite || spriteScale === null) {
          if (verbose >= 1)
            console.error(
              `Bad Sprite ID or Scale for: /styles/%s/sprite/%s%s%s`,
              sanitizedId,
              sanitizedSpriteID,
              sanitizedScale,
              sanitizedFormat,
            );
          return res.status(400).send('Bad Sprite ID or Scale');
        }

        const modifiedSince = req.get('if-modified-since');
        const cc = req.get('cache-control');
        if (modifiedSince && (!cc || cc.indexOf('no-cache') === -1)) {
          if (
            new Date(item.lastModified).getTime() ===
            new Date(modifiedSince).getTime()
          ) {
            return res.sendStatus(304);
          }
        }

        const sanitizedSpritePath = sprite.path.replace(/^(\.\.\/)+/, '');
        const filename = `${sanitizedSpritePath}${spriteScale}.${validatedFormat}`;
        if (verbose >= 1) console.log(`Loading sprite from: %s`, filename);
        try {
          const data = await readFile(filename);

          if (validatedFormat === 'json') {
            res.header('Content-type', 'application/json');
          } else if (validatedFormat === 'png') {
            res.header('Content-type', 'image/png');
          }
          if (verbose >= 1)
            console.log(
              `Responding with sprite data for /styles/%s/sprite/%s%s%s`,
              sanitizedId,
              sanitizedSpriteID,
              sanitizedScale,
              sanitizedFormat,
            );
          res.set({ 'Last-Modified': item.lastModified });
          return res.send(data);
        } catch (err) {
          if (verbose >= 1) {
            console.error(
              'Sprite load error: %s, Error: %s',
              filename,
              String(err),
            );
          }
          return res.sendStatus(404);
        }
      },
    );

    return app;
  },
  /**
   * Removes an item from the repository.
   * @param {object} repo Repository object.
   * @param {string} id ID of the item to remove.
   * @returns {void}
   */
  remove: function (repo, id) {
    // eslint-disable-next-line security/detect-object-injection -- id is function parameter for removal
    delete repo[id];
  },
  /**
   * Adds a new style to the repository.
   * @param {object} options Configuration options.
   * @param {object} repo Repository object.
   * @param {object} params Parameters object containing style path
   * @param {string} id ID of the style.
   * @param {object} programOpts - An object containing the program options
   * @param {object} style pre-fetched/read StyleJSON object.
   * @param {(dataId: string, protocol: string) => string|undefined} reportTiles Function for reporting tile sources.
   * @param {(font: string) => void} reportFont Function for reporting font usage
   * @returns {boolean} true if add is successful
   */
  add: function (
    options,
    repo,
    params,
    id,
    programOpts,
    style,
    reportTiles,
    reportFont,
  ) {
    const { publicUrl } = programOpts;
    const styleFile = path.resolve(options.paths.styles, params.style);
    const styleJSON = clone(style);

    // Sanitize style for validation: remove non-spec properties (e.g., 'sparse')
    // so that validateStyleMin doesn't reject valid styles containing our custom flags.
    const styleForValidation = clone(styleJSON);
    if (styleForValidation.sources) {
      for (const name of Object.keys(styleForValidation.sources)) {
        if (
          // eslint-disable-next-line security/detect-object-injection -- name is from Object.keys of styleForValidation.sources
          styleForValidation.sources[name] &&
          // eslint-disable-next-line security/detect-object-injection -- name is from Object.keys of styleForValidation.sources
          'sparse' in styleForValidation.sources[name]
        ) {
          try {
            // eslint-disable-next-line security/detect-object-injection -- name is from Object.keys of styleForValidation.sources
            delete styleForValidation.sources[name].sparse;
          } catch (_err) {
            // ignore any deletion errors and continue validation
          }
        }
      }
    }

    const validationErrors = validateStyleMin(styleForValidation);
    if (validationErrors.length > 0) {
      console.log(`The file "${params.style}" is not a valid style file:`);
      for (const err of validationErrors) {
        console.log(`${err.line}: ${err.message}`);
      }
      return false;
    }

    for (const name of Object.keys(styleJSON.sources)) {
      // eslint-disable-next-line security/detect-object-injection -- name is from Object.keys of style sources
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

        // eslint-disable-next-line security/detect-object-injection -- dataId is from style source URL, used for mapping lookup
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
        if (!isValidHttpUrl(styleJSON.sprite)) {
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
          if (!isValidHttpUrl(spriteItem.url)) {
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

    if (styleJSON.glyphs && !isValidHttpUrl(styleJSON.glyphs)) {
      styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';
    }

    // eslint-disable-next-line security/detect-object-injection -- id is from config file style names
    repo[id] = {
      styleJSON,
      spritePaths,
      publicUrl,
      name: styleJSON.name,
      lastModified: new Date().toUTCString(),
    };

    return true;
  },
};
