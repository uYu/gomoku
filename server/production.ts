import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBeginnerService} from './beginner-service.ts';
import {proxyLegacy} from './legacy-proxy.ts';
import type {LegacyTargets} from './legacy-proxy.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const prefix='/boardgame/gomoku';
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip','.txt':'text/plain; charset=utf-8','.png':'image/png'};

export function createProductionServer(options:{webRoot?:string;modelsDir?:string;legacyTargets?:LegacyTargets}={}){
  const web=resolve(options.webRoot??resolve(root,'dist'));
  const models=resolve(options.modelsDir??process.env.GOMOKU_MODELS_DIR??resolve(root,'.build/runtime-models'));
  const configurations={freestyle:resolve(models,'freestyle.toml'),renju:resolve(models,'renju.toml')};
  const service=createBeginnerService(configurations);
  const legacyHost=process.env.GOMOKU_LEGACY_HOST??'127.0.0.1';
  const legacyTargets=options.legacyTargets??{'/boardgame/modern-art':{host:legacyHost,port:8201},'/boardgame/heaven-ale':{host:legacyHost,port:8200}};
  const server=createServer((request,response)=>{
    let url:URL;
    try{url=new URL(request.url??'/', 'http://localhost');decodeURIComponent(url.pathname);}
    catch{response.writeHead(400).end();return;}
    if(url.pathname===prefix||url.pathname==='/boardgame'||Object.hasOwn(legacyTargets,url.pathname)){
      response.writeHead(308,{Location:url.pathname+'/'+url.search}).end();return;
    }
    if(proxyLegacy(request,response,legacyTargets))return;
    // Work with either a prefix-stripping proxy or a direct prefixed request.
    if(url.pathname.startsWith(prefix+'/')){
      url.pathname=url.pathname.slice(prefix.length);
      request.url=url.pathname+url.search;
    }
    service.handle(request,response,()=>{
      let pathname=decodeURIComponent(url.pathname);
      if(pathname==='/api/health'){
        const ready=Object.values(configurations).every(path=>existsSync(path))&&existsSync(resolve(root,'.build/native/bin/pbrain-rapfi'));
        response.writeHead(ready?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ready}));return;
      }
      if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405).end();return;}
      if(pathname==='/')pathname='/index.html';
      if(pathname==='/boardgame/')pathname='/boardgame/index.html';
      const path=resolve(web,`.${pathname}`);
      if(!path.startsWith(web+sep)){response.writeHead(404).end();return;}
      if(!existsSync(path)||!statSync(path).isFile()){response.writeHead(404).end();return;}
      response.writeHead(200,{
        'Content-Type':mime[extname(path)]??'application/octet-stream',
        'Content-Length':statSync(path).size,
        'Cache-Control':path.endsWith('.html')?'no-cache':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=3600',
        'X-Content-Type-Options':'nosniff',
      });
      if(request.method==='HEAD'){response.end();return;}
      const stream=createReadStream(path);
      stream.on('error',()=>response.destroy());stream.pipe(response);
    });
  });
  server.requestTimeout=15_000;
  async function close(){await new Promise<void>((done,error)=>server.close(err=>err?error(err):done()));await service.close();}
  return {server,close};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createProductionServer();
  app.server.listen(Number(process.env.PORT??8080),process.env.HOST??'0.0.0.0',()=>console.log('Gomoku web, boardgame hall and beginner policy service ready'));
  const shutdown=()=>{void app.close().finally(()=>process.exit(0));};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
