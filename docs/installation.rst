============
Installation
============

Docker
======

When running docker image, no special installation is needed -- the docker will automatically download the image if not present.

Just run ``docker run --rm -it -v $(pwd):/data -p 8080:8080 maptiler/tileserver-gl``.

Additional options (see :doc:`/usage`) can be passed to the TileServer GL by appending them to the end of this command. You can, for example, do the following:

* ``docker run ... maptiler/tileserver-gl --mbtiles my-tiles.mbtiles`` -- explicitly specify which mbtiles to use (if you have more in the folder)
* ``docker run ... maptiler/tileserver-gl --verbose`` -- to see the default config created automatically

npm
===

npm is supported on the following platforms with Native Dependencies installed.

  * ``Operating systems:``
    * ``Ubuntu 20.04 (amd64/arm64)``
    * ``macOS 12 (amd64/arm64)``
    * ``Windows (amd64)``
  * ``Node.js 14, 16, 18``
  
Install From npmjs repository.
------------------------------
  npm install -g tileserver-gl
  tileserver-gl

Install From source
-------------------
  git clone https://github.com/maptiler/tileserver-gl.git
  cd tileserver-gl
  npm install
  node .

Native dependencies
-------------------

Ubuntu 20.04 (amd64/arm64)
~~~~~~~~~~~~~~~~~~~~~~~~~~
  * ``libcairo2-dev``
  * ``libjpeg8-dev``
  * ``libpango1.0-dev``
  * ``libgif-dev``
  * ``build-essential``
  * ``g++``
  * ``xvfb``
  * ``libgles2-mesa-dev``
  * ``libgbm-dev``
  * ``libxxf86vm-dev``

MacOS 12 (amd64/arm64)
~~~~~~~~~~~~~~~~~~~~~~
  * ``brew install pkg-config cairo libpng jpeg giflib``

Windows (amd64)
~~~~~~~~~~~~~~~~~~~~~~~~~
  * ``Microsoft Visual C++ 2015-2022 Redistributable``

``tileserver-gl-light`` on npm
==============================

Alternatively, you can use ``tileserver-gl-light`` package instead, which is pure javascript (does not have any native dependencies) and can run anywhere, but does not contain rasterization features.

