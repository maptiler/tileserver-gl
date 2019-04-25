===================
Available endpoints
===================

If you visit the server on the configured port (default 8080) you can see your maps appearing in the browser.

Styles
======
* Styles are served at ``/styles/{id}/style.json`` (+ array at ``/styles.json``)

  * Sprites at ``/styles/{id}/sprite[@2x].{format}``
  * Fonts at ``/fonts/{fontstack}/{start}-{end}.pbf``

Rendered tiles
==============
* Rendered tiles are served at ``/styles/{id}/{z}/{x}/{y}[@2x].{format}``

  * The optional ``@2x`` (or ``@3x``, ``@4x``) part can be used to render HiDPI (retina) tiles
  * Available formats: ``png``, ``jpg`` (``jpeg``), ``webp``
  * TileJSON at ``/styles/{id}.json``

* The rendered tiles are not available in the ``tileserver-gl-light`` version.

Static images
=============
* Several endpoints:

  * ``/styles/{id}/static/{lon},{lat},{zoom}[@{bearing}[,{pitch}]]/{width}x{height}[@2x].{format}`` (center-based)
  * ``/styles/{id}/static/{minx},{miny},{maxx},{maxy}/{width}x{height}[@2x].{format}`` (area-based)
  * ``/styles/{id}/static/auto/{width}x{height}[@2x].{format}`` (autofit path -- see below)

* All the static image endpoints additionally support following query parameters:

  * ``path`` - comma-separated ``lng,lat``, pipe-separated pairs

    * e.g. ``5.9,45.8|5.9,47.8|10.5,47.8|10.5,45.8|5.9,45.8``

  * ``latlng`` - indicates the ``path`` coordinates are in ``lat,lng`` order rather than the usual ``lng,lat``
  * ``fill`` - color to use as the fill (e.g. ``red``, ``rgba(255,255,255,0.5)``, ``#0000ff``)
  * ``stroke`` - color of the path stroke
  * ``width`` - width of the stroke
  * ``padding`` - "percetange" padding for fitted endpoints (area-based and path autofit)

    * value of ``0.1`` means "add 10% size to each side to make sure the area of interest is nicely visible"

* You can also use (experimental) ``/styles/{id}/static/raw/...`` endpoints with raw spherical mercator coordinates (EPSG:3857) instead of WGS84.

* The static images are not available in the ``tileserver-gl-light`` version.

Source data
===========
* Source data are served at ``/data/{mbtiles}/{z}/{x}/{y}.{format}``

  * Format depends on the source file (usually ``png`` or ``pbf``)

    * ``geojson`` is also available (useful for inspecting the tiles) in case the original format is ``pbf``

  * TileJSON at ``/data/{mbtiles}.json``

TileJSON arrays
===============
Array of all TileJSONs is at ``/index.json`` (``/rendered.json``; ``/data.json``)

List of available fonts
=======================
Array of names of the available fonts is at ``/fonts.json``

Health check
============
Endpoint reporting health status is at ``/health`` and currently returns:

  * ``503`` Starting - for a short period before everything is initialized
  * ``200`` OK - when the server is running
