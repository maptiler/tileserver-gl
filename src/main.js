#!/usr/bin/env node

'use strict';

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { server } from './server.js';
import MBTiles from '@mapbox/mbtiles';
import { isValidHttpUrl } from './utils.js';
import { openPMtiles, getPMtilesInfo } from './pmtiles_adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(
  fs.readFileSync(__dirname + '/../package.json', 'utf8'),
);

const args = process.argv;
if (args.length >= 3 && args[2][0] !== '-') {
  args.splice(2, 0, '--mbtiles');
}

import { program } from 'commander';
import { existsP } from './promises.js';
program
  .description('tileserver-gl startup options')
  .usage('tileserver-gl [mbtiles] [options]')
  .option(
    '--file <file>',
    'MBTiles or PMTiles file\n' +
      '\t                  ignored if the configuration file is also specified',
  )
  .option(
    '--mbtiles <file>',
    '(DEPRECIATED) MBTiles file\n' +
      '\t                  ignored if file is also specified' +
      '\t                  ignored if the configuration file is also specified',
  )
  .option(
    '-c, --config <file>',
    'Configuration file [config.json]',
    'config.json',
  )
  .option('-b, --bind <address>', 'Bind address')
  .option('-p, --port <port>', 'Port [8080]', 8080, parseInt)
  .option('-C|--no-cors', 'Disable Cross-origin resource sharing headers')
  .option(
    '-u|--public_url <url>',
    'Enable exposing the server on subpaths, not necessarily the root of the domain',
  )
  .option('-V, --verbose', 'More verbose output')
  .option('-s, --silent', 'Less verbose output')
  .option('-l|--log_file <file>', 'output log file (defaults to standard out)')
  .option(
    '-f|--log_format <format>',
    'define the log format:  https://github.com/expressjs/morgan#morganformat-options',
  )
  .version(packageJson.version, '-v, --version');
program.parse(process.argv);
const opts = program.opts();

console.log(`Starting ${packageJson.name} v${packageJson.version}`);

const startServer = (configPath, config) => {
  let publicUrl = opts.public_url;
  if (publicUrl && publicUrl.lastIndexOf('/') !== publicUrl.length - 1) {
    publicUrl += '/';
  }
  return server({
    configPath,
    config,
    bind: opts.bind,
    port: opts.port,
    cors: opts.cors,
    verbose: opts.verbose,
    silent: opts.silent,
    logFile: opts.log_file,
    logFormat: opts.log_format,
    publicUrl,
  });
};

const startWithInputFile = async (inputFile) => {
  console.log(`[INFO] Automatically creating config file for ${inputFile}`);
  console.log(`[INFO] Only a basic preview style will be used.`);
  console.log(
    `[INFO] See documentation to learn how to create config.json file.`,
  );

  let inputFilePath;
  if (isValidHttpUrl(inputFile)) {
    inputFilePath = process.cwd();
  } else {
    inputFile = path.resolve(process.cwd(), inputFile);
    inputFilePath = path.dirname(inputFile);

    const inputFileStats = await fsp.stat(inputFile);
    if (!inputFileStats.isFile() || inputFileStats.size === 0) {
      console.log(`ERROR: Not a valid input file: `);
      process.exit(1);
    }
  }

  const styleDir = path.resolve(
    __dirname,
    '../node_modules/tileserver-gl-styles/',
  );

  const config = {
    options: {
      paths: {
        root: styleDir,
        fonts: 'fonts',
        styles: 'styles',
        mbtiles: inputFilePath,
        pmtiles: inputFilePath,
      },
    },
    styles: {},
    data: {},
  };

  const extension = inputFile.split('.').pop().toLowerCase();
  if (extension === 'pmtiles') {
    const fileOpenInfo = openPMtiles(inputFile);
    const metadata = await getPMtilesInfo(fileOpenInfo);

    if (
      metadata.format === 'pbf' &&
      metadata.name.toLowerCase().indexOf('openmaptiles') > -1
    ) {
      if (isValidHttpUrl(inputFile)) {
        config['data'][`v3`] = {
          pmtiles: inputFile,
        };
      } else {
        config['data'][`v3`] = {
          pmtiles: path.basename(inputFile),
        };
      }

      const styles = await fsp.readdir(path.resolve(styleDir, 'styles'));
      for (const styleName of styles) {
        const styleFileRel = styleName + '/style.json';
        const styleFile = path.resolve(styleDir, 'styles', styleFileRel);
        if (await existsP(styleFile)) {
          config['styles'][styleName] = {
            style: styleFileRel,
            tilejson: {
              bounds: metadata.bounds,
            },
          };
        }
      }
    } else {
      console.log(
        `WARN: PMTiles not in "openmaptiles" format. Serving raw data only...`,
      );
      if (isValidHttpUrl(inputFile)) {
        config['data'][(metadata.id || 'pmtiles').replace(/[?/:]/g, '_')] = {
          pmtiles: inputFile,
        };
      } else {
        config['data'][(metadata.id || 'pmtiles').replace(/[?/:]/g, '_')] = {
          pmtiles: path.basename(inputFile),
        };
      }
    }

    if (opts.verbose) {
      console.log(JSON.stringify(config, undefined, 2));
    } else {
      console.log('Run with --verbose to see the config file here.');
    }

    return startServer(null, config);
  } else {
    if (isValidHttpUrl(inputFile)) {
      console.log(
        `ERROR: MBTiles does not support web based files. "${inputFile}" is not a valid data file.`,
      );
      process.exit(1);
    }
    const instance = new MBTiles(inputFile + '?mode=ro', (err) => {
      if (err) {
        console.log('ERROR: Unable to open MBTiles.');
        console.log(`Make sure ${path.basename(inputFile)} is valid MBTiles.`);
        process.exit(1);
      }

      instance.getInfo(async (err, info) => {
        if (err || !info) {
          console.log('ERROR: Metadata missing in the MBTiles.');
          console.log(
            `Make sure ${path.basename(inputFile)} is valid MBTiles.`,
          );
          process.exit(1);
        }
        const bounds = info.bounds;

        if (
          info.format === 'pbf' &&
          info.name.toLowerCase().indexOf('openmaptiles') > -1
        ) {
          config['data'][`v3`] = {
            mbtiles: path.basename(inputFile),
          };

          const styles = await fsp.readdir(path.resolve(styleDir, 'styles'));
          for (const styleName of styles) {
            const styleFileRel = styleName + '/style.json';
            const styleFile = path.resolve(styleDir, 'styles', styleFileRel);
            if (await existsP(styleFile)) {
              config['styles'][styleName] = {
                style: styleFileRel,
                tilejson: {
                  bounds,
                },
              };
            }
          }
        } else {
          console.log(
            `WARN: MBTiles not in "openmaptiles" format. Serving raw data only...`,
          );
          config['data'][(info.id || 'mbtiles').replace(/[?/:]/g, '_')] = {
            mbtiles: path.basename(inputFile),
          };
        }

        if (opts.verbose) {
          console.log(JSON.stringify(config, undefined, 2));
        } else {
          console.log('Run with --verbose to see the config file here.');
        }

        return startServer(null, config);
      });
    });
  }
};

fs.stat(path.resolve(opts.config), async (err, stats) => {
  if (err || !stats.isFile() || stats.size === 0) {
    let inputFile;
    if (opts.file) {
      inputFile = opts.file;
    } else if (opts.mbtiles) {
      inputFile = opts.mbtiles;
    }

    if (inputFile) {
      return startWithInputFile(inputFile);
    } else {
      // try to find in the cwd
      const files = await fsp.readdir(process.cwd());
      for (const filename of files) {
        if (filename.endsWith('.mbtiles') || filename.endsWith('.pmtiles')) {
          const inputFilesStats = await fsp.stat(filename);
          if (inputFilesStats.isFile() && inputFilesStats.size > 0) {
            inputFile = filename;
            break;
          }
        }
      }
      if (inputFile) {
        console.log(`No input file specified, using ${inputFile}`);
        return startWithInputFile(inputFile);
      } else {
        const url =
          'https://github.com/maptiler/tileserver-gl/releases/download/v1.3.0/zurich_switzerland.mbtiles';
        const filename = 'zurich_switzerland.mbtiles';
        const writer = fs.createWriteStream(filename);
        console.log(`No input file found`);
        console.log(`[DEMO] Downloading sample data (${filename}) from ${url}`);

        try {
          const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
          });

          response.data.pipe(writer);
          writer.on('finish', () => startWithInputFile(filename));
          writer.on('error', (err) =>
            console.error(`Error writing file: ${err}`),
          );
        } catch (error) {
          console.error(`Error downloading file: ${error}`);
        }
      }
    }
  } else {
    console.log(`Using specified config file from ${opts.config}`);
    return startServer(opts.config, null);
  }
});
