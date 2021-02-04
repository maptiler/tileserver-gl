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

Just run ``npm install -g tileserver-gl``.


Native dependencies
-------------------

There are some native dependencies that you need to make sure are installed if you plan to run the TileServer GL natively without docker.
The precise package names you need to install may differ on various platforms.

These are required on Debian 9:
  * ``build-essential``
  * ``libcairo2-dev``
  * ``libprotobuf-dev``


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
