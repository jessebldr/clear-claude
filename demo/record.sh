#!/usr/bin/env bash
# Records one tape with VHS and assembles the GIF with ffmpeg.
#
# usage: demo/record.sh <name>      reads demo/<name>.tape, writes demo/<name>.gif
#
# Why not let VHS write the GIF: on Windows with ffmpeg 9 its own assembly step fails without
# an error. The tapes therefore ask for raw frames (`Output frames-<name>/`), which VHS writes as
# two transparent PNG layers, text and cursor, and this script joins them. On macOS and Linux
# `vhs <name>.tape` with an `Output <name>.gif` line works on its own.
set -euo pipefail
name="$1"; fps="${FPS:-12}"; bg="${BG:-0x171717}"
cd "$(dirname "$0")"
. ./env.sh

rm -rf "frames-$name"
vhs "$name.tape" > "$name.log" 2>&1

size=$(ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "frames-$name/frame-text-00001.png")
# A full 256-colour palette: a smaller, diff-based one loses the dark tints behind the chips.
ffmpeg -v error -y -f lavfi -i "color=c=$bg:s=$size:r=$fps" \
  -framerate "$fps" -i "frames-$name/frame-text-%05d.png" \
  -framerate "$fps" -i "frames-$name/frame-cursor-%05d.png" \
  -filter_complex "[0][1]overlay=format=auto:shortest=1[a];[a][2]overlay=format=auto:shortest=1,split[x][y];[x]palettegen=stats_mode=full:max_colors=256[p];[y][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$name.gif"
ls -la "$name.gif"
