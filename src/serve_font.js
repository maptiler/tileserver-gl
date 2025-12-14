'use strict';

import express from 'express';

import { getFontsPbf, listFonts } from './utils.js';

/**
 * Initializes and returns an Express app that serves font files.
 * @param {object} options - Configuration options for the server.
 * @param {object} allowedFonts - An object containing allowed fonts.
 * @param {object} programOpts - An object containing the program options.
 * @returns {Promise<express.Application>} - A promise that resolves to the Express app.
 */
export async function serve_font(options, allowedFonts, programOpts) {
  const { verbose } = programOpts;
  const app = express().disable('x-powered-by');

  const lastModified = new Date().toUTCString();

  const fontPath = options.paths.fonts;

  const existingFonts = {};

  /**
   * Handles requests for a font file.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {string} req.params.fontstack - Name of the font stack.
   * @param {string} req.params.range - The range of the font (e.g. 0-255).
   * @returns {Promise<void>}
   */
  app.get('/fonts/:fontstack/:range.pbf', async (req, res) => {
    const sRange = String(req.params.range).replace(/\n|\r/g, '');
    const sFontStack = String(decodeURI(req.params.fontstack)).replace(
      /\n|\r/g,
      '',
    );

    if (verbose >= 1) {
      console.log(
        `Handling font request for: /fonts/%s/%s.pbf`,
        sFontStack,
        sRange,
      );
    }

    const modifiedSince = req.get('if-modified-since');
    const cc = req.get('cache-control');
    if (modifiedSince && (!cc || cc.indexOf('no-cache') === -1)) {
      if (
        new Date(lastModified).getTime() === new Date(modifiedSince).getTime()
      ) {
        return res.sendStatus(304);
      }
    }

    try {
      const concatenated = await getFontsPbf(
        options.serveAllFonts ? null : allowedFonts,
        fontPath,
        sFontStack,
        sRange,
        existingFonts,
      );
      res.header('Content-type', 'application/x-protobuf');
      res.header('Last-Modified', lastModified);
      return res.send(concatenated);
    } catch (err) {
      console.error(
        `Error serving font: %s/%s.pbf, Error: %s`,
        sFontStack,
        sRange,
        String(err),
      );
      return res
        .status(400)
        .header('Content-Type', 'text/plain')
        .send('Error serving font');
    }
  });

  /**
   * Handles requests for a list of all available fonts.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @returns {void}
   */
  app.get('/fonts.json', (req, res) => {
    if (verbose >= 1) {
      console.log('Handling list font request for /fonts.json');
    }
    res.header('Content-type', 'application/json');
    return res.send(
      Object.keys(options.serveAllFonts ? existingFonts : allowedFonts).sort(),
    );
  });

  const fonts = await listFonts(options.paths.fonts);
  Object.assign(existingFonts, fonts);
  return app;
}
