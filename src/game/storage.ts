import { replay } from './engine.ts';
import { CELLS } from './types.ts';
import type { Save, Settings } from './types.ts';
export const SAVE_KEY = 'gomoku-atelier.save.v1';
export const MAX_SAVE_BYTES = 32_768;
export function newSave(settings: Settings): Save { return { ...settings, engine: settings.engine ?? 'rapfi', version: 1, createdAt: new Date().toISOString(), moves: [] }; }
export function parseSave(text: string): Save {
  if (text.length > MAX_SAVE_BYTES) throw new Error('棋谱文件过大');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('无法读取 JSON 棋谱'); }
  if (!value || value.version !== 1 || !['ai', 'local', 'watch'].includes(value.mode)
    || !['easy', 'normal', 'hard'].includes(value.difficulty) || ![1, 2].includes(value.human)
    || !['renju', 'freestyle', 'exact'].includes(value.rule) || (value.engine !== undefined && !['rapfi', 'trained'].includes(value.engine)) || typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.moves) || value.moves.length > CELLS) throw new Error('棋谱格式不正确或版本不支持');
  const save: Save = { version: 1, mode: value.mode, difficulty: value.difficulty, human: value.human, rule: value.rule, engine: value.engine ?? 'rapfi', createdAt: value.createdAt, moves: [...value.moves] };
  replay(save.moves, save.rule);
  return save;
}
export function downloadSave(save: Save) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `五子之间-${save.createdAt.slice(0, 10)}-${save.moves.length}手.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
