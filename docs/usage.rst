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
    -u|--public_url <url> Enable exposing the server on subpaths, not necessarily the root of the domain
    -V, --verbose         More verbose output
    -s, --silent          Less verbose output
    -v, --version         Version info


Default preview style and configuration
======

- If no configuration file is specified, a default preview style (compatible with openmaptiles) is used.
- If no mbtiles file is specified (and is not found in the current working directory), a sample file is downloaded (showing the Zurich area)

Reloading configuration
======

It is possible to reload the configuration file without restarting the whole process by sending a SIGHUP signal to the node process.

When running the tileserver-gl docker container, the signal must be sent from within the container:
::

  docker exec tileserver-gl bash -c 'kill -HUP $(ls -l /proc/*/exe | sed -n "/\/node$/s/.*proc\/\([0-9]\+\)\/exe .*/\1/p")'
