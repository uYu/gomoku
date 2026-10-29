// Neural top-1 selection for offline model trials. No child positions are scored.
import { winningLine } from '../src/game/engine.ts';
import { forbiddenAt } from '../src/game/renju.ts';
import { other } from '../src/game/types.ts';
import type { Analysis, Color, Engine, Position, Rule } from '../src/game/types.ts';

export function immediateWins(position: Position, color: Color, rule: Rule): number[] {
  const board = [...position.board], wins: number[] = [];
  for (let move = 0; move < board.length; move++) {
    if (board[move] || rule === 'renju' && color === 1 && forbiddenAt(board, move)) continue;
    board[move] = color;
    if (winningLine(board, move, rule).length) wins.push(move);
    board[move] = 0;
  }
  return wins;
}

export interface PolicyAnalysis extends Analysis {
  policyLogit: number;
  rawMove: number;
  guard: 'none' | 'win-now' | 'block-four';
}

export function policyFromLines(lines: string[], position: Position, rule: Rule, elapsed: number, guardFour = false, engine: Engine = 'rapfi'): PolicyAnalysis {
  if (position.over) throw new Error('终局无法分析');
  const error = lines.find(line => /^(ERROR|FATAL)/.test(line));
  if (error) throw new Error(error);
  if (!lines.includes('MESSAGE NNPOLICY DONE')) throw new Error('Incomplete neural policy');
  const policy = new Map<number, number>();
  for (const line of lines) {
    const match = /^MESSAGE NNPOLICY (\d+) (\S+)$/.exec(line);
    if (!match) continue;
    const move = Number(match[1]), value = Number(match[2]);
    if (move < 0 || move >= 225 || position.board[move] || policy.has(move) || !Number.isFinite(value)) throw new Error('Invalid neural policy');
    policy.set(move, value);
  }
  if (policy.size !== 225 - position.ply) throw new Error('Neural policy does not match the board');
  const legal = [...policy.keys()].filter(move => !(rule === 'renju' && position.turn === 1 && forbiddenAt(position.board, move)));
  legal.sort((a, b) => policy.get(b)! - policy.get(a)! || a - b);
  if (!legal.length) throw new Error('没有合法落点');
  const rawMove = legal[0];
  let selected = legal, guard: PolicyAnalysis['guard'] = 'none';
  if (guardFour) {
    const wins = immediateWins(position, position.turn, rule);
    const blocks = wins.length ? [] : immediateWins(position, other(position.turn), rule);
    if (wins.length) { selected = legal.filter(move => wins.includes(move)); guard = 'win-now'; }
    else if (blocks.length) { selected = legal.filter(move => blocks.includes(move)); guard = 'block-four'; }
    if (!selected.length) { selected = legal; guard = 'none'; }
  }
  const move = selected[0];
  return { move, rawMove, policyLogit: policy.get(move)!, guard, score: 0, depth: 0, nodes: 0, elapsed, engine };
}
