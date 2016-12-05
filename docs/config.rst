==================
Configuration file
==================

The configuration file defines the behavior of the application. It's a regular JSON file.

Example::

  {
    "options": {
      "paths": {
        "root": "",
        "fonts": "glyphs",
        "sprites": "sprites",
        "styles": "styles",
        "mbtiles": ""
      },
      "domains": [
        "localhost:8080",
        "127.0.0.1:8080"
      ],
      "formatQuality": {
        "jpeg": 80,
        "webp": 90,
        "pngQuantization": false,
        "png": 90
      },
      "maxSize": 2048
    },
    "styles": {
      "basic": {
        "style": "basic.json",
        "tilejson": {
          "type": "overlay",
          "bounds": [8.44806, 47.32023, 8.62537, 47.43468]
        }
      },
      "hybrid": {
        "style": "satellite-hybrid.json",
        "serve_rendered": false,
        "tilejson": {
          "format": "webp"
        }
      }
    },
    "data": {
      "zurich-vector": {
        "mbtiles": "zurich.mbtiles"
      }
    }
  }


``options``
===========

``paths``
---------

Defines where to look for the different types of input data.

The value of ``root`` is used as prefix for all data types.

``domains``
-----------

You can use this to optionally specify on what domains the rendered tiles are accessible. This can be used for basic load-balancing or to bypass browser's limit for the number of connections per domain.

``baseURL``
-----------

When you run the tile server server behind a load-balancer, the automatic URL generators wont't have the required information to build URLs which point to the correct LB endpoint.

Also, if your load balancer is forwarding a HTTPS connection to the non-HTTPS ``tileserver-gl``, setting the ``baseURL`` is indispensable.

Not compatible with the ``domains`` option.


``formatQuality``
-----------------

Quality of the compression of individual image formats. [0-100]

The value for ``png`` is only used when ``pngQuantization`` is ``true``.

``maxSize``
-----------

Maximum image side length to be allowed to be rendered (including scale factor). Default is ``2048``.

``styles``
==========

Each item in this object defines one style (map). It can have the following options:

* ``style`` -- name of the style json file [required]
* ``serve_rendered`` -- whether to render the raster tiles for this style or not
* ``serve_data`` -- whether to allow acces to the original tiles, sprites and required glyphs
* ``tilejson`` -- properties to add to the TileJSON created for the raster data

  * ``format`` and ``bounds`` can be especially useful

``data``
========

Each item specifies one data source which should be made accessible by the server. It has the following options:

* ``mbtiles`` -- name of the mbtiles file [required]

The mbtiles file does not need to be specified here unless you explicitly want to serve the raw data.

Referencing local mbtiles from style
====================================

You can link various data sources from the style JSON (for example even remote TileJSONs).

To specify that you want to use local mbtiles, use to following syntax: ``mbtiles://switzerland.mbtiles``.
The TileServer-GL will try to find the file ``switzerland.mbtiles`` in ``root`` + ``mbtiles`` path.

For example::

  "sources": {
    "source1": {
      "url": "mbtiles://switzerland.mbtiles",
      "type": "vector"
    }
  }

Alternatively, you can use ``mbtiles://{zurich-vector}`` to reference existing data object from the config.
In this case, the server will look into the ``config.json`` to determine what mbtiles file to use.
For the config above, this is equivalent to ``mbtiles://zurich.mbtiles``.
