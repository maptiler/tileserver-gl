===================
Available endpoints
===================

If you visit the server on the configured port (default 8080) you can see your maps appearing in the browser.

Styles
======
* Styles are served at ``/styles/{id}/style.json`` (+ array at ``/styles.json``)

  * Sprites at ``/styles/{id}/sprite[/spriteID][@2x].{format}``
  * Fonts at ``/fonts/{fontstack}/{start}-{end}.pbf``

Rendered tiles
==============
* Rendered tiles are served at ``/styles/{id}[/{tileSize}]/{z}/{x}/{y}[@2x].{format}``

  * The optional ratio ``@2x`` (ex.  ``@2x``, ``@3x``, ``@4x``) part can be used to render HiDPI (retina) tiles
  * The optional tile size ``/{tileSize}`` (ex. ``/256``, ``/512``). if omitted, tileSize defaults to 256.
  * Available formats: ``png``, ``jpg`` (``jpeg``), ``webp``
  * TileJSON at ``/styles[/{tileSize}]/{id}.json``

* The rendered tiles are not available in the ``tileserver-gl-light`` version.

WMTS Capabilities
==============
* WMTS Capabilities are served at ``/styles/{id}/wmts.xml``

Static images
=============
* Several endpoints:

  * ``/styles/{id}/static/{lon},{lat},{zoom}[@{bearing}[,{pitch}]]/{width}x{height}[@2x].{format}`` (center-based)
  * ``/styles/{id}/static/{minx},{miny},{maxx},{maxy}/{width}x{height}[@2x].{format}`` (area-based)
  * ``/styles/{id}/static/auto/{width}x{height}[@2x].{format}`` (autofit path -- see below)

* All the static image endpoints additionally support following query parameters:

  * ``path`` - ``((fill|stroke|width)\:[^\|]+\|)*(enc:.+|-?\d+(\.\d*)?,-?\d+(\.\d*)?(\|-?\d+(\.\d*)?,-?\d+(\.\d*)?)+)``

    * comma-separated ``lng,lat``, pipe-separated pairs

      * e.g. ``path=5.9,45.8|5.9,47.8|10.5,47.8|10.5,45.8|5.9,45.8``

    * `Google Encoded Polyline Format <https://developers.google.com/maps/documentation/utilities/polylinealgorithm>`_

      * e.g. ``path=enc:_p~iF~ps|U_ulLnnqC_mqNvxq`@``
      * If 'enc:' is used, the rest of the path parameter is considered to be part of the encoded polyline string -- do not specify the coordinate pairs.

    * With options (fill|stroke|width)

      * e.g. ``path=stroke:yellow|width:2|fill:green|5.9,45.8|5.9,47.8|10.5,47.8|10.5,45.8|5.9,45.8`` or ``path=stroke:blue|width:1|fill:yellow|enc:_p~iF~ps|U_ulLnnqC_mqNvxq`@``

    * can be provided multiple times

  * ``latlng`` - indicates coordinates are in ``lat,lng`` order rather than the usual ``lng,lat`` for paths and markers
  * ``fill`` - default color to use as the fill (e.g. ``red``, ``rgba(255,255,255,0.5)``, ``#0000ff``) for all paths
  * ``stroke`` - default color of the path stroke for all paths
  * ``width`` - default width of the stroke for all paths
  * ``linecap`` - rendering style for the start and end points of all paths - see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap
  * ``linejoin`` - rendering style for joining successive segments of all paths when the direction changes - see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin
  * ``border`` - color of the optional border stroke for all paths ; the border is like a halo around the stroke
  * ``borderwidth`` - width of the border stroke (default 10% of stroke width) for all paths
  * ``marker`` - Marker in format ``lng,lat|iconPath|option|option|...``

    * Will be rendered with the bottom center at the provided location
    * ``lng,lat`` and ``iconPath`` are mandatory and icons won't be rendered without them
    * ``iconPath`` is either a link to an image served via http(s) or a path to a file relative to the configured icon path
    * ``option`` must adhere to the format ``optionName:optionValue`` and supports the following names

      * ``scale`` - Factor to scale image by

        * e.g. ``0.5`` - Scales the image to half it's original size

      * ``offset`` - Image offset as positive or negative pixel value in format ``[offsetX],[offsetY]``

        * scales with ``scale`` parameter since image placement is relative to it's size
        * e.g. ``2,-4`` - Image will be moved 2 pixel to the right and 4 pixel in the upwards direction from the provided location

    * e.g. ``5.9,45.8|marker-start.svg|scale:0.5|offset:2,-4``
    * can be provided multiple times

  * ``padding`` - "percentage" padding for fitted endpoints (area-based and path autofit)

    * value of ``0.1`` means "add 10% size to each side to make sure the area of interest is nicely visible"

  * ``maxzoom`` - Maximum zoom level (only for auto endpoint where zoom level is calculated and not provided)

* You can also use (experimental) ``/styles/{id}/static/raw/...`` endpoints with raw spherical mercator coordinates (EPSG:3857) instead of WGS84.

* The static images are not available in the ``tileserver-gl-light`` version.

Source data
===========
* Source data are served at ``/data/{id}/{z}/{x}/{y}.{format}``

  * Format depends on the source file (usually ``png`` or ``pbf``)

    * ``geojson`` is also available (useful for inspecting the tiles) in case the original format is ``pbf``

  * TileJSON at ``/data/{id}.json``

TileJSON arrays
===============
Array of all TileJSONs is at ``[/{tileSize}]/index.json`` (``[/{tileSize}]/rendered.json``; ``/data.json``)

  * The optional tile size ``/{tileSize}`` (ex. ``/256``, ``/512``). if omitted, tileSize defaults to 256.

List of available fonts
=======================
Array of names of the available fonts is at ``/fonts.json``

Health check
============
Endpoint reporting health status is at ``/health`` and currently returns:

  * ``503`` Starting - for a short period before everything is initialized
  * ``200`` OK - when the server is running
