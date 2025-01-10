# tileserver-gl changelog

## 5.0.0
* Update Maplibre-Native to [v6.0.0](https://github.com/maplibre/maplibre-native/releases/tag/node-v6.0.0) release by @acalcutt in https://github.com/maptiler/tileserver-gl/pull/1376 and @dependabot in https://github.com/maptiler/tileserver-gl/pull/1381 
  *  This first release that use Metal for rendering instead of OpenGL (ES) for macOS. 
  *  This the first release that uses OpenGL (ES) 3.0 on Windows and Linux 
  * Note: Windows users may need to update their [c++ redistributable ](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170) for maplibre-native v6.0.0