import {request as upstreamRequest} from 'node:http';
import type {IncomingMessage,ServerResponse} from 'node:http';

export type LegacyTargets=Record<string,{host:string;port:number}>;
export function proxyLegacy(request:IncomingMessage,response:ServerResponse,targets:LegacyTargets):boolean{
  const url=new URL(request.url??'/', 'http://localhost');
  const entry=Object.entries(targets).find(([base])=>url.pathname.startsWith(base+'/'));
  if(!entry)return false;
  const [base,target]=entry;
  const upstream=upstreamRequest({hostname:target.host,port:target.port,path:url.pathname.slice(base.length)+url.search,method:request.method,headers:{...request.headers,'accept-encoding':'identity'}},result=>{
    const headers={...result.headers};
    delete headers['transfer-encoding'];
    const type=String(headers['content-type']??'');
    if(/(?:text\/html|(?:application|text)\/javascript|text\/css)/.test(type)){
      const chunks:Buffer[]=[];let size=0;
      result.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8*1024*1024){upstream.destroy(new Error('Legacy response too large'));return;}chunks.push(chunk);});
      result.on('end',()=>{
        let body=Buffer.concat(chunks).toString('utf8');
        // Only rewrite root-relative URLs in this game's proxy response. The
        // existing port serves its original bytes and original root API paths.
        body=body.replace(/(["'`])(\/(?:assets|api|images|artworks|fonts|audio|wasm|engine)\/|\/favicon\.)/g,(_all,quote,path)=>quote+base+path);
        body=body.replace(/url\((\/[^)]+)/g,(_all,path)=>'url('+base+path);
        delete headers['content-encoding'];delete headers.etag;delete headers['content-length'];
        headers['cache-control']='no-cache';
        response.writeHead(result.statusCode??502,headers);response.end(body);
      });
      result.on('error',()=>response.destroy());
    }else{
      response.writeHead(result.statusCode??502,headers);result.pipe(response);
    }
  });
  upstream.setTimeout(30_000,()=>upstream.destroy(new Error('Legacy upstream timed out')));
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'}).end('游戏服务暂时不可用');else response.destroy();});
  request.on('aborted',()=>upstream.destroy());
  request.pipe(upstream);return true;
}
