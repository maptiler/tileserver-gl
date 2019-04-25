=====
Usage
=====

Getting started
======

::

    Usage: tileserver-gl [mbtiles] [options]

    mbtiles     MBTiles file (uses demo configuration);
                ignored if the configuration file is also specified

    Options:
       -c, --config    Configuration file  [config.json]
       -b, --bind      Bind address
       -p, --port      Port  [8080]
       -V, --verbose   More verbose output
       -v, --version   Version info



Default styles and configuration
======

- If no configuration file is specified, the default styles (compatible with openmaptiles) are used.
- If no mbtiles file is specified (and is not found in the current working directory), an extract is downloaded directly from https://openmaptiles.org/
