# tileserver-gl changelog

## 5.2.0-pre.0
* Use npm packages for public/resources (https://github.com/maptiler/tileserver-gl/pull/1427) by @okimiko
* use ttf files of googlefonts/opensans (https://github.com/maptiler/tileserver-gl/pull/1447) by @okimiko
* fix memory leak on SIGHUP (https://github.com/maptiler/tileserver-gl/pull/1455) by @okimiko
* Limit Elevation Lat/Long Output Length (https://github.com/maptiler/tileserver-gl/pull/1457) by @okimiko

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
