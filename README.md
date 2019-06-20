![tileserver-gl](https://cloud.githubusercontent.com/assets/59284/18173467/fa3aa2ca-7069-11e6-86b1-0f1266befeb6.jpeg)


# TileServer GL
[![Build Status](https://travis-ci.org/klokantech/tileserver-gl.svg?branch=master)](https://travis-ci.org/klokantech/tileserver-gl)
[![Docker Hub](https://img.shields.io/badge/docker-hub-blue.svg)](https://hub.docker.com/r/klokantech/tileserver-gl/)

Vector and raster maps with GL styles. Server side rendering by Mapbox GL Native. Map tile server for Mapbox GL JS, Android, iOS, Leaflet, OpenLayers, GIS via WMTS, etc.

## Get Started

Make sure you have Node.js version **6** installed (running `node -v` it should output something like `v6.11.3`).

Install `tileserver-gl` with server-side raster rendering of vector tiles with npm

```bash
npm install -g tileserver-gl
```

Now download vector tiles from [OpenMapTiles](https://openmaptiles.org/downloads/).

```bash
curl -o zurich_switzerland.mbtiles https://openmaptiles.os.zhdk.cloud.switch.ch/v3.3/extracts/zurich_switzerland.mbtiles
```

Start `tileserver-gl` with the downloaded vector tiles.

```bash
tileserver-gl zurich_switzerland.mbtiles
```

Alternatively, you can use the `tileserver-gl-light` package instead, which is pure javascript (does not have any native dependencies) and can run anywhere, but does not contain rasterization on the server side made with MapBox GL Native.

## Using Docker

An alternative to npm to start the packed software easier is to install [Docker](http://www.docker.com/) on your computer and then run in the directory with the downloaded MBTiles the command:

```bash
docker run --rm -it -v $(pwd):/data -p 8080:80 klokantech/tileserver-gl
```

This will download and start a ready to use container on your computer and the maps are going to be available in webbrowser on localhost:8080.

On laptop you can use [Docker Kitematic](https://kitematic.com/) and search "tileserver-gl" and run it, then drop in the 'data' folder the MBTiles.

## Documentation

You can read full documentation of this project at http://tileserver.readthedocs.io/.

## Offline development to fix styles

Tool and instructions: https://openmaptiles.org/docs/style/maputnik/
Run the `maputnik` executable to start a server on `localhost:8000`, open your browser and visit the address.

To  inspect and make temporary changes to our styles you can load them using the live tileJSON URLs either for dev or prod.
To load the map data that we use make sure you use the live URL that points to the data OSM2Vector tileJSON.

Latest tilserver README: https://buildmedia.readthedocs.org/media/pdf/tileserver/latest/tileserver.pdf

### Updating Styles/Sprites

Updated the point label groups, grouping by rank and zoom level.

Fixed some landuse colors of class pitch (Fx #15.65/55.698642/12.572399).

Railway lines added to each style.

Updated the "image-icon" reference in the styles from {maki}-11 to {class}-11.
The name of each icon to be shown is the same as the class name.


## NOTE:
When uploading a local JSON file to the the Maputnik editor, change the source URL, the sprite and glyphs to URLs.
Fx: ["sprite": "mono"] to ["sprite": "https://maps.monomaps.com/styles/updated-mono/sprite"]
