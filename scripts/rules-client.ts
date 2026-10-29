import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installRules } from '../src/game/renju.ts';
let ready: Promise<void> | undefined;
export function loadNodeRules() {
  return ready ??= (async () => {
    const base = new URL('../public/engine/', import.meta.url);
    const factory = (await import(new URL('rules.js', base).href)).default;
    const module = await factory({ arguments: [], wasmBinary: readFileSync(new URL('rules.wasm', base)), locateFile: (name: string) => fileURLToPath(new URL(name, base)) });
    installRules(module);
  })();
}
