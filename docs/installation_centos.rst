======================================
Installing Tileserver-GL on CentOS 7
======================================

Mapbox-GL-native requires a more recent version of gcc/g++ libraries than is packaged with CentOS7 updates, so installation needs to be done a little differently. This assumes you're working on a fresh CentOS instance.

---------

First Add EPEL repo for extra packages::

  #!/usr/bin/env bash
  sudo yum -y install epel-release

Update and upgrade your system::

   sudo yum -q -y update
   sudo yum -q -y upgrade


Now install Node v4.X. This can be done through nvm, but if you are starting on a fresh instance, this will do the trick to setup the NodeJsv4.X repo::

   curl -sL https://rpm.nodesource.com/setup_4.x | sudo bash -

Install necessary dependencies. 
NOTE: We probably dont need all of these. There are a few left over from the initial Centos testing.::

  sudo yum -y -q install \
    autoconf \
    automake \
    cairo \
    cairo-devel \
    cairomm-devel \
    cmake3 \
    curl \
    gcc \
    gcc-c++ \
    giflib-devel \
    git \
    git-core \
    libcurl \
    libjpeg-turbo-devel \
    mesa-dri-drivers \
    nodejs-4.2.5 \
    nodejs-devel-4.2.5 \
    pango \
    pango-devel \
    pangomm \
    pangomm-devel \
    protobuf \
    protobuf-compiler \
    protobuf-devel \
    xorg-x11-server-Xvfb

Add the fedora repo to get updated versions of gcc & g++

**IMPORTANT NOTE: Don't do a system update after enableing this repo. It will get UGLY really fast.**::

  echo "[warning:fedora]" | sudo tee /etc/yum.repos.d/FedoraRepo.repo
  echo "name=fedora" | sudo tee -a /etc/yum.repos.d/FedoraRepo.repo
  echo "mirrorlist=http://mirrors.fedoraproject.org/mirrorlist?repo=fedora-23&arch=\$basearch" | sudo tee -a /etc/yum.repos.d/FedoraRepo.repo
  echo "enabled=1" | sudo tee -a /etc/yum.repos.d/FedoraRepo.repo
  echo "gpgcheck=1" | sudo tee -a /etc/yum.repos.d/FedoraRepo.repo
  echo "gpgkey=https://getfedora.org/static/34EC9CBA.txt" | sudo tee -a /etc/yum.repos.d/FedoraRepo.repo


Get new versions of gcc & g++::

  sudo yum -y update gcc g++

Potentially unnecessary step::

  sudo alternatives --install /usr/bin/cmake qmake /usr/bin/cmake3 500

This stops tileserver-gl complaining about a missing library::

  sudo ln -s /lib64/libcurl.so.4.3.0 /lib64/libcurl-gnutls.so.4.3.0
  sudo ln -s /lib64/libcurl.so.4.3.0 /lib64/libcurl-gnutls.so.4


Change permissions blocking tileserver from accessing dependencies...

*This is seriously UGLY and a security problem but it gets around errors with "npm -g"*::

  sudo chmod -R 777 /usr/lib/node_modules/
  sudo chmod o+w /usr/bin


Install tileserver from npm::

  npm install -g tileserver-gl


Grab the tileserver demo data::

  curl -o zurich_switzerland.mbtiles https://openmaptiles.os.zhdk.cloud.switch.ch/v3.3/extracts/zurich_switzerland.mbtiles


Use xvfb to run the tile server manually::

  xvfb-run -s "-screen 0 1024x768x24 +extension GLX" /usr/bin/tileserver-gl --verbose

