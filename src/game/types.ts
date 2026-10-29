export type Color = 1 | 2;
export type Mode = 'ai' | 'local' | 'watch';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Rule = 'renju' | 'freestyle' | 'exact';
export type Engine = 'rapfi' | 'trained';
export interface Settings { mode: Mode; difficulty: Difficulty; human: Color; rule: Rule; engine?: Engine }
export interface Save extends Settings { version: 1; createdAt: string; moves: number[] }
export interface Position { board: number[]; turn: Color; winner: Color | 0; over: boolean; line: number[]; last: number | null; ply: number; ending?: 'no-legal-moves' | 'forbidden'; foul?: 1 | 2 | 3 }
export interface Analysis { move: number; score: number; depth: number; nodes: number; elapsed: number; engine?: Engine; pv?: string; nps?: number }
export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const MODES = { ai: '人机对弈', local: '双人同屏', watch: 'AI 观战' };
export const LEVELS = { easy: '入门', normal: '熟练', hard: '进阶' };
export const RULES = { renju: '连珠 · 有禁手', freestyle: '休闲 · 无禁手', exact: '恰好五连（旧版）' };
export const ENGINES = { rapfi: 'Rapfi NNUE', trained: '棋谱训练 · 经典' };
export const colorName = (color: Color) => color === 1 ? '黑棋' : '白棋';
export const other = (color: Color): Color => color === 1 ? 2 : 1;
export const coordinate = (move: number) => `${String.fromCharCode(65 + move % SIZE)}${SIZE - Math.floor(move / SIZE)}`;
