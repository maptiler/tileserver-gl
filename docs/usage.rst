=====
Usage
=====

Getting started
======
::

  Usage: tileserver-gl [file] [options]

  Options:
    --file <file>             MBTiles or PMTiles file (local path, http(s)://, s3://, pmtiles://, or mbtiles:// URL)
                                ignored if the configuration file is also specified
    --mbtiles <file>          (DEPRECIATED) MBTiles file
                                ignored if file is also specified
                                ignored if the configuration file is also specified
    -c, --config <file>       Configuration file [config.json] (default: "config.json")
    -b, --bind <address>      Bind address
    -p, --port <port>         Port [8080] (default: 8080)
    -C|--no-cors              Disable Cross-origin resource sharing headers
    -u|--public_url <url>     Enable exposing the server on subpaths, not necessarily the root of the domain
    --fetch-timeout <ms>      Timeout in milliseconds for fetching remote tiles (default: 15000)
    -V, --verbose [level]     More verbose output (level 1-3)
                                -V, --verbose, -V 1, or --verbose 1: Important operations
                                -V 2 or --verbose 2: Detailed operations  
                                -V 3 or --verbose 3: All requests and debug info
    -s, --silent              Less verbose output
    -l|--log_file <file>      output log file (defaults to standard out)
    -f|--log_format <format>  define the log format:  https://github.com/expressjs/morgan#morganformat-options
    -v, --version             output the version number
    -h, --help                display help for command


File Source Options
======

The `--file` option supports multiple source types:

**Local files:**
::

  tileserver-gl --file ./data/zurich.mbtiles
  tileserver-gl --file ./data/terrain.pmtiles

**HTTP/HTTPS URLs:**
::

  tileserver-gl --file https://example.com/tiles.pmtiles

**S3 URLs:**
::

  # Basic AWS S3
  tileserver-gl --file s3://my-bucket/tiles.pmtiles

  # With AWS credential profile
  tileserver-gl --file "s3://my-bucket/tiles.pmtiles?profile=production"

  # With specific region
  tileserver-gl --file "s3://my-bucket/tiles.pmtiles?region=us-west-2"

  # With profile and region
  tileserver-gl --file "s3://my-bucket/tiles.pmtiles?profile=production&region=eu-central-1"

  # Requester-pays bucket
  tileserver-gl --file "s3://bucket/tiles.pmtiles?requestPayer=true"

  # Bucket name with dots (force AWS S3 interpretation)
  tileserver-gl --file "s3://my.bucket.name/tiles.pmtiles?s3UrlFormat=aws"

  # All options combined
  tileserver-gl --file "s3://bucket/tiles.pmtiles?profile=prod&region=us-west-2&requestPayer=true"

  # S3-compatible storage (e.g., DigitalOcean Spaces, Contabo)
  tileserver-gl --file "s3://example-storage.com/my-bucket/tiles.pmtiles?profile=dev"

**Protocol prefixes:**

You can also use `pmtiles://` or `mbtiles://` prefixes to explicitly specify the file type:
::

  tileserver-gl --file pmtiles://https://example.com/tiles.pmtiles
  tileserver-gl --file "pmtiles://s3://my-bucket/tiles.pmtiles?profile=production"
  tileserver-gl --file mbtiles://./data/zurich.mbtiles

.. note::
    For S3 sources, AWS credentials must be configured via environment variables, AWS credentials file (`~/.aws/credentials` on Linux/macOS or `C:\Users\USERNAME\.aws\credentials` on Windows), or IAM roles. 
    
    The `s3UrlFormat` parameter can be set to `aws` or `custom` to override auto-detection when needed (e.g., for AWS bucket names containing dots).
    
    **When using Docker**, the host credentials file can be mounted to the container's user home directory:

    ::
    
        docker run -v ~/.aws/credentials:/home/node/.aws/credentials:ro ... maptiler/tileserver-gl:latest

    See the Configuration documentation for details on using AWS credential profiles.

Default preview style and configuration
======

- If no configuration file is specified, a default preview style (compatible with openmaptiles) is used.
- If no data file is specified (and is not found in the current working directory), a sample file is downloaded (showing the Zurich area)

Remote tile fetching and timeouts
======

TileServer GL can fetch tiles from remote HTTP/HTTPS sources referenced in your style. The ``--fetch-timeout`` option controls how long the server will wait for remote tile requests before giving up.

**Default behavior:**
- Default timeout is 15 seconds (15000 milliseconds)
- If a remote tile request exceeds this timeout, an error is logged and an empty tile is returned to the renderer

**Tuning the timeout:**

If you notice timeout errors with certain remote sources, you can adjust the timeout:
::

  # Increase timeout to 30 seconds for slower remote sources
  tileserver-gl -c config.json --fetch-timeout 30000

  # Reduce timeout to 5 seconds for faster failure
  tileserver-gl -c config.json --fetch-timeout 5000

Reloading the configuration
======

It is possible to reload the configuration file without restarting the whole process by sending a SIGHUP signal to the node process.

- The `docker kill -s HUP tileserver-gl` command can be used when running the tileserver-gl docker container.
- The `docker-compose kill -s HUP tileserver-gl-service-name` can be used when tileserver-gl is run as a docker-compose service.

Docker and `--port`
======

When running tileserver-gl in a Docker container, using the `--port` option would make the container incorrectly seem unhealthy.
Instead, it is advised to use Docker's port mapping and map the default port 8080 to the desired external port.
