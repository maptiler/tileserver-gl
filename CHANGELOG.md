# tileserver-gl changelog

## 5.5.0-pre.5
* Add S3 support for PMTiles with multiple AWS credential profiles (https://github.com/maptiler/tileserver-gl/pull/1779) by @acalcutt
* Create .aws directory passthrough folder in Dockerfile (https://github.com/maptiler/tileserver-gl/pull/1784) by @acalcutt
* Update eslint to v9 (https://github.com/maptiler/tileserver-gl/pull/1473) by @acalcutt
* Fix Renderer Crashes from Failed Fetches (https://github.com/maptiler/tileserver-gl/pull/1798) by @acalcutt
* Add Visual Regression Tests for Static Image Overlays (https://github.com/maptiler/tileserver-gl/pull/1792) by @acalcutt
* Fix S3 URL parsing for nested paths in AWS buckets (https://github.com/maptiler/tileserver-gl/pull/1819) by @acalcutt
* Fix Renderer Crashes and Memory Leak (https://github.com/maptiler/tileserver-gl/pull/1825) by @acalcutt

## 5.4.0
* Fix the issue where the tile URL cannot be correctly parsed with the HTTPS protocol when using an nginx proxy service (https://github.com/maptiler/tileserver-gl/pull/1578) by @dakanggo
* Use jemalloc as memory allocator in the docker image (https://github.com/maptiler/tileserver-gl/pull/1574) by @MichielMortier
* Rasters: Add tileSize to TileJSON (https://github.com/maptiler/tileserver-gl/pull/1559) by @roblabs
* Allow a 'sparse' option per data source (https://github.com/maptiler/tileserver-gl/pull/1558) by @acalcutt
* Updates Maplibre-gl-js to v5.6.2 and adds color-relief support (note: this is not yet supported by maplibre-native) (https://github.com/maptiler/tileserver-gl/pull/1591)
* Fix getPublicUrl to handle relative and absolute URLs (https://github.com/maptiler/tileserver-gl/pull/1472) by @Monnte
* Workaround for 'hillshade-method' not yet being suported in maplibre-native (https://github.com/maptiler/tileserver-gl/pull/1620) by @acalcutt
* Updates Maplibre-native to v6.2.0. This should fix the macos metal support in Issue: (https://github.com/maptiler/tileserver-gl/issues/1402)

## 5.3.0
* Fix - Include public\resources js files on npm publish by specifying included files in package.json (https://github.com/maptiler/tileserver-gl/pull/1490) by @acalcutt
* Fix - Various Updates and Fix RTL Plugin Load (https://github.com/maptiler/tileserver-gl/pull/1489) by @okimiko
* Updates Maplibre-gl-js to v5 and adds globe support.

## 5.2.1
* Fix invalid Delete of 'prepare' Script required for Light Build (https://github.com/maptiler/tileserver-gl/pull/1489) by @okimiko


## 5.2.0
* Use npm packages for public/resources (https://github.com/maptiler/tileserver-gl/pull/1427) by @okimiko
* use ttf files of googlefonts/opensans (https://github.com/maptiler/tileserver-gl/pull/1447) by @okimiko
* Limit Elevation Lat/Long Output Length (https://github.com/maptiler/tileserver-gl/pull/1457) by @okimiko
* Fetch style from url (https://github.com/maptiler/tileserver-gl/pull/1462) by @YoelRidgway
* fix: memory leak on SIGHUP (https://github.com/maptiler/tileserver-gl/pull/1455) by @okimiko
* fix: resolves Unimplemented type: 3 error for geojson format (https://github.com/maptiler/tileserver-gl/pull/1465) by @rjdjohnston
* fix: Test light version in ct workflow - fix sqlite build in light (https://github.com/maptiler/tileserver-gl/pull/1477) by @acalcutt
* fix: light version docker entrypoint permissions (https://github.com/maptiler/tileserver-gl/pull/1478) by @acalcutt

## 5.1.3
* Fix SIGHUP (broken since 5.1.x) (https://github.com/maptiler/tileserver-gl/pull/1452) by @okimiko

## 5.1.2
* Fix broken light (invalid use of heavy dependencies) (https://github.com/maptiler/tileserver-gl/pull/1449) by @okimiko

## 5.1.1
* Fix wrong node version in Docker image (https://github.com/maptiler/tileserver-gl/pull/1442) by @acalcutt

## 5.1.0
* Update recommended node to v22 + Update docker images to use node 22 (https://github.com/maptiler/tileserver-gl/pull/1438) by @acalcutt
* Upgrade Express to v5 + Canvas to v3 + code cleanup (https://github.com/maptiler/tileserver-gl/pull/1429) by @acalcutt
* Terrain Preview and simple Elevation Query (https://github.com/maptiler/tileserver-gl/pull/1425 and https://github.com/maptiler/tileserver-gl/pull/1432) by @okimiko
* add progressive rendering option for static jpeg images (#1397) by @samuel-git

## 5.0.0
* Update Maplibre-Native to [v6.0.0](https://github.com/maplibre/maplibre-native/releases/tag/node-v6.0.0) release by @acalcutt in https://github.com/maptiler/tileserver-gl/pull/1376 and @dependabot in https://github.com/maptiler/tileserver-gl/pull/1381 
  *  This first release that use Metal for rendering instead of OpenGL (ES) for macOS. 
  *  This the first release that uses OpenGL (ES) 3.0 on Windows and Linux 
  * Note: Windows users may need to update their [c++ redistributable ](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170) for maplibre-native v6.0.0
