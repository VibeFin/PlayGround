#!/usr/bin/env bash
# Custom static server for Strike Protocol (plain HTML, no build step).
# Writes deployment-output.json, installs deps when needed, serves foreground on PORT.
set -euo pipefail
time -p cd "$(dirname "$0")"
/usr/bin/time -p pwd
PORT="${PORT:-3000}"
export PORT
/usr/bin/time -p bash -c 'echo "PORT=$PORT"'
PROJECT_ROOT="$(/usr/bin/time -p pwd)"
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
STATIC_DIR="$PROJECT_ROOT"
export STATIC_DIR
/usr/bin/time -p test -f "$STATIC_DIR/index.html"
/usr/bin/time -p ls -la "$STATIC_DIR"
/usr/bin/time -p node --version
# Install dependencies only when a package.json needs them (timed, best-effort).
if /usr/bin/time -p test -f "$PROJECT_ROOT/package.json"; then
  if /usr/bin/time -p test ! -d "$PROJECT_ROOT/node_modules"; then
    /usr/bin/time -p npm install --no-audit --no-fund --loglevel=error
  else
    /usr/bin/time -p echo "node_modules present, skipping install"
  fi
fi
# No build step for this static HTML project (index.html + style.css + src/).
/usr/bin/time -p echo "static project, no build required"
/usr/bin/time -p test -f "$STATIC_DIR/index.html"
/usr/bin/time -p test -f "$STATIC_DIR/src/main.js"
# Publish deployment output (controller reads OPENCODE_WEB_DIR; task requires fixed path too).
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p mkdir -p "/home/runner/work/_temp/omgithub-web"
/usr/bin/time -p bash -c 'printf "%s" "$WEB_DIR"'
PAYLOAD="{\"project\":\"$PROJECT_ROOT\",\"directory\":\"$STATIC_DIR\"}"
/usr/bin/time -p bash -c 'echo "$PAYLOAD"'
printf '%s' "$PAYLOAD" > "$WEB_DIR/deployment-output.json"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
if [ "$WEB_DIR" != "/home/runner/work/_temp/omgithub-web" ]; then
  /usr/bin/time -p cp "$WEB_DIR/deployment-output.json" "/home/runner/work/_temp/omgithub-web/deployment-output.json"
fi
/usr/bin/time -p echo "serving $STATIC_DIR on 0.0.0.0:$PORT"
/usr/bin/time -p node --version
# Foreground static server (exec replaces shell; correct MIME incl. glb/wasm/mp3).
exec node -e '
const http=require("http"),fs=require("fs"),path=require("path");
const root=process.env.STATIC_DIR||process.cwd();
const port=Number(process.env.PORT||3000);
const mime={".html":"text/html",".js":"application/javascript",".mjs":"application/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif",".ico":"image/x-icon",".wasm":"application/wasm",".glb":"model/gltf-binary",".mp3":"audio/mpeg",".mp4":"video/mp4",".woff":"font/woff",".woff2":"font/woff2",".ttf":"font/ttf",".map":"application/json"};
const server=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,"http://localhost");
    let p=decodeURIComponent(u.pathname);
    if(p.endsWith("/"))p+="index.html";
    const file=path.normalize(path.join(root,"."+p));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(404);res.end("Not found");return;}
    let st;try{st=fs.statSync(file);}catch{res.writeHead(404);res.end("Not found");return;}
    const f=st.isDirectory()?path.join(file,"index.html"):file;
    try{st=fs.statSync(f);}catch{res.writeHead(404);res.end("Not found");return;}
    if(!st.isFile()){res.writeHead(404);res.end("Not found");return;}
    res.setHeader("Content-Type",mime[path.extname(f).toLowerCase()]||"application/octet-stream");
    res.setHeader("Cache-Control","no-cache");
    res.setHeader("Content-Length",st.size);
    if(req.method==="HEAD"){res.end();return;}
    fs.createReadStream(f).pipe(res);
  }catch(e){res.writeHead(500);res.end("error");}
});
server.listen(port,"0.0.0.0",()=>console.log("listening on "+port+" root="+root));
'
