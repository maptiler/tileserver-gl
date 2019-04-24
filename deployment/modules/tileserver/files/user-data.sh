#!/bin/bash
set -x
#shellcheck disable=SC2154,SC2086,SC2035
REGION=${region}
ENVIRONMENT=${evironment}
MONO_REGION=${mono_region}
REPO_VERSION=${repo_version}
DEPLOYABLE="tileserver-gl-$REPO_VERSION.tar.gz"
FULL_BUCKET_URI="s3://$BUCKET/tileserver-gl/$DEPLOYABLE"
# Setup dependencies
sudo rm /var/lib/dpkg/lock
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt install -y apt-transport-https \
curl unzip build-essential python libcairo2-dev \
libgles2-mesa-dev libgbm-dev libllvm3.9 libprotobuf-dev \
libxxf86vm-dev libjpeg-dev xvfb nginx git nodejs nfs-common \
heat-cfntools software-properties-common cloud-init

# Setup environment
sudo tee -a /etc/environment << EOL
REGION=$REGION
ENVIRONMENT=$ENVIRONMENT
MONO_REGION=$MONO_REGION
EOL
sudo rm /etc/apt/sources.list.d/microsoft.list
sudo groupadd nginx
sudo useradd nginx -g nginx
sudo mkdir -p /usr/src/app/. \
/data/mbtiles/. \
/tmp/uncompressed/.

sudo chown -R ubuntu:ubuntu /usr/src/app/.
# Setup project
{
	aws s3 cp "FULL_BUCKET_URI" /tmp/tileserver-gl.tar.gz
	tar xzf /tmp/tileserver-gl.tar.gz -C /tmp/uncompressed/
	# Setup map files
	sudo mv /tmp/uncompressed/map_files/* /data/.
	sudo chown -R ubuntu:ubuntu /data/.
	# Setup app
	mv /tmp/uncompressed/* /usr/src/app/.
	# Setup nginx
	sudo mv /tmp/uncompressed/configuration/nginx.conf /etc/nginx/.
	# cd /usr/src/app/. && npm install	
} || {
	echo ""
	echo "Failed to setup project!"
	echo "Tried fetching FULL_BUCKET_URI: $FULL_BUCKET_URI"
	echo ""
	echo "Tried modifying the following directories:"
	echo "/data/."
	echo "/usr/src/app/."
	echo "/etc/nginx"
	echo ""
}
# git clone https://github.com/klokantech/tileserver-gl.git /home/ubuntu/tileserver-gl

# Configure service
sudo sed -i -e 's/node \/usr\/src\/app\/ -p 80 "$@" \&/node \/usr\/src\/app\/ -p 8080 "$@" -c config.json  \&/g' /usr/src/app/run.sh
{
	sudo mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport "${efs_dns_name}:/mbtiles/" /data/mbtiles
} || {
	echo "Could not mount EFS!!!"
}
bash /usr/src/app/run.sh &
