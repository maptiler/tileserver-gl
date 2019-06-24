#!/bin/bash
set -x
# shellcheck disable=SC2154,SC2086,SC2035
REGION=${region}
ENVIRONMENT=${environment}
MONO_REGION=${mono_region}
REPO_VERSION=${repo_version}
AWS_ACCESS_KEY=${aws_access_key}
AWS_SECRET_KEY=${aws_secret_key}
BUCKET="mono-deployment-$ENVIRONMENT"
DEPLOYABLE="tileserver-gl-$REPO_VERSION.tar.gz"
FULL_BUCKET_URI="s3://$BUCKET/tileserver-gl/$DEPLOYABLE"
DATA_VERSION="2019-05-20"
# Setup dependencies
sudo rm /var/lib/dpkg/lock
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt install -y apt-transport-https \
curl unzip build-essential python python-pip libcairo2-dev \
libgles2-mesa-dev libgbm-dev libllvm3.9 libprotobuf-dev \
libxxf86vm-dev libjpeg-dev xvfb nginx git nodejs nfs-common \
heat-cfntools software-properties-common cloud-init
sudo pip install awscli
# Setup environment
sudo tee -a /etc/environment << EOL
REGION=$REGION
ENVIRONMENT=$ENVIRONMENT
MONO_REGION=$MONO_REGION
EOL
aws configure set aws_access_key_id "$AWS_ACCESS_KEY"
aws configure set aws_secret_access_key "$AWS_SECRET_KEY"
aws configure set region "$REGION"

sudo rm /etc/apt/sources.list.d/microsoft.list
sudo groupadd nginx
sudo useradd nginx -g nginx
sudo mkdir -p /usr/src/app/. \
/data/mbtiles/. \
/tmp/uncompressed/.

# Configure service/Mount FS
{
	sudo mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport "${efs_dns_name}:/mbtiles/" /data/mbtiles
} || {
	echo "Could not mount EFS!!!"
}

sudo chown -R ubuntu:ubuntu /usr/src/app/.
# Setup project
{
	aws s3 cp "$FULL_BUCKET_URI" /tmp/tileserver-gl.tar.gz
	tar xzf /tmp/tileserver-gl.tar.gz -C /tmp/uncompressed/
	# Setup map files
	sudo mv -f /tmp/uncompressed/configuration/map_files/config.json /data/
	sudo rm -rf /data/mbtiles/${DATA_VERSION}_data/styles \
	/data/mbtiles/${DATA_VERSION}_data/glyphs \
	/data/mbtiles/${DATA_VERSION}_data/sprites
	sudo mv -f /tmp/uncompressed/configuration/map_files/* /data/mbtiles/${DATA_VERSION}_data/
	sudo chown -R ubuntu:ubuntu /data/mbtiles/${DATA_VERSION}_data/styles
	sudo chown -R ubuntu:ubuntu /data/mbtiles/${DATA_VERSION}_data/glyphs
	sudo chown -R ubuntu:ubuntu /data/mbtiles/${DATA_VERSION}_data/sprites
	sudo chown ubuntu:ubuntu /data/config.json
	# Setup nginx
	sudo mv /tmp/uncompressed/configuration/nginx.conf /etc/nginx/.
	# Setup app
	mv /tmp/uncompressed/* /usr/src/app/.
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

sudo service nginx restart
bash /usr/src/app/run.sh &
