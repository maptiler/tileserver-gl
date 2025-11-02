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
        "pmtiles": "data",
        "files": "files"
      },
      "domains": [
        "localhost:8080",
        "127.0.0.1:8080"
      ],
      "formatOptions": {
        "jpeg": {
          "quality": 80
        },
        "webp": {
          "quality": 90
        }
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
      },
      "remote": {
        "style": "https://demotiles.maplibre.org/style.json"
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

``formatOptions``
-----------------

You can use this to specify options for the generation of images in the supported file formats.
For WebP, the only supported option is ``quality`` [0-100].
For JPEG, the only supported options are ``quality`` [0-100] and ``progressive`` [true, false]. 
For PNG, the full set of options `exposed by the sharp library <https://sharp.pixelplumbing.com/api-output#png>`_ is available, except ``force`` and ``colours`` (use ``colors``). If not set, their values are the defaults from ``sharp``.

For example::

  "formatOptions": {
    "png": {
      "palette": true,
      "colors": 4
    }
  }

Note: ``formatOptions`` replaced the ``formatQuality`` option in previous versions of TileServer GL. 

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

* ``style`` -- name of the style json file or url of a remote hosted style [required]
* ``serve_rendered`` -- whether to render the raster tiles for this style or not
* ``serve_data`` -- whether to allow access to the original tiles, sprites and required glyphs
* ``tilejson`` -- properties to add to the TileJSON created for the raster data

  * ``format`` and ``bounds`` can be especially useful

``data``
========

Each item specifies one data source which should be made accessible by the server. It has to have one of the following options:

* ``mbtiles`` -- name of the mbtiles file
* ``pmtiles`` -- name of the pmtiles file, url, or S3 path.

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
    },
    "source4": {
      "pmtiles": "s3://my-bucket/tiles/terrain.pmtiles"
    },
    "source5": {
      "pmtiles": "s3+https://example-storage.com/bucket-abc123:tiles/terrain.pmtiles"
    }
  }

The data source does not need to be specified here unless you explicitly want to serve the raw data.

Data Source Options
--------------

Within the top-level ``data`` object in your configuration, each defined data source (e.g., `terrain`, `sparse_vector_tiles`) can have several key properties. These properties define how *tileserver-gl* processes and serves the tiles from that source.

For example::

  "data": {
    "terrain": {
      "mbtiles": "terrain1.mbtiles",
      "encoding": "mapbox",
      "tileSize": 512,
      "sparse": true
    },
    "sparse_vector_tiles": {
      "pmtiles": "custom_osm.pmtiles",
      "sparse": true
    },
    "production-s3-tiles": {
      "pmtiles": "s3://prod-bucket/tiles.pmtiles",
      "s3Profile": "production"
    }
  }

Here are the available options for each data source:

``encoding`` (string)
    Applicable to terrain tiles. Configures the expected encoding of the terrain data.
    Setting this to ``mapbox`` or ``terrarium`` enables a terrain preview mode and the ``elevation`` API for the ``data`` endpoint (if applicable to the source).

``tileSize`` (integer)
    Specifies the expected pixel dimensions of the tiles within this data source.
    This option is crucial if your source data uses 512x512 pixel tiles, as *tileserver-gl* typically assumes 256x256 by default.
    Allowed values: ``256``, ``512``.
    Default: ``256``.

``sparse`` (boolean)
    Controls the HTTP status code returned by *tileserver-gl* when a requested tile is not found in the source.
    When ``true``, a ``410 Gone`` status is returned for missing tiles. This behaviour is beneficial for clients like MapLibre-GL-JS or MapLibre-Native, as it signals them to attempt loading tiles from lower zoom levels (overzooming) when a higher-zoom tile is explicitly missing.
    When ``false`` (default), *tileserver-gl* returns a ``204 No Content`` for missing tiles, which typically signals the client to stop trying to load a substitute.
    Default: ``false``.

``s3Profile`` (string)
    Specifies the AWS credential profile to use for S3 PMTiles sources. The profile must be defined in your ``~/.aws/credentials`` file.
    This is useful when you need to access multiple S3 buckets with different credentials.
    Alternatively, you can specify the profile in the URL using ``?profile=profile-name``.
    If both are specified, the configuration ``s3Profile`` takes precedence.
    Optional, only applicable to PMTiles sources using S3 URLs.

.. note::
    These configuration options will be overridden by metadata in the MBTiles or PMTiles file. if corresponding properties exist in the file's metadata, you do not need to specify them in the data configuration.

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
    }
  }

Alternatively, you can use ``pmtiles://{source2}`` to reference existing data object from the config.
In this case, the server will look into the ``config.json`` to determine what file to use by data id.
For the config above, this is equivalent to ``pmtiles://source2.pmtiles``.

S3 and S3-Compatible Storage
-----------------------------

PMTiles files can be accessed directly from AWS S3 or S3-compatible storage services (such as Contabo, DigitalOcean Spaces, MinIO, etc.) using S3 URLs. This provides better performance and eliminates HTTP rate limiting issues.

**Supported URL Formats:**

1. **AWS S3 (default):**
   ``s3://bucket-name/path/to/file.pmtiles``

2. **S3-compatible storage with endpoint:**
   ``s3://endpoint-url/bucket-name/path/to/file.pmtiles``

3. **Custom format (for services like Contabo):**
   ``s3+https://endpoint-url/bucket-id:path/to/file.pmtiles``

For example::

  "sources": {
    "aws-tiles": {
      "url": "pmtiles://s3://my-bucket/tiles/terrain.pmtiles",
      "type": "vector"
    },
    "custom-storage": {
      "url": "pmtiles://s3+https://example-storage.com/bucket-abc123:tiles/terrain.pmtiles",
      "type": "vector"
    },
    "spaces-tiles": {
      "url": "pmtiles://s3://nyc3.digitaloceanspaces.com/my-bucket/tiles.pmtiles",
      "type": "vector"
    }
  }

**AWS Credentials Setup:**

S3 sources require AWS credentials to be configured. The server will automatically use credentials from:

* Environment variables: ``AWS_ACCESS_KEY_ID``, ``AWS_SECRET_ACCESS_KEY``, ``AWS_REGION``
* AWS credentials file: ``~/.aws/credentials`` on Linux/macOS or ``C:\Users\USERNAME\.aws\credentials`` on Windows
* IAM role (when running on AWS EC2, ECS, or Lambda)

For S3-compatible storage providers, use the same AWS credential format with your provider's access keys.

Example environment variables::

  export AWS_ACCESS_KEY_ID=your_access_key
  export AWS_SECRET_ACCESS_KEY=your_secret_key
  export AWS_REGION=us-east-1

**Using Multiple AWS Credential Profiles:**

If you need to access S3 buckets with different credentials, you can use AWS credential profiles. Profiles are defined in your AWS credentials file (``~/.aws/credentials`` on Linux/macOS or ``C:\Users\USERNAME\.aws\credentials`` on Windows):

Example credentials file::

  [default]
  aws_access_key_id=YOUR_DEFAULT_KEY
  aws_secret_access_key=YOUR_DEFAULT_SECRET

  [production]
  aws_access_key_id=YOUR_PRODUCTION_KEY
  aws_secret_access_key=YOUR_PRODUCTION_SECRET

  [staging]
  aws_access_key_id=YOUR_STAGING_KEY
  aws_secret_access_key=YOUR_STAGING_SECRET

**Option 1: Profile in URL**

You can specify the profile directly in the S3 URL using the ``profile`` query parameter::

  "data": {
    "production-tiles": {
      "pmtiles": "s3://prod-bucket/tiles.pmtiles?profile=production"
    },
    "staging-tiles": {
      "pmtiles": "s3://staging-bucket/tiles.pmtiles?profile=staging"
    }
  }

Or in style sources::

  "sources": {
    "terrain": {
      "url": "pmtiles://s3://my-bucket/terrain.pmtiles?profile=production",
      "type": "raster-dem"
    }
  }

**Option 2: Profile in Configuration**

You can also specify the profile in the configuration file using the ``s3Profile`` property::

  "data": {
    "production-tiles": {
      "pmtiles": "s3://prod-bucket/tiles.pmtiles",
      "s3Profile": "production"
    },
    "staging-tiles": {
      "pmtiles": "s3://staging-bucket/tiles.pmtiles",
      "s3Profile": "staging"
    }
  }

.. note::
    If both URL and configuration profiles are specified, the configuration ``s3Profile`` takes precedence.

**Command-Line Usage with Profiles:**

When using the ``--file`` parameter, you can only specify profiles via the URL::

  tileserver-gl --file "s3://my-bucket/tiles.pmtiles?profile=production"

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
