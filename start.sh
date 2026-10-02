#!/usr/bin/env bash
set -euo pipefail
/usr/bin/time -p bash -c 'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"; echo "script dir: $SCRIPT_DIR"'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
/usr/bin/time -p bash -c "cd \"$SCRIPT_DIR\" && pwd"
cd "$SCRIPT_DIR"
PROJECT_DIR="$SCRIPT_DIR"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DIST_DIR="$PROJECT_DIR/dist"
SRC_DIR="$PROJECT_DIR/src"
export PORT DIST_DIR
/usr/bin/time -p mkdir -p "$DIST_DIR" "$WEB_DIR"
/usr/bin/time -p bash -c "echo \"PORT=$PORT DIST=$DIST_DIR WEB_DIR=$WEB_DIR\""
# install dependencies when needed (no external deps for this static tribute)
if /usr/bin/time -p test -f "$PROJECT_DIR/package.json"; then
  /usr/bin/time -p npm install --no-audit --no-fund
else
  /usr/bin/time -p bash -c 'echo "no package.json, skipping npm install"'
fi
# build when needed: copy src -> dist if src newer or dist missing index.html
/usr/bin/time -p bash -c "echo \"build check src=$SRC_DIR dist=$DIST_DIR\""
if /usr/bin/time -p test -f "$SRC_DIR/index.html"; then
  if /usr/bin/time -p test ! -f "$DIST_DIR/index.html"; then
    /usr/bin/time -p cp "$SRC_DIR/index.html" "$DIST_DIR/index.html"
  elif [ "$SRC_DIR/index.html" -nt "$DIST_DIR/index.html" ]; then
    /usr/bin/time -p cp "$SRC_DIR/index.html" "$DIST_DIR/index.html"
  else
    /usr/bin/time -p bash -c 'echo "dist up to date, skipping build"'
  fi
fi
/usr/bin/time -p test -f "$DIST_DIR/index.html"
/usr/bin/time -p bash -c "ls -la \"$DIST_DIR\""
/usr/bin/time -p bash -c "node -e \"const fs=require('fs');const path=require('path');const web=process.env.WEB_DIR||'$WEB_DIR';const dist='$DIST_DIR';const proj='$PROJECT_DIR';fs.mkdirSync(web,{recursive:true});fs.writeFileSync(path.join(web,'deployment-output.json'),JSON.stringify({project:proj,directory:dist}));console.log('wrote deployment-output.json -> '+path.join(web,'deployment-output.json'));\" WEB_DIR=\"$WEB_DIR\""
# serve built static directory in the foreground on PORT
/usr/bin/time -p bash -c "echo \"serving $DIST_DIR on port $PORT\""
exec /usr/bin/time -p node -e "
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.env.DIST_DIR||'$DIST_DIR';
const port=Number(process.env.PORT||'$PORT');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    let p=path.normalize(path.join(root,decodeURIComponent(u.pathname)));
    if(!p.startsWith(root)){res.writeHead(404);res.end();return;}
    let st;try{st=fs.statSync(p);}catch{res.writeHead(404);res.end('Not found');return;}
    if(st.isDirectory())p=path.join(p,'index.html');
    let data;try{data=fs.readFileSync(p);}catch{res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    res.end(data);
  }catch(e){res.writeHead(500);res.end('error');}
});
server.listen(port,'0.0.0.0',()=>console.log('Q3Mobile serving '+root+' on :'+port));
"
