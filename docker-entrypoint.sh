#!/bin/sh
if ! which -- "${1}"; then
  # first arg is not an executable
  rm /tmp/.X99-lock -f > /dev/null || ``
  export DISPLAY=:99
  Xvfb "${DISPLAY}" -nolisten unix &
  exec node /usr/src/app/ "$@"
fi

exec "$@"
