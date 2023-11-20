==================
Configuration file
==================

The configuration file defines the behavior of the application. It's a regular JSON file.

Example:

.. code-block:: json

  {
    "options": {
      "paths": {
        "root": "",
        "fonts": "fonts",
        "sprites": "sprites",
        "icons": "icons",
        "styles": "styles",
        "mbtiles": "data",
        "pmtiles": "data"
      },
      "domains": [
        "localhost:8080",
        "127.0.0.1:8080"
      ],
      "formatQuality": {
        "jpeg": 80,
        "webp": 90
      },
      "maxScaleFactor": 3,
      "maxSize": 2048,
      "pbfAlias": "pbf",
      "serveAllFonts": false,
      "serveAllStyles": false,
      "serveStaticMaps": true,
      "allowRemoteMarkerIcons": true,
      "allowInlineMarkerImages": true,
      "staticAttributionText": "© OpenMapTiles  © OpenStreetMaps",
      "tileMargin": 0
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

``frontPage``
-----------------

Path to the html (relative to ``root`` path) to use as a front page.

Use ``true`` (or nothing) to serve the default TileServer GL front page with list of styles and data.
Use ``false`` to disable the front page altogether (404).

``formatQuality``
-----------------

Quality of the compression of individual image formats. [0-100]

``maxScaleFactor``
-----------

Maximum scale factor to allow in raster tile and static maps requests (e.g. ``@3x`` suffix).
Also see ``maxSize`` below.
Default value is ``3``, maximum ``9``.

``maxSize``
-----------

Maximum image side length to be allowed to be rendered (including scale factor).
Be careful when changing this value since there are hardware limits that need to be considered.
Default is ``2048``.

``tileMargin``
--------------

Additional image side length added during tile rendering that is cropped from the delivered tile. This is useful for resolving the issue with cropped labels,
but it does come with a performance degradation, because additional, adjacent vector tiles need to be loaded to generate a single tile.
Default is ``0`` to disable this processing.

``minRendererPoolSizes``
------------------------

Minimum amount of raster tile renderers per scale factor.
The value is an array: the first element is the minimum amount of renderers for scale factor one, the second for scale factor two and so on.
If the array has less elements than ``maxScaleFactor``, then the last element is used for all remaining scale factors as well.
Selecting renderer pool sizes is a trade-off between memory use and speed.
A reasonable value will depend on your hardware and your amount of styles and scale factors.
If you have plenty of memory, you'll want to set this equal to ``maxRendererPoolSizes`` to avoid increased latency due to renderer destruction and recreation.
If you need to conserve memory, you'll want something lower than ``maxRendererPoolSizes``, possibly allocating more renderers to scale factors that are more common.
Default is ``[8, 4, 2]``.

``maxRendererPoolSizes``
------------------------

Maximum amount of raster tile renderers per scale factor.
The value and considerations are similar to ``minRendererPoolSizes`` above.
If you have plenty of memory, try setting these equal to or slightly above your processor count, e.g. if you have four processors, try a value of ``[6]``.
If you need to conserve memory, try lower values for scale factors that are less common.
Default is ``[16, 8, 4]``.

``pbfAlias``
------------------------

Some CDNs did not handle .pbf extension as a static file correctly.
The default URLs (with .pbf) are always available, but an alternative can be set.
An example extension suffix would be ".pbf.pict".

``serveAllFonts``
------------------------

If this option is enabled, all the fonts from the ``paths.fonts`` will be served.
Otherwise only the fonts referenced by available styles will be served.

``serveAllStyles``
------------------------

If this option is enabled, all the styles from the ``paths.styles`` will be served. (No recursion, only ``.json`` files are used.)
The process will also watch for changes in this directory and remove/add more styles dynamically.
It is recommended to also use the ``serveAllFonts`` option when using this option.

``serveStaticMaps``
------------------------

If this option is enabled, all the static map endpoints will be served.
Default is ``true``.

``watermark``
-----------

Optional string to be rendered into the raster tiles and static maps as watermark (bottom-left corner).
Not used by default.

``staticAttributionText``
-----------

Optional string to be rendered in the static images endpoint. Text will be rendered in the bottom-right corner,
and styled similar to attribution on web-based maps (text only, links not supported).
Not used by default.

``allowRemoteMarkerIcons``
--------------

Allows the rendering of marker icons fetched via http(s) hyperlinks.
For security reasons only allow this if you can control the origins from where the markers are fetched!
Default is to disallow fetching of icons from remote sources.

``allowInlineMarkerImages``
--------------
Allows the rendering of inline marker icons or base64 urls.
For security reasons only allow this if you can control the origins from where the markers are fetched!
Not used by default.


``styles``
==========

Each item in this object defines one style (map). It can have the following options:

* ``style`` -- name of the style json file [required]
* ``serve_rendered`` -- whether to render the raster tiles for this style or not
* ``serve_data`` -- whether to allow access to the original tiles, sprites and required glyphs
* ``tilejson`` -- properties to add to the TileJSON created for the raster data

  * ``format`` and ``bounds`` can be especially useful

``data``
========

Each item specifies one data source which should be made accessible by the server. It has to have one of the following options:

* ``mbtiles`` -- name of the mbtiles file
* ``pmtiles`` -- name of the pmtiles file or url.

For example::

  "data": {
    "source1": {
      "mbtiles": "source1.mbtiles"
    },
    "source2": {
      "pmtiles": "source2.pmtiles"
    },
    "source3": {
      "pmtiles": "https://foo.lan/source3.pmtiles"
    }
  }


The data source does not need to be specified here unless you explicitly want to serve the raw data.

Referencing local files from style JSON
=======================================

You can link various data sources from the style JSON (for example even remote TileJSONs).

MBTiles
-------

To specify that you want to use local mbtiles, use to following syntax: ``mbtiles://source1.mbtiles``.
TileServer-GL will try to find the file ``source1.mbtiles`` in ``root`` + ``mbtiles`` path.

For example::

  "sources": {
    "source1": {
      "url": "mbtiles://source1.mbtiles",
      "type": "vector"
    }
  }

Alternatively, you can use ``mbtiles://{source1}`` to reference existing data object from the config.
In this case, the server will look into the ``config.json`` to determine what file to use by data id.
For the config above, this is equivalent to ``mbtiles://source1.mbtiles``.

PMTiles
-------

To specify that you want to use local pmtiles, use to following syntax: ``pmtiles://source2.pmtiles``.
TileServer-GL will try to find the file ``source2.pmtiles`` in ``root`` + ``pmtiles`` path.

To specify that you want to use a url based pmtiles, use to following syntax: ``pmtiles://https://foo.lan/source3.pmtiles``.

For example::

  "sources": {
    "source2": {
      "url": "pmtiles://source2.pmtiles",
      "type": "vector"
    },
    "source3": {
      "url": "pmtiles://https://foo.lan/source3.pmtiles",
      "type": "vector"
    },
  }

Alternatively, you can use ``pmtiles://{source2}`` to reference existing data object from the config.
In this case, the server will look into the ``config.json`` to determine what file to use by data id.
For the config above, this is equivalent to ``pmtiles://source2.mbtiles``.

Sprites
-------

If your style requires any sprites, make sure the style JSON contains proper path in the ``sprite`` property.

It can be a local path (e.g. ``my-style/sprite``) or remote http(s) location (e.g. ``https://mycdn.com/my-style/sprite``). Several possible extension are added to this path, so the following files should be present:

* ``sprite.json``
* ``sprite.png``
* ``sprite@2x.json``
* ``sprite@2x.png``

You can also use the following placeholders in the sprite path for easier use:

* ``{style}`` -- gets replaced with the name of the style file (``xxx.json``)
* ``{styleJsonFolder}`` -- gets replaced with the path to the style file

Fonts (glyphs)
--------------

Similarly to the sprites, the style JSON also needs to contain proper paths to the font glyphs (in the ``glyphs`` property) and can be both local and remote.

It should contain the following placeholders:

* ``{fontstack}`` -- name of the font and variant
* ``{range}`` -- range of the glyphs

For example ``"glyphs": "{fontstack}/{range}.pbf"`` will instruct TileServer-GL to look for the files such as ``fonts/Open Sans/0-255.pbf`` (``fonts`` come from the ``paths`` property of the ``config.json`` example above).
