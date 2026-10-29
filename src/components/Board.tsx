import { useMemo, useRef, useState } from 'react';
import { foulLines } from '../game/foul-lines.ts';
import { SIZE, colorName, coordinate } from '../game/types.ts';
import type { Position } from '../game/types.ts';

export function Board({ position, interactive = false, onMove, hint, numbers = false, moves = [], decorative = false, forbidden = [] }: {
  position: Position; interactive?: boolean; onMove?: (move: number) => void; hint?: number | null; numbers?: boolean; moves?: number[]; decorative?: boolean; forbidden?: number[];
}) {
  const [focus, setFocus] = useState(112);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const order = new Map(moves.map((move, index) => [move, index + 1]));
  const foulPaths = useMemo(() => foulLines(position), [position]);
  const foulStones = new Set(foulPaths.flat());
  return <div className={`board-frame ${decorative ? 'decorative' : ''}`}>
    <div className="board-square">
      <div className="coordinates horizontal" aria-hidden="true">{Array.from({ length: SIZE }, (_, i) => <span key={i} style={{ left: `${7 + i * 86 / 14}%` }}>{String.fromCharCode(65 + i)}</span>)}</div>
      <div className="coordinates vertical" aria-hidden="true">{Array.from({ length: SIZE }, (_, i) => <span key={i} style={{ top: `${7 + i * 86 / 14}%` }}>{SIZE - i}</span>)}</div>
      <svg className="grid-lines" viewBox="0 0 420 420" aria-hidden="true" overflow="visible">
        {Array.from({ length: SIZE }, (_, i) => <g key={i}><path d={`M${i * 30} 0V420M0 ${i * 30}H420`} /></g>)}
        {[3, 7, 11].flatMap(r => [3, 7, 11].filter(c => (r === 7) === (c === 7)).map(c => <circle key={`${r}-${c}`} cx={c * 30} cy={r * 30} r="3" />))}
        {position.line.length > 1 && <line className="winning-path" x1={(position.line[0] % SIZE) * 30} y1={Math.floor(position.line[0] / SIZE) * 30} x2={(position.line[position.line.length - 1] % SIZE) * 30} y2={Math.floor(position.line[position.line.length - 1] / SIZE) * 30} />}
        {foulPaths.map((path, index) => <line key={index} className="foul-path" x1={(path[0] % SIZE) * 30} y1={Math.floor(path[0] / SIZE) * 30} x2={(path[path.length - 1] % SIZE) * 30} y2={Math.floor(path[path.length - 1] / SIZE) * 30} />)}
      </svg>
      <div className={`intersections turn-${position.turn}`} role={decorative ? undefined : 'grid'} aria-label={decorative ? undefined : '15乘15五子棋棋盘'} onKeyDown={event => {
        if (!interactive) return;
        let next = focus;
        const row = Math.floor(focus / SIZE), col = focus % SIZE;
        if (event.key === 'ArrowRight') next = row * SIZE + Math.min(14, col + 1);
        else if (event.key === 'ArrowLeft') next = row * SIZE + Math.max(0, col - 1);
        else if (event.key === 'ArrowDown') next = Math.min(14, row + 1) * SIZE + col;
        else if (event.key === 'ArrowUp') next = Math.max(0, row - 1) * SIZE + col;
        else if (event.key === 'Home') next = row * SIZE;
        else if (event.key === 'End') next = row * SIZE + 14;
        else return;
        event.preventDefault(); setFocus(next); cells.current[next]?.focus();
      }}>
        {position.board.map((color, move) => {
          const foul = position.ending === 'forbidden' && position.last === move ? position.foul : undefined;
          const content = <>{color ? <span className={`stone ${color === 1 ? 'black' : 'white'} ${position.line.includes(move) ? 'winning' : ''} ${position.last === move ? 'last' : ''} ${foulStones.has(move) ? 'foul-related' : ''} ${foul ? 'foul' : ''}`}>
            {numbers ? <span className="stone-number">{order.get(move)}</span> : position.last === move ? <i className="last-mark" /> : null}
          </span> : forbidden[move] > 0 ? <span className="forbidden-mark" aria-hidden="true">×</span> : hint === move ? <span className="hint-stone">✧</span> : <span className="ghost-stone" />}</>;
          return decorative ? <span className="intersection" key={move}>{content}</span> : <button role="gridcell" ref={node => { cells.current[move] = node; }} className={`intersection ${interactive && !color ? 'playable' : ''} ${forbidden[move] > 0 ? 'forbidden-cell' : ''}`} key={move}
            tabIndex={move === focus ? 0 : -1} aria-disabled={!interactive || !!color} aria-label={`${coordinate(move)}，${color ? colorName(color as 1 | 2) : '空位'}${forbidden[move] > 0 ? `，黑棋${['', '三三', '四四', '长连'][forbidden[move]]}禁手，落子判负` : ''}${foul ? `，${['', '三三', '四四', '长连'][foul]}禁手，黑棋判负` : ''}${foulStones.has(move) ? '，禁手棋形' : ''}${position.line.includes(move) ? '，获胜连线' : ''}${position.last === move ? '，最后落子' : ''}${hint === move ? '，推荐落点' : ''}`}
            onFocus={() => setFocus(move)} onClick={() => { if (interactive && !color) onMove?.(move); }}>{content}</button>;
        })}
      </div>
    </div>
  </div>;
}
