============
Installation
============

Docker
======

When running docker image, no special installation is needed -- the docker will automatically download the image if not present.

Just run ``docker run -it -v $(pwd):/data -p 8080:80 klokantech/tileserver-gl``.

Additional options (see usage_) can be passed to the TileServer GL by appending them to the end of this command. You can, for example, do the following:

.. _usage: https://github.com/klokantech/tileserver-gl/blob/master/docs/usage.rst

* ``docker run ... klokantech/tileserver-gl my-tiles.mbtiles`` -- explicitly specify which mbtiles to use (if you have more in the folder)
* ``docker run ... klokantech/tileserver-gl --verbose`` -- to see the default config created automatically

Using npm
=============

Just run ``npm install -g tileserver-gl``.


Native dependencies
-------------------

There are some native dependencies that you need to make sure are installed if you plan to run the TileServer GL natively without docker.
The precise package names you need to install may differ on various platforms.

These are required on Debian 9:
  * ``build-essential``
  * ``libcairo2-dev``
  * ``libprotobuf-dev``

Installing on CentOS
----------------------

CentOS requires additional alterations, since dependencies like mapbox-gl-native require the a more recent version of gcc/g++ libraries than what CentOS upgrades provide. Detailed instructions for installing Tileserver-GL on CentOS can be found here_.

.. _here: https://github.com/klokantech/tileserver-gl/blob/master/docs/installation_centos.rst



``tileserver-gl-light`` on npm
-----------------------------------

Alternatively, you can use ``tileserver-gl-light`` package instead, which is pure javascript (does not have any native dependencies) and can run anywhere, but does not contain rasterization features.

Build from source
=======================

Make sure you have Node v4 (nvm_ install 4) and run::

  npm install
  node .

.. _nvm: 

On Ubuntu
------------
Tested on Ubuntu 16.04 with node v4.2.6::


   sudo apt-get install -y software-properties-common protobuf-compiler pkg-config libcairo2-dev libjpeg-dev libgif-dev git libgl1-mesa-glx build-essential g++ curl

   curl -sL https://deb.nodesource.com/setup_4.x | sudo -E bash -
   sudo apt-get install -y nodejs xvfb

   sudo mkdir /var/cache/npm
   sudo npm config set cache /var/cache/npm --global

   cd /tmp
   git clone https://github.com/klokantech/tileserver-gl.git
   cd tileserver-gl/

   sudo npm install -g --unsafe-perm



On OSX
-------

Make sure to have dependencies of canvas_ package installed::

  brew install pkg-config cairo libpng jpeg giflib

.. _canvas: https://www.npmjs.com/package/canvas

