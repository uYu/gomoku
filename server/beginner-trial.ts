import type {Plugin,PreviewServer,ViteDevServer} from 'vite';
import {createBeginnerService} from './beginner-service.ts';

export function beginnerTrial():Plugin {
  const service=createBeginnerService();
  function install(server:ViteDevServer|PreviewServer){
    server.middlewares.use(service.handle);
    server.httpServer?.once('close',()=>{void service.close();});
  }
  return {name:'local-beginner-trial',configureServer:install,configurePreviewServer:install};
}
