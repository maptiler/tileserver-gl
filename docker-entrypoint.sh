#!/bin/sh
if ! which -- "${1}"; then
  export DISPLAY=:99
  Xvfb "${DISPLAY}" -nolisten unix &
  exec node /usr/src/app/ "$@"
fi

exec "$@"
