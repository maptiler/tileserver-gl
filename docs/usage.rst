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

Resolve relative public url into an absolute url
=====

- Define environment variable TILESERVER_GL_RESOLVE_RELATIVE_PUBLIC_URL=true
- Using this configuration will cause relative resource urls to be converted to absolute urls. This is needed for example to use tileserver-gl with mapbox-gl.
- The absolute url will be resolved from the request protocol and host header and prepending them to the public_url option.

Default preview style and configuration
======

- If no configuration file is specified, a default preview style (compatible with openmaptiles) is used.
- If no mbtiles file is specified (and is not found in the current working directory), a sample file is downloaded (showing the Zurich area)

Reloading the configuration
======

It is possible to reload the configuration file without restarting the whole process by sending a SIGHUP signal to the node process.

- The `docker kill -s HUP tileserver-gl` command can be used when running the tileserver-gl docker container.
- The `docker-compose kill -s HUP tileserver-gl-service-name` can be used when tileserver-gl is run as a docker-compose service.
