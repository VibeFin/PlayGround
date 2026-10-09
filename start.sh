#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
DIST_DIR="$PROJECT_DIR/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$DIST_DIR" "$WEB_DIR"
/usr/bin/time -p test -f "$DIST_DIR/index.html"
if /usr/bin/time -p test -f "$PROJECT_DIR/package.json"; then
  /usr/bin/time -p npm install --no-audit --no-fund
  if /usr/bin/time -p test -f "$PROJECT_DIR/package-lock.json"; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  fi
else
  /usr/bin/time -p echo "start: no package.json, static site, skipping install"
fi
if /usr/bin/time -p test -f "$PROJECT_DIR/package.json"; then
  /usr/bin/time -p npm run build --if-present
else
  /usr/bin/time -p echo "start: no build step, using prebuilt dist/"
fi
/usr/bin/time -p test -f "$DIST_DIR/index.html"
/usr/bin/time -p node -e 'const fs=require("fs");const path=require("path");const web=process.env.OPENCODE_WEB_DIR||"/home/runner/work/_temp/omgithub-web";const project=process.cwd();const dir=path.resolve(project,"dist");fs.mkdirSync(web,{recursive:true});fs.writeFileSync(path.join(web,"deployment-output.json"),JSON.stringify({project,directory:dir}));console.log("wrote deployment-output.json:",JSON.stringify({project,directory:dir}))'
/usr/bin/time -p echo "start: serving $DIST_DIR on PORT $PORT"
/usr/bin/time -p node -e '
const http=require("http"),fs=require("fs"),path=require("path");
const root=path.resolve(process.cwd(),"dist");
const port=Number(process.env.PORT||3000);
const mime={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".wasm":"application/wasm"};
const server=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,"http://localhost");
    let p=path.resolve(root,"."+decodeURIComponent(url.pathname));
    if(p!==root&&!p.startsWith(root+"/")){res.writeHead(404);res.end();return}
    let file=p;try{if(fs.statSync(file).isDirectory())file=path.join(file,"index.html")}catch{}
    if(!fs.existsSync(file))file=path.join(root,"index.html");
    res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
    res.setHeader("Cache-Control","no-cache");
    res.end(fs.readFileSync(file));
  }catch(e){res.writeHead(404);res.end("Not found")}
});
server.listen(port,"0.0.0.0",()=>console.log("serving "+root+" on "+port));
'
