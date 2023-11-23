# TileServer GL light
[![Build Status](https://travis-ci.org/maptiler/tileserver-gl.svg?branch=master)](https://travis-ci.org/maptiler/tileserver-gl)
[![Docker Hub](https://img.shields.io/badge/docker-hub-blue.svg)](https://hub.docker.com/r/maptiler/tileserver-gl/)

Vector maps with GL styles. Map tile server for Mapbox Android, iOS, GL JS, Leaflet, OpenLayers, etc. without server side rendering.

## Quickstart
Use `npm install -g tileserver-gl-light` to install the package from npm.

Then you can simply run `tileserver-gl-light zurich_switzerland.mbtiles` to start the server for the given mbtiles.

See also `tileserver-gl` which contains server side rendering.

Prepared vector tiles can be downloaded from [OpenMapTiles.com](https://openmaptiles.com/downloads/planet/).

## Building docker image

You can build TileServer GL light image from source.

```
git clone https://github.com/maptiler/tileserver-gl.git
cd tileserver-gl
node publish.js --no-publish
cd light
docker build -t tileserver-gl-light .
```

[Download from OpenMapTiles.com](https://openmaptiles.com/downloads/planet/) or [create](https://github.com/openmaptiles/openmaptiles) your vector tile, and run following in directory contains your *.mbtiles.

```
docker run --rm -it -v $(pwd):/data -p 8080:8080 tileserver-gl-light
```

## Documentation
You can read full documentation of this project at https://maptiler-tileserver.readthedocs.io/
