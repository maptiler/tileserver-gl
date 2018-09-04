=====
Usage
=====

Getting started
======
::

  Usage: main.js tileserver-gl [mbtiles] [options]

  Options:

    -h, --help            output usage information
    --mbtiles <file>      MBTiles file (uses demo configuration);
                          ignored if the configuration file is also specified
    -c, --config <file>   Configuration file [config.json]
    -b, --bind <address>  Bind address
    -p, --port <port>     Port [8080]
    -C|--no-cors          Disable Cross-origin resource sharing headers
    -V, --verbose         More verbose output
    -s, --silent          Less verbose output
    -v, --version         Version info


Default styles and configuration
======

- If no configuration file is specified, the default styles (compatible with openmaptiles) are used.
- If no mbtiles file is specified (and is not found in the current working directory), an extract is downloaded directly from https://openmaptiles.org/
