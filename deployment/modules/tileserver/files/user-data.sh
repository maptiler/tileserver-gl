#!/bin/bash
set -x
#shellcheck disable=SC2154,SC2086,SC2035
sudo sed -i -e 's/node \/usr\/src\/app\/ -p 80 "$@" \&/node \/usr\/src\/app\/ -p 8080 "$@" -c config.json  \&/g' /usr/src/app/run.sh
{
	sudo mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport "${efs_dns_name}:/mbtiles/" /data/mbtiles
} || {
	echo "Could not mount EFS!!!"
}
bash /usr/src/app/run.sh &
