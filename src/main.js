#!/usr/bin/env node

'use strict';
import os from 'os';

const envSize = parseInt(process.env.UV_THREADPOOL_SIZE, 10);
process.env.UV_THREADPOOL_SIZE = Math.ceil(
  Math.max(4, isNaN(envSize) ? os.cpus().length * 1.5 : envSize),
);

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { server } from './server.js';
import { isValidRemoteUrl } from './utils.js';
import { openPMtiles, getPMtilesInfo } from './pmtiles_adapter.js';
import { program } from 'commander';
import { existsP } from './promises.js';
import { openMbTilesWrapper } from './mbtiles_wrapper.js';

// ============================================================================
// Global Error Handlers - Prevent server crashes from unhandled errors
// ============================================================================

// Prevent unhandled promise rejections from crashing the server
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit - keep server running
});

// Prevent uncaught exceptions from crashing the server
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit - keep server running
});

// ============================================================================
// Continue with normal startup
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(
  fs.readFileSync(__dirname + '/../package.json', 'utf8'),
);

const args = process.argv;
if (args.length >= 3 && args[2][0] !== '-') {
  args.splice(2, 0, '--mbtiles');
}

program
  .description('tileserver-gl startup options')
  .usage('tileserver-gl [mbtiles] [options]')
  .option(
    '--file <file>',
    'MBTiles or PMTiles file (local path, http(s)://, or s3:// URL)\n' +
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
  .option(
    '-V, --verbose [level]',
    'More verbose output (level 1-3)\n' +
      '\t-V, --verbose, -V 1, or --verbose 1: Important operations\n' +
      '\t-V 2 or --verbose 2: Detailed operations\n' +
      '\t-V 3 or --verbose 3: All requests and debug info',
    (value) => {
      // If no value provided, return 1 (boolean true case)
      if (value === undefined || value === true) return 1;
      // Parse the numeric value
      const level = parseInt(value, 10);
      // Validate level is between 1-3
      return isNaN(level) ? 1 : Math.min(Math.max(level, 1), 3);
    },
  )
  .option(
    '--fetch-timeout <ms>',
    'External fetch timeout in milliseconds for renderer HTTP requests (default 15000)',
    (value) => {
      const v = parseInt(value, 10);
      return isNaN(v) ? 15000 : v;
    },
  )
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
    fetchTimeout: opts.fetchTimeout,
    publicUrl,
  });
};

const startWithInputFile = async (inputFile) => {
  console.log(`[INFO] Automatically creating config file for ${inputFile}`);
  console.log(`[INFO] Only a basic preview style will be used.`);
  console.log(
    `[INFO] See documentation to learn how to create config.json file.`,
  );

  // Determine file type from prefix or extension
  let fileType = null;

  if (inputFile.startsWith('pmtiles://')) {
    fileType = 'pmtiles';
    inputFile = inputFile.replace('pmtiles://', '');
  } else if (inputFile.startsWith('mbtiles://')) {
    fileType = 'mbtiles';
    inputFile = inputFile.replace('mbtiles://', '');
  } else {
    // Determine by extension (remove query parameters first)
    const extension = inputFile.split('?')[0].split('.').pop().toLowerCase();
    if (extension === 'pmtiles' || extension === 'mbtiles') {
      fileType = extension;
    }
  }

  if (!fileType) {
    console.log(`ERROR: Unable to determine file type for "${inputFile}".`);
    console.log(
      `File must end with .pmtiles or .mbtiles, or use pmtiles:// or mbtiles:// prefix.`,
    );
    process.exit(1);
  }

  let inputFilePath;
  // Check if input is a remote URL (HTTP, HTTPS, or S3)
  if (isValidRemoteUrl(inputFile)) {
    inputFilePath = process.cwd();
  } else {
    // Local file path
    inputFile = path.resolve(process.cwd(), inputFile);
    inputFilePath = path.dirname(inputFile);

    const inputFileStats = await fsp.stat(inputFile);
    if (!inputFileStats.isFile() || inputFileStats.size === 0) {
      console.log(`ERROR: Not a valid input file: ${inputFile}`);
      process.exit(1);
    }
  }
  console.log(`[INFO] Loading data source from: ${inputFile}`);

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

  if (fileType === 'pmtiles') {
    const fileOpenInfo = openPMtiles(
      inputFile,
      undefined,
      undefined,
      undefined,
      opts.verbose,
    );
    const metadata = await getPMtilesInfo(fileOpenInfo, inputFile);

    if (
      metadata.format === 'pbf' &&
      metadata.name.toLowerCase().indexOf('openmaptiles') > -1
    ) {
      // Use inputFile directly for remote URLs (HTTP or S3)
      if (isValidRemoteUrl(inputFile)) {
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
          // eslint-disable-next-line security/detect-object-injection -- styleName is from trusted filesystem readdir, not user input
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
      // Use inputFile directly for remote URLs (HTTP or S3)
      if (isValidRemoteUrl(inputFile)) {
        config['data'][(metadata.id || 'pmtiles').replace(/[?/:]/g, '_')] = {
          pmtiles: inputFile,
        };
      } else {
        config['data'][(metadata.id || 'pmtiles').replace(/[?/:]/g, '_')] = {
          pmtiles: path.basename(inputFile),
        };
      }
    }

    if (opts.verbose >= 1) {
      console.log(JSON.stringify(config, undefined, 2));
    } else {
      console.log('Run with --verbose to see the config file here.');
    }

    return startServer(null, config);
  } else if (fileType === 'mbtiles') {
    // MBTiles handling - reject remote URLs
    if (isValidRemoteUrl(inputFile)) {
      console.log(
        `ERROR: MBTiles does not support remote files. "${inputFile}" is not a valid data file.`,
      );
      process.exit(1);
    }
    let info;
    try {
      const mbw = await openMbTilesWrapper(inputFile);
      info = await mbw.getInfo();
      if (!info) throw new Error('Metadata missing in the MBTiles.');
    } catch (err) {
      console.log('ERROR: Unable to open MBTiles or read metadata:', err);
      console.log(`Make sure ${path.basename(inputFile)} is valid MBTiles.`);
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
          // eslint-disable-next-line security/detect-object-injection -- styleName is from trusted filesystem readdir, not user input
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

    if (opts.verbose >= 1) {
      console.log(JSON.stringify(config, undefined, 2));
    } else {
      console.log('Run with --verbose to see the config file here.');
    }

    return startServer(null, config);
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
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Convert web ReadableStream to Node.js Readable stream and pipe to file
          const nodeStream = Readable.fromWeb(response.body);
          await pipeline(nodeStream, writer);

          console.log('Download complete');
          startWithInputFile(filename);
        } catch (error) {
          console.error(`Error downloading file: ${error.message || error}`);
        }
      }
    }
  } else {
    console.log(`Using specified config file from ${opts.config}`);
    return startServer(opts.config, null);
  }
});
