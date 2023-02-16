#!/bin/sh
if ! which -- "${1}"; then
  # first arg is not an executable
  export DISPLAY=:99
  Xvfb "${DISPLAY}" -nolisten unix &
  exec node /usr/src/app/ -p 80 "$@"
fi

exec "$@"
