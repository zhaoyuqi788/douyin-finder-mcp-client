#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
node client/manage-invites.mjs
