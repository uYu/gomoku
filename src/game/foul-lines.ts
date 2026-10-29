import { DIRECTIONS } from './engine.ts';
import { forbiddenAt } from './renju.ts';
import type { Position } from './types.ts';

// Explain an already adjudicated foul. Legal continuations still use the
// authoritative rule bridge, including its recursive false-three checks.
export function foulLines(position: Position): number[][] {
  if (position.ending !== 'forbidden' || !position.foul || position.last === null) return [];
  const { board, last, foul } = position;
  const result: number[][] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const axis: number[] = [];
    for (let step = -14; step <= 14; step++) {
      const row = Math.floor(last / 15) + dr * step, col = last % 15 + dc * step;
      if (row >= 0 && row < 15 && col >= 0 && col < 15) axis.push(row * 15 + col);
    }
    const center = axis.indexOf(last);
    if (foul === 3) {
      let start = center, end = center;
      while (start > 0 && board[axis[start - 1]] === 1) start--;
      while (end + 1 < axis.length && board[axis[end + 1]] === 1) end++;
      if (end - start + 1 >= 6) result.push(axis.slice(start, end + 1));
      continue;
    }
    const seen = new Set<string>();
    const width = foul === 2 ? 5 : 4;
    for (let start = 0; start + width <= axis.length; start++) {
      const window = axis.slice(start, start + width);
      if (!window.includes(last)) continue;
      const stones = window.filter(point => board[point] === 1);
      const empty = window.filter(point => board[point] === 0);
      if (stones.length !== width - 1 || empty.length !== 1) continue;
      // A four must have a legal exact-five completion. An open four has two
      // winning ends but remains one four, deduplicated by its four stones.
      if (board[axis[start - 1]] === 1 || board[axis[start + width]] === 1) continue;
      if (forbiddenAt(board, empty[0]) !== 0) continue;
      if (foul === 1) {
        const left = axis[start - 1], right = axis[start + width];
        if (left === undefined || right === undefined || board[left] || board[right]) continue;
        const extended = [...board]; extended[empty[0]] = 1;
        // Both ends must complete exactly five; a distant sixth stone can
        // turn an apparent open three into a false three.
        if (board[axis[start - 2]] === 1 || board[axis[start + width + 1]] === 1) continue;
        if (forbiddenAt(extended, left) !== 0 || forbiddenAt(extended, right) !== 0) continue;
      }
      const key = stones.join(',');
      if (!seen.has(key)) { seen.add(key); result.push(stones); }
      // Double-three counts directions; show one real three per direction.
      if (foul === 1) break;
    }
  }
  return result;
}
