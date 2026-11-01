#!/usr/bin/env bash
# Every local race, on every model given, one after another, into one log (2026-11-01 round 2). Run with the card free
# (no game open): a race measures the card, and a game holding 3-5 GB of it measures the game instead.
#   bash tools/measure/race-all.sh <log> model1 model2 ...
set -u
log=$1; shift
cd "$(dirname "$0")/../.."
for m in "$@"; do
  echo "########## $m" | tee -a "$log"
  # One model on the card at a time, so speed and memory are its own.
  for x in $(curl -s http://127.0.0.1:11434/api/ps | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s).models.forEach(x=>console.log(x.name)))"); do
    curl -s http://127.0.0.1:11434/api/generate -d "{\"model\":\"$x\",\"keep_alive\":0}" >/dev/null
  done
  node --no-warnings tools/measure/answerrace.mjs "$m" 2>&1 | tail -1 | tee -a "$log"
  node --no-warnings tools/measure/routerace.mjs "$m" 2>&1 | grep -E "^$m|exact" | tee -a "$log"
  THINK=off REPS=3 node --no-warnings tools/measure/steprace.mjs "$m" 2>&1 | tail -8 | tee -a "$log"
  node --no-warnings tools/measure/modelrace.mjs "$m" 2>&1 | tail -6 | tee -a "$log"
  curl -s http://127.0.0.1:11434/api/ps | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s).models.forEach(x=>console.log('card:',x.name,(x.size_vram/1e9).toFixed(1)+'GB of',(x.size/1e9).toFixed(1)+'GB')))" | tee -a "$log"
done
