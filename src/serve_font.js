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
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {string} req.params.fontstack - Name of the font stack.
   * @param {string} req.params.range - The range of the font (e.g. 0-255).
   * @returns {Promise<void>}
   */
  app.get('/fonts/:fontstack/:range.pbf', async (req, res) => {
    if (verbose) {
      console.log(req.params);
    }
    const fontstack = decodeURI(req.params.fontstack);
    const range = req.params.range;

    try {
      const concatenated = await getFontsPbf(
        options.serveAllFonts ? null : allowedFonts,
        fontPath,
        fontstack,
        range,
        existingFonts,
      );

      res.header('Content-type', 'application/x-protobuf');
      res.header('Last-Modified', lastModified);
      return res.send(concatenated);
    } catch (err) {
      console.error(`Error serving font: ${fontstack}/${range}.pbf`, err);
      return res
        .status(400)
        .header('Content-Type', 'text/plain')
        .send('Error serving font');
    }
  });

  /**
   * Handles requests for a list of all available fonts.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @returns {void}
   */
  app.get('/fonts.json', (req, res) => {
    res.header('Content-type', 'application/json');
    return res.send(
      Object.keys(options.serveAllFonts ? existingFonts : allowedFonts).sort(),
    );
  });

  const fonts = await listFonts(options.paths.fonts);
  Object.assign(existingFonts, fonts);
  return app;
}
