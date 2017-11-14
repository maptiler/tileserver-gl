#!/bin/bash
start-stop-daemon --start --pidfile ~/xvfb.pid --make-pidfile --background --exec /usr/bin/Xvfb -- :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset
echo "Waiting 3 seconds for xvfb to start..."
sleep 3

export DISPLAY=:99.0

cd /data
node /usr/src/app/ -p 80 "$@"

start-stop-daemon --stop --pidfile ~/xvfb.pid # stop xvfb when exiting
rm ~/xvfb.pid
