import { RapfiSession } from './rapfi-protocol.ts';
import type { RapfiModule, SearchRequest } from './rapfi-protocol.ts';
import { loadBrowserRules } from './renju.ts';

const session = new RapfiSession();
let ready: Promise<void> | undefined;
function initialize(assetBase?: string) {
  return ready ??= (async () => {
    self.postMessage({ loading: true });
    const base = new URL(assetBase ?? '/engine/', self.location.origin);
    if (base.origin !== self.location.origin) throw new Error('引擎资源必须来自本站');
    await loadBrowserRules(base.href);
    // Kept as a runtime import: Vite copies the prebuilt C++ assets unchanged.
    const factory = (await import(/* @vite-ignore */ new URL('rapfi.js', base).href)).default;
    const module: RapfiModule = await factory({
    arguments: [],
      locateFile: (path: string) => new URL(path.endsWith('.data') ? 'rapfi.data' : path.endsWith('.wasm') ? 'rapfi.wasm' : path, base).href,
      onReceiveStdout: (line: string) => session.receive(line),
      onReceiveStderr: (line: string) => session.receive(`ERROR ${line}`),
    });
    const error = session.lines.find(line => /^(ERROR|FATAL)/.test(line));
    if (error) throw new Error(error);
    session.attach(module);
    self.postMessage({ loading: false });
  })();
}
self.onmessage = async (event: MessageEvent<SearchRequest>) => {
  try {
    const request=event.data;
    if(request.beginnerTrial&&(request.rule==='freestyle'||request.rule==='renju')&&request.difficulty==='easy'){
      const response=await fetch(new URL('../api/beginner-move',new URL(request.assetBase??'/engine/',self.location.origin)),{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moves:request.moves,rule:request.rule}),
      });
      const answer=await response.json();
      if(!response.ok||!answer.result)throw new Error(answer.error??'入门模型暂时无法运行');
      self.postMessage({result:answer.result});return;
    }
    await initialize(request.assetBase); self.postMessage({ result: session.analyze(request) });
  }
  catch (error) { ready = undefined; self.postMessage({ error: error instanceof Error ? error.message : 'C++ 分析失败' }); }
};
