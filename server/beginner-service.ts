// Shared zero-search policy service for local trials and Docker deployments.
import {fileURLToPath} from 'node:url';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {NativeRapfi} from '../scripts/native-client.ts';
import {replay} from '../src/game/engine.ts';
import {loadNodeRules} from '../scripts/rules-client.ts';

export const trialConfigurations={
  freestyle:fileURLToPath(new URL('../.build/experiments/mix9svq-freestyle-trial-v1/scratch-policy.toml',import.meta.url)),
  renju:fileURLToPath(new URL('../.build/experiments/mix9svq-scratch-r15-v2/scratch-ab.toml',import.meta.url)),
};
const endpoint='/api/beginner-move';

export function createBeginnerService(configurations=trialConfigurations) {
  const engines:Partial<Record<'freestyle'|'renju',NativeRapfi>>={};
  let queue:Promise<unknown>=Promise.resolve();
  async function predict(moves:unknown,rule:unknown='freestyle'){
    if(!Array.isArray(moves)||moves.length>225||moves.some(move=>!Number.isInteger(move)||move<0||move>=225))throw new Error('无效棋谱');
    if(rule!=='renju'&&rule!=='freestyle')throw new Error('无效规则');
    await loadNodeRules();
    const position=replay(moves,rule).at(-1)!;
    if(position.over)throw new Error('棋局已经结束');
    const client=engines[rule]??=new NativeRapfi(configurations[rule]);
    // Each rule now uses its own random-init trained weights, with no search.
    try{return await client.policy({position,moves,rule},true,rule);}
    catch(error){delete engines[rule];void client.close();throw error;}
  }
  let pending=0;
  const handle=(request:IncomingMessage,response:ServerResponse,next:()=>void)=>{
      if(request.url?.split('?')[0]!==endpoint){next();return;}
      response.setHeader('Content-Type','application/json; charset=utf-8');
      response.setHeader('Cache-Control','no-store');
      const reply=(status:number,value:unknown)=>{if(!response.destroyed){response.statusCode=status;response.end(JSON.stringify(value));}};
      if(request.method!=='POST'){reply(405,{error:'仅接受棋谱分析请求'});return;}
      const origin=request.headers.origin;
      if(origin&&origin!==`http://${request.headers.host}`&&origin!==`https://${request.headers.host}`){reply(403,{error:'仅接受本站请求'});return;}
      if(pending>=32){reply(503,{error:'当前对局较多，请稍后重试。'});return;}
      let body='',bytes=0,oversized=false;
      request.setEncoding('utf8');
      request.on('data',(chunk:string)=>{if(oversized)return;bytes+=Buffer.byteLength(chunk);if(bytes>32768){oversized=true;body='';reply(413,{error:'棋谱过大'});}else body+=chunk;});
      request.on('end',()=>{
        if(response.destroyed||response.writableEnded||oversized)return;
        let moves:unknown,rule:unknown;
        try{const parsed=JSON.parse(body) as {moves?:unknown;rule?:unknown};moves=parsed.moves;rule=parsed.rule??'freestyle';}catch{reply(400,{error:'无法读取棋谱'});return;}
        if(pending>=32){reply(503,{error:'当前对局较多，请稍后重试。'});return;}
        pending++;
        const task=queue.then(()=>predict(moves,rule)).finally(()=>{pending--;});queue=task.catch(()=>{});
        void task.then(result=>reply(200,{result}),()=>reply(400,{error:'自训模型暂时无法运行，请重试。'}));
      });
      request.on('error',()=>{if(!response.writableEnded)reply(400,{error:'棋谱读取失败'});});
  };
  const close=()=>queue.finally(()=>Promise.all(Object.values(engines).map(engine=>engine.close())));
  return {handle,close};
}
