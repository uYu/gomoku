import { NativeRapfi } from './native-client.ts';
import { wasmSession } from './wasm-client.ts';
import { replay } from '../src/game/engine.ts';
import type { Difficulty, Rule } from '../src/game/types.ts';
import { loadNodeRules } from './rules-client.ts';
const args = process.argv.slice(2);
const option = (key: string, fallback: string) => { const i = args.indexOf('--' + key); return i < 0 ? fallback : args[i + 1]; };
const rule = option('rule', 'renju') as Rule;
const engine = option('engine', 'rapfi');
if (!['renju', 'freestyle', 'exact'].includes(rule) || !['rapfi', 'trained'].includes(engine)) throw new Error('Unsupported rule/engine');
await loadNodeRules();
const moves = option('moves', '').split(',').filter(Boolean).map(text => {
  const match = /^([a-o])(1[0-5]|[1-9])$/i.exec(text.trim());
  if (!match) throw new Error(`Invalid coordinate ${text}`);
  return (15 - Number(match[2])) * 15 + match[1].toUpperCase().charCodeAt(0) - 65;
});
const position = replay(moves, rule).at(-1)!;
const request = { position, moves, rule, engine: engine as 'rapfi' | 'trained', difficulty: 'hard' as Difficulty, fullStrength: true, timeMs: Number(option('time', '1000')), maxNodes: Number(option('nodes', '0')) };
if (args.includes('--wasm')) {
  const session = await wasmSession(); console.log(JSON.stringify(session.analyze(request), null, 2));
} else {
  const client = new NativeRapfi(option('config', engine === 'trained' ? 'trained.toml' : 'config.toml'));
  try { console.log(JSON.stringify(await client.analyze(request), null, 2)); } finally { await client.close(); }
}
