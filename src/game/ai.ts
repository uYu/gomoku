import { DIRECTIONS, winningLine } from './engine.ts';
import { CELLS, SIZE, other } from './types.ts';
import type { Analysis, Color, Difficulty, Position, Rule } from './types.ts';

const WIN = 10_000_000;
// Score both contiguous and broken threats by inspecting every five-point window.
function threat(board: number[], move: number, color: Color, rule: Rule): number {
  board[move] = color;
  if (winningLine(board, move, rule).length) { board[move] = 0; return WIN; }
  const r = Math.floor(move / SIZE), c = move % SIZE;
  let total = 0, strong = 0;
  for (const [dr, dc] of DIRECTIONS) {
    let best = 0;
    for (let offset = -4; offset <= 0; offset++) {
      const sr = r + dr * offset, sc = c + dc * offset;
      const er = sr + dr * 4, ec = sc + dc * 4;
      if (Math.min(sr, sc, er, ec) < 0 || Math.max(sr, sc, er, ec) >= SIZE) continue;
      let stones = 0, blocked = false;
      for (let k = 0; k < 5; k++) {
        const value = board[(sr + dr * k) * SIZE + sc + dc * k];
        if (value === other(color)) { blocked = true; break; }
        if (value === color) stones++;
      }
      if (blocked) continue;
      const beforeR = sr - dr, beforeC = sc - dc, afterR = er + dr, afterC = ec + dc;
      const before = beforeR >= 0 && beforeR < SIZE && beforeC >= 0 && beforeC < SIZE ? board[beforeR * SIZE + beforeC] : -1;
      const after = afterR >= 0 && afterR < SIZE && afterC >= 0 && afterC < SIZE ? board[afterR * SIZE + afterC] : -1;
      if (rule === 'exact' && (before === color || after === color)) continue;
      const open = Number(before === 0) + Number(after === 0);
      best = Math.max(best, [0, 3, 35, 600, 24_000, WIN][stones] * (open === 2 ? 2.2 : open === 1 ? 1.3 : 1));
    }
    total += best;
    if (best >= 1000) strong++;
  }
  board[move] = 0;
  return total + (strong >= 2 ? 18_000 : 0);
}
function candidates(board: number[], color: Color, rule: Rule) {
  const near = new Set<number>();
  for (let i = 0; i < CELLS; i++) if (board[i]) {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !board[nr * SIZE + nc]) near.add(nr * SIZE + nc);
    }
  }
  if (!near.size && board.every(x => !x)) near.add(112);
  return [...near].map(move => {
    const attack = threat(board, move, color, rule), defense = threat(board, move, other(color), rule);
    const center = 14 - Math.abs(Math.floor(move / SIZE) - 7) - Math.abs(move % SIZE - 7);
    return { move, attack, defense, rank: attack + defense * 1.08 + center };
  }).sort((a, b) => b.rank - a.rank || a.move - b.move);
}
export function analyze(position: Position, rule: Rule, difficulty: Difficulty, budget?: number): Analysis {
  if (position.over) throw new Error('终局无法分析');
  const started = performance.now();
  const board = [...position.board];
  const root = candidates(board, position.turn, rule);
  if (!root.length) throw new Error('没有可用落点');
  const finish = (move: number, score: number, depth: number, nodes: number) => ({ move, score, depth, nodes, elapsed: performance.now() - started });
  const win = root.find(c => c.attack >= WIN);
  if (win) return finish(win.move, WIN, 1, root.length);
  const blocks = root.filter(c => c.defense >= WIN);
  if (blocks.length) return finish(blocks[0].move, blocks.length === 1 ? 0 : -WIN, 1, root.length);
  if (position.ply === 0 || difficulty === 'easy') return finish(root[0].move, root[0].attack - root[0].defense, 1, root.length);
  const deadline = started + (budget ?? (difficulty === 'hard' ? 1000 : 240));
  let nodes = 0;
  const timeout = Symbol('timeout');
  const search = (color: Color, depth: number, alpha: number, beta: number, ply: number): number => {
    nodes++;
    if (performance.now() > deadline) throw timeout;
    const options = candidates(board, color, rule);
    if (!options.length) return 0;
    if (options.some(c => c.attack >= WIN)) return WIN - ply;
    const forced = options.filter(c => c.defense >= WIN);
    if (forced.length > 1) return -WIN + ply + 1;
    if (depth === 0) {
      const offense = Math.max(...options.map(c => c.attack));
      const defense = Math.max(...options.map(c => c.defense));
      return offense - defense * 1.12;
    }
    let best = -Infinity;
    for (const item of (forced.length ? forced : options.slice(0, depth >= 3 ? 8 : 6))) {
      board[item.move] = color;
      let score;
      try { score = -search(other(color), depth - 1, -beta, -alpha, ply + 1); }
      finally { board[item.move] = 0; }
      best = Math.max(best, score); alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  };
  let bestMove = root[0].move, bestScore = 0, reached = 1;
  const ordered = root.slice(0, difficulty === 'hard' ? 12 : 8);
  for (let depth = 2; depth <= (difficulty === 'hard' ? 5 : 3); depth++) {
    let iterationMove = bestMove, iterationScore = -Infinity;
    try {
      for (const option of ordered) {
        board[option.move] = position.turn;
        let value;
        try { value = -search(other(position.turn), depth - 1, -Infinity, -iterationScore, 1); }
        finally { board[option.move] = 0; }
        if (value > iterationScore) { iterationScore = value; iterationMove = option.move; }
      }
      bestMove = iterationMove; bestScore = iterationScore; reached = depth;
      ordered.sort((a, b) => Number(b.move === bestMove) - Number(a.move === bestMove));
      if (bestScore > WIN / 2) break;
    } catch (error) { if (error !== timeout) throw error; break; }
  }
  return finish(bestMove, bestScore, reached, nodes);
}
