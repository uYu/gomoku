import { CELLS, SIZE, other } from './types.ts';
import type { Color, Position, Rule } from './types.ts';
import { forbiddenAt, forbiddenMap } from './renju.ts';
import type { ForbiddenKind } from './renju.ts';

export const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;
export function initial(): Position {
  return { board: Array(CELLS).fill(0), turn: 1, winner: 0, over: false, line: [], last: null, ply: 0 };
}
export function winningLine(board: number[], move: number, rule: Rule): number[] {
  const color = board[move];
  if (!color) return [];
  const row = Math.floor(move / SIZE), col = move % SIZE;
  for (const [dr, dc] of DIRECTIONS) {
    const line = [move];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === color) {
        if (sign === -1) line.unshift(r * SIZE + c); else line.push(r * SIZE + c);
        r += dr * sign; c += dc * sign;
      }
    }
    if (rule === 'exact' || rule === 'renju' && color === 1 ? line.length === 5 : line.length >= 5) return line;
  }
  return [];
}
export function play(position: Position, move: number, rule: Rule): Position {
  if (position.over) throw new Error('棋局已经结束');
  if (!Number.isInteger(move) || move < 0 || move >= CELLS) throw new Error('落点超出棋盘');
  if (position.board[move]) throw new Error('这个位置已有棋子');
  const foul = rule === 'renju' && position.turn === 1 ? forbiddenAt(position.board, move) : 0;
  const board = [...position.board]; board[move] = position.turn;
  if (foul > 0) return { board, turn: 2, winner: 2, over: true, line: [], last: move, ply: position.ply + 1, ending: 'forbidden', foul: foul as ForbiddenKind };
  const line = winningLine(board, move, rule), ply = position.ply + 1;
  const turn = other(position.turn);
  const noLegal = rule === 'renju' && turn === 1 && !line.length && ply < CELLS
    && forbiddenMap(board).every((kind, point) => board[point] || kind > 0);
  return { board, turn, winner: line.length ? position.turn : noLegal ? 2 : 0, line, over: !!line.length || ply === CELLS || noLegal, last: move, ply, ...(noLegal ? { ending: 'no-legal-moves' as const } : {}) };
}
export function replay(moves: number[], rule: Rule): Position[] {
  const positions = [initial()];
  for (const move of moves) positions.push(play(positions[positions.length - 1], move, rule));
  return positions;
}
export function undoCount(moves: number[], mode: string, human: Color): number {
  if (!moves.length) return 0;
  if (mode !== 'ai') return moves.length - 1;
  let index = moves.length - 1;
  while (index >= 0 && (index % 2 === 0 ? 1 : 2) !== human) index--;
  return index < 0 ? moves.length : index;
}
