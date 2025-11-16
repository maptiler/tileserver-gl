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

``requestPayer`` (boolean)
    Enables support for "requester pays" S3 buckets where the requester (not the bucket owner) pays for data transfer costs.
    Set to ``true`` if accessing a requester pays bucket.
    Can be specified in the URL using ``?requestPayer=true`` or in the configuration.
    If both are specified, the configuration value takes precedence.
    Default: ``false``.
    Optional, only applicable to PMTiles sources using S3 URLs.

``s3Region`` (string)
    Specifies the AWS region for the S3 bucket.
    Important for optimizing performance and reducing data transfer costs when accessing AWS S3 buckets.
    Can be specified in the URL using ``?region=region-name`` or in the configuration.
    If both are specified, the configuration value takes precedence.
    If not specified, uses ``AWS_REGION`` environment variable or defaults to ``us-east-1``.
    Optional, only applicable to PMTiles sources using S3 URLs.

``s3UrlFormat`` (string)
    Specifies how to interpret the S3 URL format.
    
    Allowed values:
    
    * ``aws`` - Interpret as AWS S3 (``s3://bucket/path/file.pmtiles``)
    * ``custom`` - Interpret as custom S3 endpoint (``s3://endpoint/bucket/path/file.pmtiles``)
    * Not specified (default) - Auto-detect based on URL pattern
    
    Can be specified in the URL using ``?s3UrlFormat=aws`` or in the configuration.
    If both are specified, the configuration value takes precedence.
    
    Optional, only applicable to PMTiles sources using S3 URLs.

.. note::
    By default, URLs with dots in the first segment (e.g., ``s3://storage.example.com/bucket/file.pmtiles``) are treated as custom endpoints, while URLs without dots are treated as AWS S3. Use ``s3UrlFormat: "aws"`` if your AWS bucket name contains dots.

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

2. **S3-compatible storage with custom endpoint:**
   ``s3://endpoint-url/bucket-name/path/to/file.pmtiles``

**AWS Credentials:**

S3 sources require AWS credentials to be configured. The server will automatically use credentials from:

* Environment variables: ``AWS_ACCESS_KEY_ID``, ``AWS_SECRET_ACCESS_KEY``, ``AWS_REGION``
* AWS credentials file: ``~/.aws/credentials`` on Linux/macOS or ``C:\Users\USERNAME\.aws\credentials`` on Windows
* IAM role (when running on AWS EC2, ECS, or Lambda)

For S3-compatible storage providers, use the same AWS credential format with your provider's access keys.

Example using environment variables::

  export AWS_ACCESS_KEY_ID=your_access_key
  export AWS_SECRET_ACCESS_KEY=your_secret_key
  export AWS_REGION=us-west-2

**Multiple AWS Credential Profiles:**

If you need to access S3 buckets with different credentials, you can use AWS credential profiles. Profiles are defined in your AWS credentials file (``~/.aws/credentials`` on Linux/macOS or ``C:\Users\USERNAME\.aws\credentials`` on Windows)::

  [default]
  aws_access_key_id=YOUR_DEFAULT_KEY
  aws_secret_access_key=YOUR_DEFAULT_SECRET

  [production]
  aws_access_key_id=YOUR_PRODUCTION_KEY
  aws_secret_access_key=YOUR_PRODUCTION_SECRET

  [staging]
  aws_access_key_id=YOUR_STAGING_KEY
  aws_secret_access_key=YOUR_STAGING_SECRET

**S3 Configuration Options (Main Config Data Section):**

When configuring S3 sources in the main configuration file's ``data`` section, you can use URL query parameters or configuration properties. Configuration properties take precedence over URL parameters.

*Profile* - Specifies which AWS credential profile to use::

  # URL parameter
  "pmtiles": "s3://bucket/tiles.pmtiles?profile=production"
  
  # Configuration property
  "pmtiles": "s3://bucket/tiles.pmtiles",
  "s3Profile": "production"

Precedence order (highest to lowest): Configuration property ``s3Profile``, URL parameter ``?profile=...``, default AWS credential chain.

*Region* - Specifies the AWS region (important for performance and cost optimization)::

  # URL parameter
  "pmtiles": "s3://bucket/tiles.pmtiles?region=us-west-2"
  
  # Configuration property
  "pmtiles": "s3://bucket/tiles.pmtiles",
  "s3Region": "us-west-2"

Precedence order (highest to lowest): Configuration property ``s3Region``, URL parameter ``?region=...``, Environment variable ``AWS_REGION``, Default: ``us-east-1``.

*RequestPayer* - Enables "requester pays" buckets where you pay for data transfer::

  # URL parameter
  "pmtiles": "s3://bucket/tiles.pmtiles?requestPayer=true"
  
  # Configuration property
  "pmtiles": "s3://bucket/tiles.pmtiles",
  "requestPayer": true

Precedence order (highest to lowest): Configuration property ``requestPayer``, URL parameter ``?requestPayer=true``, Default: ``false``.

*S3UrlFormat* - Specifies how to interpret S3 URLs::

  # URL parameter
  "pmtiles": "s3://my.bucket.name/tiles.pmtiles?s3UrlFormat=aws"
  
  # Configuration property
  "pmtiles": "s3://my.bucket.name/tiles.pmtiles",
  "s3UrlFormat": "aws"

Precedence order (highest to lowest): Configuration property ``s3UrlFormat``, URL parameter ``?s3UrlFormat=...``, Auto-detection.

**Complete Configuration Examples:**

Using URL parameters::

  "data": {
    "us-west-tiles": {
      "pmtiles": "s3://prod-bucket/tiles.pmtiles?profile=production&region=us-west-2"
    },
    "dotted-bucket-name": {
      "pmtiles": "s3://my.bucket.name/tiles.pmtiles?s3UrlFormat=aws&region=us-east-1"
    },
    "eu-requester-pays": {
      "pmtiles": "s3://bucket/tiles.pmtiles?profile=prod&region=eu-central-1&requestPayer=true"
    }
  }

Using configuration properties (recommended)::

  "data": {
    "us-west-tiles": {
      "pmtiles": "s3://prod-bucket/tiles.pmtiles",
      "s3Profile": "production",
      "s3Region": "us-west-2"
    },
    "dotted-bucket-name": {
      "pmtiles": "s3://my.bucket.name/tiles.pmtiles",
      "s3UrlFormat": "aws",
      "s3Region": "us-east-1"
    },
    "eu-requester-pays": {
      "pmtiles": "s3://bucket/tiles.pmtiles",
      "s3Profile": "production",
      "s3Region": "eu-central-1",
      "requestPayer": true
    }
  }

**Using S3 in Style JSON Sources:**

When referencing S3 sources from within a style JSON file, use the ``pmtiles://`` prefix with S3 URLs. You can specify profile, region, requestPayer, and s3UrlFormat using URL query parameters (configuration properties are not available in style JSON)::

  "sources": {
    "aws-tiles": {
      "url": "pmtiles://s3://my-bucket/tiles.pmtiles?profile=production",
      "type": "vector"
    },
    "dotted-bucket": {
      "url": "pmtiles://s3://my.bucket.name/tiles.pmtiles?s3UrlFormat=aws",
      "type": "vector"
    },
    "spaces-tiles": {
      "url": "pmtiles://s3://example-storage.com/my-bucket/tiles.pmtiles?region=nyc3",
      "type": "vector"
    }
  }

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
