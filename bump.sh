#!/bin/sh
# Stamp one version on every internal module import and on the page entries,
# so a deploy never mixes a fresh app.mjs with a cached older module.
# Usage: ./bump.sh 2
set -e
V="$1"; [ -n "$V" ] || { echo "usage: ./bump.sh N"; exit 1; }
cd "$(dirname "$0")"
sed -i -E "s#from '(\./[a-z0-9/-]+\.mjs)(\?v=[0-9]+)?'#from '\1?v=$V'#g; s#import\('(\./[a-z0-9/-]+\.mjs)(\?v=[0-9]+)?'\)#import('\1?v=$V')#g" js/*.mjs
sed -i -E "s#(js/[a-z/.-]+\.(mjs|js)\?v=)[0-9]+#\1$V#g; s#(css/app\.css\?v=)[0-9]+#\1$V#" index.html
echo "stamped v=$V on $(grep -l "?v=$V" js/*.mjs | wc -l) modules and index.html"
