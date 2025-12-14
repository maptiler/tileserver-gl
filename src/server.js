#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'path';
import fnv1a from '@sindresorhus/fnv1a';
import chokidar from 'chokidar';
import clone from 'clone';
import cors from 'cors';
import enableShutdown from 'http-shutdown';
import express from 'express';
import handlebars from 'handlebars';
import { SphericalMercator } from '@mapbox/sphericalmercator';
const mercator = new SphericalMercator();
import morgan from 'morgan';
import { serve_data } from './serve_data.js';
import { serve_style } from './serve_style.js';
import { serve_font } from './serve_font.js';
import {
  allowedTileSizes,
  getTileUrls,
  getPublicUrl,
  isValidHttpUrl,
  isValidRemoteUrl,
} from './utils.js';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(__dirname + '/../package.json', 'utf8'),
);
const isLight = packageJson.name.slice(-6) === '-light';

const { serve_rendered } = await import(
  `${!isLight ? `./serve_rendered.js` : `./serve_light.js`}`
);

/**
 *  Starts the server.
 * @param {object} opts - Configuration options for the server.
 * @returns {Promise<object>} - A promise that resolves to the server object.
 */
async function start(opts) {
  console.log('Starting server');

  const app = express().disable('x-powered-by');
  const serving = {
    styles: {},
    rendered: {},
    data: {},
    fonts: {},
  };

  app.enable('trust proxy');

  if (process.env.NODE_ENV !== 'test') {
    const defaultLogFormat =
      process.env.NODE_ENV === 'production' ? 'tiny' : 'dev';
    const logFormat = opts.logFormat || defaultLogFormat;
    app.use(
      morgan(logFormat, {
        stream: opts.logFile
          ? fs.createWriteStream(opts.logFile, { flags: 'a' })
          : process.stdout,
        skip: (req, res) =>
          opts.silent && (res.statusCode === 200 || res.statusCode === 304),
      }),
    );
  }

  let config = opts.config || null;
  let configPath = null;
  if (opts.configPath) {
    configPath = path.resolve(opts.configPath);
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      console.log('ERROR: Config file not found or invalid!');
      console.log('   See README.md for instructions and sample data.');
      process.exit(1);
    }
  }
  if (!config) {
    console.log('ERROR: No config file not specified!');
    process.exit(1);
  }

  const options = config.options || {};
  const paths = options.paths || {};
  options.paths = paths;
  paths.root = path.resolve(
    configPath ? path.dirname(configPath) : process.cwd(),
    paths.root || '',
  );
  paths.styles = path.resolve(paths.root, paths.styles || '');
  paths.fonts = path.resolve(paths.root, paths.fonts || '');
  paths.sprites = path.resolve(paths.root, paths.sprites || '');
  paths.mbtiles = path.resolve(paths.root, paths.mbtiles || '');
  paths.pmtiles = path.resolve(paths.root, paths.pmtiles || '');
  paths.icons = paths.icons
    ? path.resolve(paths.root, paths.icons)
    : path.resolve(__dirname, '../public/resources/images');
  paths.files = paths.files
    ? path.resolve(paths.root, paths.files)
    : path.resolve(__dirname, '../public/files');

  const startupPromises = [];

  for (const type of Object.keys(paths)) {
    // eslint-disable-next-line security/detect-object-injection -- paths[type] constructed from validated config paths
    if (!fs.existsSync(paths[type])) {
      console.error(
        // eslint-disable-next-line security/detect-object-injection -- type is from Object.keys of paths config
        `The specified path for "${type}" does not exist (${paths[type]}).`,
      );
      process.exit(1);
    }
  }

  /**
   * Recursively get all files within a directory.
   * Inspired by https://stackoverflow.com/a/45130990/10133863
   * @param {string} directory Absolute path to a directory to get files from.
   * @returns {Promise<string[]>} - A promise that resolves to an array of file paths relative to the icon directory.
   */
  async function getFiles(directory) {
    // Fetch all entries of the directory and attach type information

    const dirEntries = await fs.promises.readdir(directory, {
      withFileTypes: true,
    });

    // Iterate through entries and return the relative file-path to the icon directory if it is not a directory
    // otherwise initiate a recursive call
    const files = await Promise.all(
      dirEntries.map((dirEntry) => {
        const entryPath = path.resolve(directory, dirEntry.name);
        return dirEntry.isDirectory()
          ? getFiles(entryPath)
          : entryPath.replace(paths.icons + path.sep, '');
      }),
    );

    // Flatten the list of files to a single array
    return files.flat();
  }

  // Load all available icons into a settings object
  startupPromises.push(
    getFiles(paths.icons).then((files) => {
      paths.availableIcons = files;
    }),
  );

  if (options.dataDecorator) {
    try {
      const dataDecoratorPath = path.resolve(paths.root, options.dataDecorator);

      const module = await import(dataDecoratorPath);
      options.dataDecoratorFunc = module.default;
    } catch (e) {
      console.error(`Error loading data decorator: ${e}`);
      // Intentionally don't set options.dataDecoratorFunc - let it remain undefined
    }
  }

  const data = clone(config.data || {});

  if (opts.cors) {
    app.use(cors());
  }

  app.use('/data/', serve_data.init(options, serving.data, opts));
  app.use('/files/', express.static(paths.files));
  app.use('/styles/', serve_style.init(options, serving.styles, opts));
  if (!isLight) {
    startupPromises.push(
      serve_rendered.init(options, serving.rendered, opts).then((sub) => {
        app.use('/styles/', sub);
      }),
    );
  }
  /**
   * Adds a style to the server.
   * @param {string} id - The ID of the style.
   * @param {object} item - The style configuration object.
   * @param {boolean} allowMoreData - Whether to allow adding more data sources.
   * @param {boolean} reportFonts - Whether to report fonts.
   * @returns {Promise<boolean>} - Returns true if successful, false otherwise.
   */
  async function addStyle(id, item, allowMoreData, reportFonts) {
    let success = true;

    let styleJSON;
    try {
      // Style files should only be HTTP/HTTPS, not S3
      if (isValidHttpUrl(item.style)) {
        const res = await fetch(item.style);
        if (!res.ok) {
          throw new Error(`fetch error ${res.status}`);
        }
        styleJSON = await res.json();
      } else {
        const styleFile = path.resolve(options.paths.styles, item.style);

        const styleFileData = await fs.promises.readFile(styleFile);
        styleJSON = JSON.parse(styleFileData);
      }
    } catch (err) {
      console.log(`Error getting style file "${item.style}"`);
      console.error(err && err.stack ? err.stack : err);
      return false;
    }

    if (item.serve_data !== false) {
      success = serve_style.add(
        options,
        serving.styles,
        item,
        id,
        opts,
        styleJSON,
        (styleSourceId, protocol) => {
          let dataItemId;
          for (const id of Object.keys(data)) {
            if (id === styleSourceId) {
              // Style id was found in data ids, return that id
              dataItemId = id;
              break;
            } else {
              // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of data config
              const sourceData = data[id];

              if (
                (sourceData.pmtiles && sourceData.pmtiles === styleSourceId) ||
                (sourceData.mbtiles && sourceData.mbtiles === styleSourceId)
              ) {
                dataItemId = id;
                break;
              }
            }
          }
          if (dataItemId) {
            // input files exists in the data config, return found id
            return dataItemId;
          } else {
            if (!allowMoreData) {
              console.log(
                `ERROR: style "${item.style}" using unknown file "${styleSourceId}"! Skipping...`,
              );
              return undefined;
            } else {
              let id =
                styleSourceId.substr(0, styleSourceId.lastIndexOf('.')) ||
                styleSourceId;
              // PMTiles can be remote URLs (HTTP or S3), generate unique ID for remote sources
              if (isValidRemoteUrl(styleSourceId)) {
                id =
                  fnv1a(styleSourceId) + '_' + id.replace(/^.*\/(.*)$/, '$1');
              }
              // eslint-disable-next-line security/detect-object-injection -- id is being checked for existence before modification
              while (data[id]) id += '_'; //if the data source id already exists, add a "_" untill it doesn't
              //Add the new data source to the data array.
              // eslint-disable-next-line security/detect-object-injection -- id is constructed above to be unique
              data[id] = {
                [protocol]: styleSourceId,
              };

              return id;
            }
          }
        },
        (font) => {
          if (reportFonts) {
            // eslint-disable-next-line security/detect-object-injection -- font is font name from style
            serving.fonts[font] = true;
          }
        },
      );
    }
    if (success && item.serve_rendered !== false) {
      if (!isLight) {
        startupPromises.push(
          serve_rendered.add(
            options,
            serving.rendered,
            item,
            id,
            opts,
            styleJSON,
            function dataResolver(styleSourceId) {
              let resolvedFileType;
              let resolvedInputFile;
              let resolvedS3Profile;
              let resolvedRequestPayer;
              let resolvedS3Region;
              let resolvedS3UrlFormat;
              let resolvedSparse;

              // Debug logging to see what we're trying to match
              if (opts.verbose >= 3) {
                console.log(
                  `[dataResolver] Looking for styleSourceId: ${styleSourceId}`,
                );
                console.log(
                  `[dataResolver] Available data keys: ${Object.keys(data).join(', ')}`,
                );
              }

              for (const id of Object.keys(data)) {
                // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of data config
                const sourceData = data[id];
                let currentFileType;
                let currentInputFileValue;

                // Check for recognized file type keys
                if (Object.hasOwn(sourceData, 'pmtiles')) {
                  currentFileType = 'pmtiles';
                  currentInputFileValue = sourceData.pmtiles;
                } else if (Object.hasOwn(sourceData, 'mbtiles')) {
                  currentFileType = 'mbtiles';
                  currentInputFileValue = sourceData.mbtiles;
                }

                if (currentFileType && currentInputFileValue) {
                  // Debug logging
                  if (opts.verbose >= 3) {
                    console.log(
                      `[dataResolver] Checking id="${id}", file="${currentInputFileValue}"`,
                    );
                  }

                  // Check if this source matches the styleSourceId
                  // Match by ID, by file path, or by base filename
                  const matchById = styleSourceId === id;
                  const matchByFile = styleSourceId === currentInputFileValue;
                  const matchByBasename =
                    styleSourceId.includes(currentInputFileValue) ||
                    currentInputFileValue.includes(styleSourceId);

                  if (matchById || matchByFile || matchByBasename) {
                    if (opts.verbose >= 2) {
                      console.log(
                        `[dataResolver] Match found for styleSourceId: ${styleSourceId}. (byId=${matchById}, byFile=${matchByFile}, byBasename=${matchByBasename})`,
                      );
                    }

                    resolvedFileType = currentFileType;
                    resolvedInputFile = currentInputFileValue;

                    // Get s3Profile if present
                    if (Object.hasOwn(sourceData, 's3Profile')) {
                      resolvedS3Profile = sourceData.s3Profile;
                    }

                    // Get s3UrlFormat if present
                    if (Object.hasOwn(sourceData, 's3UrlFormat')) {
                      resolvedS3UrlFormat = sourceData.s3UrlFormat;
                    }

                    // Get requestPayer if present
                    if (Object.hasOwn(sourceData, 'requestPayer')) {
                      resolvedRequestPayer = !!sourceData.requestPayer;
                    }

                    // Get s3Region if present
                    if (Object.hasOwn(sourceData, 's3Region')) {
                      resolvedS3Region = sourceData.s3Region;
                    }

                    // Get sparse: per-source overrides global, default to true
                    resolvedSparse =
                      sourceData.sparse ?? options.sparse ?? true;

                    break; // Found our match, exit the outer loop
                  }
                }
              }

              // If no match was found
              if (!resolvedInputFile || !resolvedFileType) {
                console.warn(
                  `Data source not found for styleSourceId: ${styleSourceId}`,
                );
                console.warn(
                  `Available data sources: ${Object.keys(data)
                    .map((id) => {
                      // eslint-disable-next-line security/detect-object-injection
                      const src = data[id];
                      return `${id} -> ${src.pmtiles || src.mbtiles || 'unknown'}`;
                    })
                    .join(', ')}`,
                );
                return {
                  inputFile: undefined,
                  fileType: undefined,
                  s3Profile: undefined,
                  requestPayer: false,
                  s3Region: undefined,
                  s3UrlFormat: undefined,
                  sparse: true,
                };
              }

              // PMTiles supports remote URLs (HTTP and S3), skip path resolution for those
              if (!isValidRemoteUrl(resolvedInputFile)) {
                // Ensure options.paths and options.paths[resolvedFileType] exist before trying to use them
                if (
                  options &&
                  options.paths &&
                  // eslint-disable-next-line security/detect-object-injection -- resolvedFileType is either 'pmtiles' or 'mbtiles'
                  options.paths[resolvedFileType]
                ) {
                  resolvedInputFile = path.resolve(
                    // eslint-disable-next-line security/detect-object-injection -- resolvedFileType is either 'pmtiles' or 'mbtiles'
                    options.paths[resolvedFileType],
                    resolvedInputFile,
                  );
                } else {
                  console.warn(
                    `Path configuration missing for fileType: ${resolvedFileType}. Using relative path for: ${resolvedInputFile}`,
                  );
                }
              }

              return {
                inputFile: resolvedInputFile,
                fileType: resolvedFileType,
                s3Profile: resolvedS3Profile,
                requestPayer: resolvedRequestPayer,
                s3Region: resolvedS3Region,
                s3UrlFormat: resolvedS3UrlFormat,
                sparse: resolvedSparse,
              };
            },
          ),
        );
      } else {
        item.serve_rendered = false;
      }
    }
    return success;
  }

  // Collect style loading promises separately
  const stylePromises = [];
  for (const id of Object.keys(config.styles || {})) {
    // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of config.styles
    const item = config.styles[id];
    if (!item.style || item.style.length === 0) {
      console.log(`Missing "style" property for ${id}`);
      continue;
    }
    stylePromises.push(addStyle(id, item, true, true));
  }

  // Wait for styles to finish loading, then load data sources
  // This ensures data sources added by styles are included
  startupPromises.push(
    Promise.all(stylePromises).then(() => {
      const dataLoadPromises = [];
      for (const id of Object.keys(data)) {
        // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of data config
        const item = data[id];

        if (!item.pmtiles && !item.mbtiles) {
          console.log(
            `Missing "pmtiles" or "mbtiles" property for ${id} data source`,
          );
          continue;
        }

        dataLoadPromises.push(
          serve_data.add(options, serving.data, item, id, opts),
        );
      }
      return Promise.all(dataLoadPromises);
    }),
  );

  startupPromises.push(
    serve_font(options, serving.fonts, opts).then((sub) => {
      app.use('/', sub);
    }),
  );
  if (options.serveAllStyles) {
    fs.readdir(options.paths.styles, { withFileTypes: true }, (err, files) => {
      if (err) {
        return;
      }
      for (const file of files) {
        if (file.isFile() && path.extname(file.name).toLowerCase() == '.json') {
          const id = path.basename(file.name, '.json');
          const item = {
            style: file.name,
          };
          addStyle(id, item, false, false);
        }
      }
    });

    const watcher = chokidar.watch(
      path.join(options.paths.styles, '*.json'),
      {},
    );
    watcher.on('all', (eventType, filename) => {
      if (filename) {
        const id = path.basename(filename, '.json');
        console.log(`Style "${id}" changed, updating...`);

        serve_style.remove(serving.styles, id);
        if (!isLight) {
          serve_rendered.remove(serving.rendered, id);
        }

        if (eventType == 'add' || eventType == 'change') {
          const item = {
            style: filename,
          };
          addStyle(id, item, false, false);
        }
      }
    });
  }
  /**
   * Handles requests for a list of available styles.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {object} next - Express next middleware function.
   * @param {string} [req.query.key] - Optional API key.
   * @returns {void}
   */
  app.get('/styles.json', (req, res, next) => {
    const result = [];
    const query = req.query.key
      ? `?key=${encodeURIComponent(req.query.key)}`
      : '';
    for (const id of Object.keys(serving.styles)) {
      // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.styles
      const styleJSON = serving.styles[id].styleJSON;
      result.push({
        version: styleJSON.version,
        name: styleJSON.name,
        id,
        url: `${getPublicUrl(
          opts.publicUrl,
          req,
        )}styles/${id}/style.json${query}`,
      });
    }
    res.send(result);
  });

  /**
   * Adds TileJSON metadata to an array.
   * @param {Array} arr - The array to add TileJSONs to
   * @param {object} req - The express request object.
   * @param {string} type - The type of resource
   * @param {number} tileSize - The tile size.
   * @returns {Array} - An array of TileJSON objects.
   */
  function addTileJSONs(arr, req, type, tileSize) {
    // eslint-disable-next-line security/detect-object-injection -- type is 'rendered' or 'data', validated by caller
    for (const id of Object.keys(serving[type])) {
      // eslint-disable-next-line security/detect-object-injection -- type is 'rendered' or 'data', id is from Object.keys
      const info = clone(serving[type][id].tileJSON);
      let path = '';
      if (type === 'rendered') {
        path = `styles/${id}`;
      } else {
        path = `${type}/${id}`;
      }
      info.tiles = getTileUrls(
        req,
        info.tiles,
        path,
        tileSize,
        info.format,
        opts.publicUrl,
        {
          pbf: options.pbfAlias,
        },
      );
      arr.push(info);
    }
    return arr;
  }

  /**
   * Handles requests for a rendered tilejson endpoint.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {object} next - Express next middleware function.
   * @param {string} req.params.tileSize - Optional tile size parameter.
   * @returns {void}
   */
  app.get('{/:tileSize}/rendered.json', (req, res, next) => {
    const tileSize = allowedTileSizes(req.params['tileSize']);
    res.send(addTileJSONs([], req, 'rendered', parseInt(tileSize, 10)));
  });

  /**
   * Handles requests for a data tilejson endpoint.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @returns {void}
   */
  app.get('/data.json', (req, res) => {
    res.send(addTileJSONs([], req, 'data', undefined));
  });

  /**
   * Handles requests for a combined rendered and data tilejson endpoint.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {object} next - Express next middleware function.
   * @param {string} req.params.tileSize - Optional tile size parameter.
   * @returns {void}
   */
  app.get('{/:tileSize}/index.json', (req, res, next) => {
    const tileSize = allowedTileSizes(req.params['tileSize']);
    res.send(
      addTileJSONs(
        addTileJSONs([], req, 'rendered', parseInt(tileSize, 10)),
        req,
        'data',
        undefined,
      ),
    );
  });

  // ------------------------------------
  // serve web presentations
  app.use('/', express.static(path.join(__dirname, '../public/resources')));

  const templates = path.join(__dirname, '../public/templates');

  /**
   * Serves a Handlebars template.
   * @param {string} urlPath - The URL path to serve the template at
   * @param {string} template - The name of the template file
   * @param {(req: object) => object|null} dataGetter - A function to get data to be passed to the template.
   * @returns {void}
   */
  function serveTemplate(urlPath, template, dataGetter) {
    let templateFile = `${templates}/${template}.tmpl`;
    if (template === 'index') {
      if (options.frontPage === false) {
        return;
      } else if (
        options.frontPage &&
        options.frontPage.constructor === String
      ) {
        templateFile = path.resolve(paths.root, options.frontPage);
      }
    }
    try {
      const content = fs.readFileSync(templateFile, 'utf-8');
      const compiled = handlebars.compile(content.toString());
      app.get(urlPath, (req, res, next) => {
        if (opts.verbose >= 1) {
          console.log(`Serving template at path: ${urlPath}`);
        }
        let data = {};
        if (dataGetter) {
          data = dataGetter(req);
          if (data) {
            data['server_version'] =
              `${packageJson.name} v${packageJson.version}`;
            data['public_url'] = opts.publicUrl || '/';
            data['is_light'] = isLight;
            data['key_query_part'] = req.query.key
              ? `key=${encodeURIComponent(req.query.key)}&amp;`
              : '';
            data['key_query'] = req.query.key
              ? `?key=${encodeURIComponent(req.query.key)}`
              : '';
            if (template === 'wmts') res.set('Content-Type', 'text/xml');
            return res.status(200).send(compiled(data));
          } else {
            if (opts.verbose >= 1) {
              console.log(`Forwarding request for: ${urlPath} to next route`);
            }
            next('route');
          }
        }
      });
    } catch (err) {
      console.error(`Error reading template file: ${templateFile}`, err);
      throw new Error(`Template not found: ${err.message}`); //throw an error so that the server doesnt start
    }
  }

  /**
   * Handles requests for the index page, providing a list of available styles and data.
   * @param {object} req - Express request object.
   * @returns {object|null} Template data object or null
   */
  serveTemplate('/', 'index', (req) => {
    let styles = {};
    for (const id of Object.keys(serving.styles || {})) {
      let style = {
        // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.styles
        ...serving.styles[id],
        // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.styles
        serving_data: serving.styles[id],
        // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.styles
        serving_rendered: serving.rendered[id],
      };

      if (style.serving_rendered) {
        const { center } = style.serving_rendered.tileJSON;
        if (center) {
          style.viewer_hash = `#${center[2]}/${center[1].toFixed(
            5,
          )}/${center[0].toFixed(5)}`;

          const centerPx = mercator.px([center[0], center[1]], center[2]);
          // Set thumbnail default size to be 256px x 256px
          style.thumbnail = `${Math.floor(center[2])}/${Math.floor(
            centerPx[0] / 256,
          )}/${Math.floor(centerPx[1] / 256)}.png`;
        }

        const tileSize = 512;
        style.xyz_link = getTileUrls(
          req,
          style.serving_rendered.tileJSON.tiles,
          `styles/${id}`,
          tileSize,
          style.serving_rendered.tileJSON.format,
          opts.publicUrl,
        )[0];
      }

      // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.styles
      styles[id] = style;
    }
    let datas = {};
    for (const id of Object.keys(serving.data || {})) {
      // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.data
      let data = Object.assign({}, serving.data[id]);

      // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.data
      const { tileJSON } = serving.data[id];
      const { center } = tileJSON;

      if (center) {
        data.viewer_hash = `#${center[2]}/${center[1].toFixed(
          5,
        )}/${center[0].toFixed(5)}`;
      }

      const tileSize = undefined;
      data.xyz_link = getTileUrls(
        req,
        tileJSON.tiles,
        `data/${id}`,
        tileSize,
        tileJSON.format,
        opts.publicUrl,
        {
          pbf: options.pbfAlias,
        },
      )[0];

      data.is_vector = tileJSON.format === 'pbf';
      if (!data.is_vector) {
        if (
          tileJSON.encoding === 'terrarium' ||
          tileJSON.encoding === 'mapbox'
        ) {
          if (!isLight) {
            data.elevation_link = getTileUrls(
              req,
              tileJSON.tiles,
              `data/${id}/elevation`,
            )[0];
          }
          data.is_terrain = true;
        }
        if (center) {
          const centerPx = mercator.px([center[0], center[1]], center[2]);
          data.thumbnail = `${Math.floor(center[2])}/${Math.floor(
            centerPx[0] / 256,
          )}/${Math.floor(centerPx[1] / 256)}.${tileJSON.format}`;
        }
      }

      if (data.filesize) {
        let suffix = 'kB';
        let size = parseInt(tileJSON.filesize, 10) / 1024;
        if (size > 1024) {
          suffix = 'MB';
          size /= 1024;
        }
        if (size > 1024) {
          suffix = 'GB';
          size /= 1024;
        }
        data.formatted_filesize = `${size.toFixed(2)} ${suffix}`;
      }
      // eslint-disable-next-line security/detect-object-injection -- id is from Object.keys of serving.data
      datas[id] = data;
    }
    return {
      styles: Object.keys(styles).length ? styles : null,
      data: Object.keys(datas).length ? datas : null,
    };
  });

  /**
   * Handles requests for a map viewer template for a specific style.
   * @param {object} req - Express request object.
   * @returns {object|null} Template data object or null
   */
  serveTemplate('/styles/:id/', 'viewer', (req) => {
    const { id } = req.params;
    // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
    const style = clone(((serving.styles || {})[id] || {}).styleJSON);

    if (!style) {
      return null;
    }
    return {
      ...style,
      id,
      // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
      name: (serving.styles[id] || serving.rendered[id]).name,
      // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
      serving_data: serving.styles[id],
      // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
      serving_rendered: serving.rendered[id],
    };
  });

  /**
   * Handles requests for a Web Map Tile Service (WMTS) XML template.
   * @param {object} req - Express request object.
   * @returns {object|null} Template data object or null
   */
  serveTemplate('/styles/:id/wmts.xml', 'wmts', (req) => {
    const { id } = req.params;
    // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
    const wmts = clone((serving.styles || {})[id]);

    if (!wmts) {
      return null;
    }

    if (Object.hasOwn(wmts, 'serve_rendered') && !wmts.serve_rendered) {
      return null;
    }

    let baseUrl;
    if (opts.publicUrl) {
      baseUrl = opts.publicUrl;
    } else {
      baseUrl = `${
        req.get('X-Forwarded-Protocol')
          ? req.get('X-Forwarded-Protocol')
          : req.protocol
      }://${req.get('host')}/`;
    }

    return {
      ...wmts,
      id,
      // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
      name: (serving.styles[id] || serving.rendered[id]).name,
      baseUrl,
    };
  });

  /**
   * Handles requests for a data view template for a specific data source.
   * @param {object} req - Express request object.
   * @returns {object|null} Template data object or null
   */
  serveTemplate('/data{/:view}/:id/', 'data', (req) => {
    const { id, view } = req.params;
    // eslint-disable-next-line security/detect-object-injection -- id is route parameter from URL
    const data = serving.data[id];

    if (!data) {
      return null;
    }
    const is_terrain =
      (data.tileJSON.encoding === 'terrarium' ||
        data.tileJSON.encoding === 'mapbox') &&
      view === 'preview';

    return {
      ...data,
      id,
      use_maplibre: data.tileJSON.format === 'pbf' || is_terrain,
      is_terrain: is_terrain,
      is_terrainrgb: data.tileJSON.encoding === 'mapbox',
      terrain_encoding: data.tileJSON.encoding,
      is_light: isLight,
    };
  });

  let startupComplete = false;
  const startupPromise = Promise.all(startupPromises).then(() => {
    console.log('Startup complete');
    startupComplete = true;
  });

  /**
   * Handles requests to see the health of the server.
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @returns {void}
   */
  app.get('/health', (req, res) => {
    if (startupComplete) {
      return res.status(200).send('OK');
    } else {
      return res.status(503).send('Starting');
    }
  });

  const server = app.listen(
    process.env.PORT || opts.port,
    process.env.BIND || opts.bind,
    function () {
      const addressInfo = this.address();

      if (!addressInfo) {
        console.error('Failed to bind to port');
        return;
      }

      let address = addressInfo.address;
      if (address.indexOf('::') === 0) {
        address = `[${address}]`; // literal IPv6 address
      }
      console.log(`Listening at http://${address}:${addressInfo.port}/`);
    },
  );

  // Handle server errors
  server.on('error', (err) => {
    const port = process.env.PORT || opts.port;
    if (err.code === 'EADDRINUSE') {
      console.error(`ERROR: Port ${port} is already in use.`);
      console.error(`Please choose a different port with -p or --port option.`);
      process.exit(1);
    } else if (err.code === 'EACCES') {
      console.error(`ERROR: Permission denied to bind to port ${port}.`);
      console.error(
        `Try using a port number above 1024 or run with appropriate permissions.`,
      );
      process.exit(1);
    } else {
      console.error('Server error:', err.message);
      process.exit(1);
    }
  });

  // add server.shutdown() to gracefully stop serving
  enableShutdown(server);

  return {
    app,
    server,
    startupPromise,
    serving,
  };
}
/**
 * Stop the server gracefully
 * @param {string} signal Name of the received signal
 * @returns {void}
 */
function stopGracefully(signal) {
  console.log(`Caught signal ${signal}, stopping gracefully`);
  process.exit();
}

/**
 * Starts and manages the server
 * @param {object} opts - Configuration options for the server.
 * @returns {Promise<object>} - A promise that resolves to the running server
 */
export async function server(opts) {
  const running = await start(opts);

  running.startupPromise.catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

  process.on('SIGINT', stopGracefully);
  process.on('SIGTERM', stopGracefully);

  process.on('SIGHUP', (signal) => {
    console.log(`Caught signal ${signal}, refreshing`);
    console.log('Stopping server and reloading config');

    running.server.shutdown(async () => {
      const restarted = await start(opts);
      if (!isLight) {
        serve_rendered.clear(running.serving.rendered);
      }
      running.server = restarted.server;
      running.app = restarted.app;
      running.startupPromise = restarted.startupPromise;
      running.serving = restarted.serving;
    });
  });
  return running;
}
