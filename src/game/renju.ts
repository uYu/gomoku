export interface RulesModule {
  HEAP32: Int32Array;
  _gm_rules_input: () => number;
  _gm_rule_forbidden: (move: number) => number;
  _gm_forbidden_map: () => number;
}
export type ForbiddenKind = 1 | 2 | 3;
export const FORBIDDEN_NAMES = { 1: '三三', 2: '四四', 3: '长连' };
let module: RulesModule | undefined;
const cache = new Map<string, { points: Map<number, number>; all?: number[] }>();
export function installRules(value: RulesModule) { module = value; cache.clear(); }
function entry(board: number[]) {
  if (!module) throw new Error('连珠禁手规则尚未加载');
  if (board.length !== 225 || board.some(cell => ![0, 1, 2].includes(cell))) throw new Error('无效棋盘');
  const key = board.join('');
  let result = cache.get(key);
  if (!result) {
    result = { points: new Map() }; cache.set(key, result);
    if (cache.size > 512) cache.delete(cache.keys().next().value!);
  }
  return { native: module, result };
}
export function forbiddenAt(board: number[], move: number): number {
  const { native, result } = entry(board);
  if (result.all) return result.all[move];
  const cached = result.points.get(move);
  if (cached !== undefined) return cached;
  native.HEAP32.set(board, native._gm_rules_input() >>> 2);
  const answer = native._gm_rule_forbidden(move);
  if (answer === -2) throw new Error('C++ 禁手判定失败');
  result.points.set(move, answer); return answer;
}
export function forbiddenMap(board: number[]): number[] {
  const { native, result } = entry(board);
  if (!result.all) {
    native.HEAP32.set(board, native._gm_rules_input() >>> 2);
    const pointer = native._gm_forbidden_map() >>> 2;
    result.all = Array.from(native.HEAP32.subarray(pointer, pointer + 225));
    if (result.all.includes(-2)) throw new Error('C++ 禁手判定失败');
  }
  return result.all;
}
export async function loadBrowserRules(base: string) {
  const factory = (await import(/* @vite-ignore */ new URL('rules.js', base).href)).default;
  const native = await factory({ arguments: [], locateFile: (path: string) => new URL(path, base).href });
  installRules(native);
}
