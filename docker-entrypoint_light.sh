#!/bin/sh
if ! which -- "${1}"; then
  # first arg is not an executable
  exec node /usr/src/app/ -p 80 "$@"
fi

exec "$@"
