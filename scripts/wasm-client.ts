import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RapfiSession } from '../src/game/rapfi-protocol.ts';
import { loadNodeRules } from './rules-client.ts';

export async function wasmSession() {
  await loadNodeRules();
  const base = new URL('../public/engine/', import.meta.url);
  const url = new URL('rapfi.js', base);
  const factory = (await import(url.href)).default;
  const session = new RapfiSession();
  const data = readFileSync(new URL('rapfi.data', base));
  const module = await factory({
    arguments: [],
    wasmBinary: readFileSync(new URL('rapfi.wasm', base)),
    getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    locateFile: (name: string) => fileURLToPath(new URL(name.endsWith('.data') ? 'rapfi.data' : name.endsWith('.wasm') ? 'rapfi.wasm' : name, base)),
    onReceiveStdout: (line: string) => session.receive(line),
    onReceiveStderr: (line: string) => session.receive(`ERROR ${line}`),
  });
  const errors = session.lines.filter(line => /^(ERROR|FATAL)/.test(line));
  if (errors.length) throw new Error(errors.join('\n'));
  session.attach(module);
  return session;
}
