============
Installation
============

Docker
======

When running docker image, no special installation is needed -- the docker will automatically download the image if not present.

Just run ``docker run --rm -it -v $(pwd):/data -p 8080:80 maptiler/tileserver-gl``.

Additional options (see :doc:`/usage`) can be passed to the TileServer GL by appending them to the end of this command. You can, for example, do the following:

* ``docker run ... maptiler/tileserver-gl --mbtiles my-tiles.mbtiles`` -- explicitly specify which mbtiles to use (if you have more in the folder)
* ``docker run ... maptiler/tileserver-gl --verbose`` -- to see the default config created automatically

npm
===

Just run ``npm install -g tileserver-gl``.


Native dependencies
-------------------

There are some native dependencies that you need to make sure are installed if you plan to run the TileServer GL natively without docker.
The precise package names you need to install may differ on various platforms.

These are required on Debian 11:
  * ``libgles2-mesa``
  * ``libegl1``
  * ``xvfb``
  * ``xauth``
  * ``libopengl0``
  * ``libcurl4``
  * ``curl``
  * ``libuv1-dev``
  * ``libc6-dev``
  * ``http://archive.ubuntu.com/ubuntu/pool/main/libj/libjpeg-turbo/libjpeg-turbo8_2.0.3-0ubuntu1_amd64.deb``
  * ``http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu66_66.1-2ubuntu2_amd64.deb``

These are required on Ubuntu 20.04:
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

``tileserver-gl-light`` on npm
==============================

Alternatively, you can use ``tileserver-gl-light`` package instead, which is pure javascript (does not have any native dependencies) and can run anywhere, but does not contain rasterization features.


From source
===========

Make sure you have Node v10 (nvm install 10) and run::

  npm install
  node .


On OSX
======

Make sure to have dependencies of canvas_ package installed::

  brew install pkg-config cairo libpng jpeg giflib


.. _canvas: https://www.npmjs.com/package/canvas
