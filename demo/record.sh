#!/usr/bin/env bash
# Records one tape with VHS into raw frames. Assembling them is edit.mjs's job.
#
# usage: demo/record.sh <name>      reads demo/<name>.tape, writes demo/frames-<name>/
#
# Why raw frames and not VHS's own GIF: on Windows with ffmpeg 9 its assembly step fails
# without an error, and edit.mjs needs the frames anyway to drop the ones where nothing
# happens. The tapes ask for `Output frames-<name>/`, which VHS writes as two transparent PNG
# layers per frame, text and cursor.
set -euo pipefail
name="$1"
cd "$(dirname "$0")"
. ./env.sh

rm -rf "frames-$name"
vhs "$name.tape" > "$name.log" 2>&1
echo "$name: $(ls "frames-$name" | grep -c '^frame-text-') frames. Next: node demo/edit.mjs"
