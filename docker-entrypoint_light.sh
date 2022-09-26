#!/bin/sh

set -e

handle() {
	SIGNAL=$(( $? - 128 ))
	echo "Caught signal ${SIGNAL}, stopping gracefully"
	kill -s ${SIGNAL} $(pidof node) 2>/dev/null
}

trap handle INT TERM

refresh() {
	SIGNAL=$(( $? - 128 ))
	echo "Caught signal ${SIGNAL}, refreshing"
	kill -s ${SIGNAL} $(pidof node) 2>/dev/null
}

trap refresh HUP

if ! which -- "${1}"; then
  # first arg is not an executable
  node /usr/src/app/ -p 80 "$@" &
	# Wait exits immediately on signals which have traps set. Store return value and wait
	# again for all jobs to actually complete before continuing.
	wait $! || RETVAL=$?
	while [ ${RETVAL} = 129 ] ; do
	  # Refressh signal HUP received. Continue waiting for signals.
	  wait $! || RETVAL=$?
	done
	wait
	exit ${RETVAL}
fi

exec "$@"
