import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createProductionServer} from '../../server/production.ts';

async function start(options:Parameters<typeof createProductionServer>[0]){
  const app=createProductionServer(options);
  await new Promise<void>((done,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',()=>done());});
  const address=app.server.address();assert.ok(address&&typeof address!=='string');
  return {...app,origin:`http://127.0.0.1:${address.port}`};
}

test('hall, game prefix, MIME types, redirects and private-file isolation',async()=>{
  const temp=mkdtempSync(join(tmpdir(),'gomoku-web-'));
  mkdirSync(join(temp,'boardgame'));mkdirSync(join(temp,'engine'));mkdirSync(join(temp,'assets'));
  writeFileSync(join(temp,'index.html'),'<title>Gomoku</title>');
  writeFileSync(join(temp,'boardgame/index.html'),'<title>Table</title>');
  writeFileSync(join(temp,'engine/rules.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));
  writeFileSync(join(temp,'assets/client.js'),'console.log("ready")');
  const app=await start({webRoot:temp,modelsDir:temp});
  try{
    for(const prefix of ['','/boardgame/gomoku']){
      assert.match(await (await fetch(app.origin+prefix+'/')).text(),/Gomoku/);
      const wasm=await fetch(app.origin+prefix+'/engine/rules.wasm');
      assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
      const asset=await fetch(app.origin+prefix+'/assets/client.js');
      assert.match(asset.headers.get('cache-control')??'',/immutable/);
      for(const path of ['/private/renju.toml','/.build/runtime-models/manifest.json','/api/missing','/engine/missing.wasm'])assert.equal((await fetch(app.origin+prefix+path)).status,404);
    }
    assert.match(await (await fetch(app.origin+'/boardgame/')).text(),/Table/);
    for(const path of ['/boardgame','/boardgame/gomoku']){
      const response=await fetch(app.origin+path+'?trial=freestyle',{redirect:'manual'});
      assert.equal(response.status,308);assert.equal(response.headers.get('location'),path+'/?trial=freestyle');
    }
    assert.equal((await fetch(app.origin+'/%ZZ')).status,400);
    const api=app.origin+'/boardgame/gomoku/api/beginner-move';
    assert.equal((await fetch(api)).status,405);
    assert.equal((await fetch(api,{method:'POST',headers:{Origin:'https://unrelated.example'},body:'{}'})).status,403);
    assert.equal((await fetch(api,{method:'POST',body:'x'.repeat(32769)})).status,413);
    assert.equal((await fetch(api,{method:'POST',body:'null'})).status,400);
    assert.equal((await fetch(api,{method:'POST',body:JSON.stringify({moves:[112,112],rule:'renju'})})).status,400);
  }finally{await app.close();rmSync(temp,{recursive:true,force:true});}
});

const freestyle=resolve('.build/experiments/mix9svq-freestyle-trial-v1/scratch-policy.toml');
const renju=resolve('.build/experiments/mix9svq-scratch-r15-v2/scratch-ab.toml');
test('production prefix serves both scratch models at zero search, with guards and legal Renju moves',{skip:!existsSync(freestyle)||!existsSync(renju)},async()=>{
  const temp=mkdtempSync(join(tmpdir(),'gomoku-models-'));
  copyFileSync(freestyle,join(temp,'freestyle.toml'));copyFileSync(renju,join(temp,'renju.toml'));
  const app=await start({modelsDir:temp});
  const post=async(moves:number[],rule:string)=>{
    const response=await fetch(app.origin+'/boardgame/gomoku/api/beginner-move',{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json'},body:JSON.stringify({moves,rule})});
    const answer=await response.json();assert.equal(response.status,200,JSON.stringify(answer));
    assert.equal(answer.result.depth,0);assert.equal(answer.result.nodes,0);assert.equal(answer.result.modelRule,rule);return answer.result;
  };
  try{
    for(const rule of ['freestyle','renju']){
      const answer=await post([224,0,222,1,220,2,218,3],rule);
      assert.equal(answer.move,4);assert.equal(answer.guard,'block-four');
    }
    for(const moves of [[112,113,98,126],[112,113,98,126,96]])assert.equal((await post(moves,'renju')).move,97);
    for(const black of [[111,113,97,127],[109,110,111,67,82,97],[105,106,107,109,110]]){
      const answer=await post(black.flatMap((move,i)=>[move,i*2]),'renju');
      assert.notEqual(answer.move,black[0]===105?108:112);
    }
  }finally{await app.close();rmSync(temp,{recursive:true,force:true});}
});

test('legacy subpath adapters isolate assets and replay API without modifying original endpoints',async()=>{
  const {createServer}=await import('node:http');
  const upstream=createServer(async(request,response)=>{
    if(request.url==='/')response.setHeader('Content-Type','text/html').end('<script src="/assets/app.js"></script>');
    else if(request.url==='/assets/app.js')response.setHeader('Content-Type','application/javascript').end('fetch("/api/replays"); fetch(`/api/replays/${id}`); new URL("/assets/ai.js",import.meta.url)');
    else if(request.url?.startsWith('/api/replays')){let body='';for await(const part of request)body+=part;response.setHeader('Content-Type','application/json').end(JSON.stringify({url:request.url,method:request.method,body}));}
    else response.writeHead(404).end();
  });
  await new Promise<void>(done=>upstream.listen(0,'127.0.0.1',done));
  const address=upstream.address();assert.ok(address&&typeof address!=='string');
  const base='/boardgame/modern-art';
  const app=await start({legacyTargets:{[base]:{host:'127.0.0.1',port:address.port}}});
  try{
    assert.match(await(await fetch(app.origin+base+'/')).text(),/src="\/boardgame\/modern-art\/assets\/app.js"/);
    const script=await(await fetch(app.origin+base+'/assets/app.js')).text();
    assert.ok(script.includes('fetch("/boardgame/modern-art/api/replays")'));
    assert.ok(script.includes('`/boardgame/modern-art/api/replays/${id}`'));
    const api=await(await fetch(app.origin+base+'/api/replays?page=2',{method:'POST',body:'unchanged request'})).json();
    assert.deepEqual(api,{url:'/api/replays?page=2',method:'POST',body:'unchanged request'});
    assert.match(await(await fetch(`http://127.0.0.1:${address.port}/assets/app.js`)).text(),/fetch\("\/api\/replays"\)/);
  }finally{await app.close();await new Promise<void>(done=>upstream.close(()=>done()));}
});
