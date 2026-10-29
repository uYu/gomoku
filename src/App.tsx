import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Cpu, Download, Eye, Home, Leaf, Lightbulb, Pause, Play, Plus, RotateCcw, Settings2, Trophy, Undo2, Upload, Users, Volume2, VolumeX, X } from 'lucide-react';
import { Board } from './components/Board.tsx';
import { Dialog } from './components/Dialog.tsx';
import { initial, play, replay, undoCount } from './game/engine.ts';
import { downloadSave, MAX_SAVE_BYTES, newSave, parseSave, SAVE_KEY } from './game/storage.ts';
import { forbiddenMap, FORBIDDEN_NAMES } from './game/renju.ts';
import { colorName, coordinate, LEVELS, MODES, RULES } from './game/types.ts';
import type { Analysis, Color, Difficulty, Mode, Rule, Save, Settings } from './game/types.ts';

const trialPage = new URLSearchParams(window.location.search).get('trial') === 'freestyle';
const beginnerTrial = trialPage || import.meta.env.VITE_BEGINNER_API === '1';
const defaults: Settings = { mode: 'ai', difficulty: trialPage ? 'easy' : 'normal', human: 1, rule: trialPage ? 'freestyle' : 'renju', engine: 'rapfi' };
function load() {
  try { const data = localStorage.getItem(SAVE_KEY); return { save: data ? parseSave(data) : null, error: '' }; }
  catch { return { save: null, error: '无法读取本地存档。可以导入备份棋谱，或开始新局。' }; }
}
const demoMoves = [112, 113, 98, 126, 96, 128, 82, 114, 84, 100, 80, 66, 127, 111, 110, 95, 142, 156];
function DemoBoard() {
  const position = useMemo(() => replay(demoMoves, 'freestyle').at(-1)!, []);
  return <figure className="hero-scene"><div className="hero-orbit" /><div className="hero-board"><Board position={position} decorative /></div><span className="hero-note">纵横十五道 · 黑白一念间</span><figcaption className="hero-caption"><span className="caption-discs"><i /><i /></span><div><strong>方寸之间，落子有声。</strong><small>FIFTEEN LINES. INFINITE POSSIBILITIES.</small></div><span className="caption-seal">五<br />子</span></figcaption></figure>;
}
export default function App() {
  const [loaded] = useState(load);
  const [save, setSave] = useState<Save | null>(loaded.save);
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [modal, setModal] = useState<'new' | 'rules' | 'pause' | 'restart' | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [error, setError] = useState(loaded.error);
  const [aiError, setAIError] = useState('');
  const [ruleError, setRuleError] = useState('');
  const [numbers, setNumbers] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const [hintTask, setHintTask] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const engineWorker = useRef<Worker | null>(null);
  const disposeEngine = () => { engineWorker.current?.terminate(); engineWorker.current = null; };
  useEffect(() => () => { engineWorker.current?.terminate(); engineWorker.current = null; }, []);
  useEffect(() => { if (screen === 'menu') { disposeEngine(); setEngineLoading(false); } }, [screen]);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [watchPaused, setWatchPaused] = useState(false);
  const [retry, setRetry] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const historyList = useRef<HTMLDivElement>(null);
  const positions = useMemo(() => save ? replay(save.moves, save.rule) : [initial()], [save]);
  const latest = positions.at(-1)!;
  const shown = replayIndex ?? latest.ply;
  const position = positions[shown];
  const isReplay = replayIndex !== null;
  const forbidden = useMemo(() => save?.rule === 'renju' && position.turn === 1 && !position.over ? forbiddenMap(position.board) : [], [save?.rule, position]);
  useEffect(() => { setRuleError(''); }, [save, replayIndex]);
  const active = !!save && screen === 'game' && !modal && !isReplay && !latest.over;
  const humanTurn = !!save && (save.mode === 'local' || save.mode === 'ai' && latest.turn === save.human);
  const interactive = active && humanTurn;
  const automatic = active && !humanTurn && !(save?.mode === 'watch' && watchPaused);
  const soundMove = () => {
    if (!sound) return;
    try {
      const context = audio.current ??= new AudioContext(); void context.resume();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(720, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(240, context.currentTime + .065);
      gain.gain.setValueAtTime(.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .09);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .1);
    } catch { /* Sound is optional when the browser cannot open an audio device. */ }
  };
  const commit = (move: number) => {
    if (!save || !interactive || latest.board[move]) return;
    try { play(latest, move, save.rule); } catch (error) { setRuleError(`${coordinate(move)}：${error instanceof Error ? error.message : '不能落子'}`); return; }
    setSave({ ...save, moves: [...save.moves, move] }); setHint(null); setHintTask(false); soundMove();
  };
  useEffect(() => {
    if (!save) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
    catch { setError('自动保存失败，请导出棋谱备份。'); }
  }, [save]);
  useEffect(() => { historyList.current?.scrollTo({ top: historyList.current.scrollHeight, behavior: 'auto' }); }, [save?.moves.length]);
  useEffect(() => {
    if (!save || !(automatic || (hintTask && interactive))) { setThinking(false); setEngineLoading(false); return; }
    let cancelled = false;
    let completed = false;
    let worker: Worker | undefined;
    let delivery: ReturnType<typeof setTimeout> | undefined;
    const began = performance.now(); setThinking(true); setAIError('');
    const stop = () => { worker?.terminate(); if (engineWorker.current === worker) engineWorker.current = null; };
    const fail = (message: string) => { if (cancelled) return; setAIError(message); setThinking(false); setEngineLoading(false); setHintTask(false); stop(); };
    const timer = setTimeout(() => {
      try {
        worker = engineWorker.current ??= new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<{ result?: Analysis; error?: string; loading?: boolean }>) => {
          if (cancelled) return;
          if (event.data.loading !== undefined) { setEngineLoading(event.data.loading); return; }
          const result = event.data.result;
          if (!result || !Number.isInteger(result.move) || result.move < 0 || result.move >= 225 || latest.board[result.move]) { fail(event.data.error ?? 'AI 返回了无效落点'); return; }
          completed = true; clearTimeout(watchdog); setEngineLoading(false);
          delivery = setTimeout(() => {
            if (cancelled) return;
            setThinking(false); setHintTask(false);
            if (hintTask) setHint(result.move);
            else { setSave(previous => previous === save ? { ...save, moves: [...save.moves, result.move] } : previous); soundMove(); }
          }, hintTask ? 0 : Math.max(0, (save.mode === 'watch' ? 750 : save.difficulty === 'easy' ? 600 : 400) - (performance.now() - began)));
        };
        worker.onerror = () => fail('AI 暂时无法运行，请重试。');
        worker.postMessage({ position: latest, moves: save.moves, rule: save.rule, engine: save.engine ?? 'rapfi', difficulty: hintTask ? 'hard' : save.difficulty, fullStrength: hintTask, assetBase: new URL('engine/', document.baseURI).href, beginnerTrial });
      } catch { fail('无法启动 AI，请重试或使用双人模式。'); }
    }, 30);
    const watchdog = setTimeout(() => fail('AI 分析超时，请重试。'), 45_000);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(delivery); clearTimeout(watchdog); if (worker) { worker.onmessage = null; worker.onerror = null; if (!completed) stop(); } };
    // Save and active flags own each worker request; other presentation state does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, automatic, hintTask, interactive, retry]);
  useEffect(() => {
    if (!playing || replayIndex === null || modal || screen !== 'game') return;
    if (replayIndex >= latest.ply) { setPlaying(false); return; }
    const timer = setTimeout(() => setReplayIndex(value => (value ?? 0) + 1), 750);
    return () => clearTimeout(timer);
  }, [playing, replayIndex, modal, screen, latest.ply]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  function start(configuration = settings) {
    disposeEngine(); setEngineLoading(false);
    setSave(newSave({ ...configuration, engine: 'rapfi' })); setScreen('game'); setModal(null); setReplayIndex(null); setPlaying(false); setWatchPaused(false); setHint(null); setHintTask(false); setAIError(''); setError('');
  }
  function openNew(mode?: Mode) { setSettings({ ...settings, mode: mode ?? save?.mode ?? settings.mode }); setModal('new'); setPlaying(false); setHintTask(false); }
  function enterReplay(index: number) { setReplayIndex(Math.max(0, Math.min(latest.ply, index))); setPlaying(false); setHint(null); setHintTask(false); }
  function closeModal() { setModal(null); }
  const who = (color: Color) => !save ? '' : save.mode === 'local' ? color === 1 ? '玩家一' : '玩家二' : save.mode === 'watch' ? `${LEVELS[save.difficulty]} AI` : color === save.human ? '你' : `${LEVELS[save.difficulty]} AI`;
  const title = position.over ? position.winner ? `${colorName(position.winner)}获胜` : '棋逢对手，和棋' : isReplay ? '重温每一次落子' : thinking ? engineLoading ? '正在加载 C++ 引擎…' : hintTask ? '正在寻找好棋…' : 'AI 正在思考…' : save?.mode === 'watch' && watchPaused ? '观战已暂停' : `${colorName(position.turn)}行棋`;
  const canUndo = !!save && undoCount(save.moves, save.mode, save.human) < save.moves.length;
  const foulReason = position.foul ? `黑棋${FORBIDDEN_NAMES[position.foul]}禁手，判负` : '';
  const finishReason = foulReason || (position.ending === 'no-legal-moves' ? '黑棋无合法落点' : position.winner ? `连成 ${position.line.length} 子` : '棋盘已满，双方和棋');
  const finalMove = position.last === null ? '' : coordinate(position.last);
  return <div className="app-shell">
    <header className="topbar"><button className="brand" aria-label="五子之间，返回首页" onClick={() => { setScreen('menu'); setModal(null); setPlaying(false); setHintTask(false); }}><span className="brand-mark"><i /><i /><i /></span><span>五子之间<small>GOMOKU ATELIER</small></span></button><nav>{screen === 'game' && <button className="text-btn home-link" onClick={() => { setScreen('menu'); setPlaying(false); setHintTask(false); }}><Home size={15} />首页</button>}<button className="text-btn" onClick={() => { setModal('rules'); setPlaying(false); }}><BookOpen size={16} />游戏规则</button><span className="nav-divider" /><span className="edition">{trialPage ? '入门模型试玩' : '连珠五子棋'}</span></nav></header>
    {error && <div className="notice" role="alert">{error}<button className="icon-btn" aria-label="关闭提示" onClick={() => setError('')}><X size={16} /></button></div>}
    <input hidden ref={file} type="file" accept=".json,application/json" onChange={async event => {
      const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return;
      try { if (selected.size > MAX_SAVE_BYTES) throw new Error('棋谱文件过大'); const imported = parseSave(await selected.text()); disposeEngine(); setSave(imported); setScreen('game'); setModal(null); setReplayIndex(null); setPlaying(false); setWatchPaused(true); setHint(null); setHintTask(false); setAIError(''); setError(''); }
      catch (e) { setError(e instanceof Error ? e.message : '导入失败'); }
    }} />
    {screen === 'menu' ? <>
      <main className="menu"><section className="intro"><div className="eyebrow"><span /> A SIMPLE RULE. A WORLD OF POSSIBILITIES.</div><h1>纵横之间，<br /><em>五子成诗。</em></h1><p className="intro-copy">黑白交替，连珠成线。<br />在方寸棋盘上，留一点时间给思考。</p><div className="menu-actions"><button className="primary large" onClick={() => openNew()}>开始新对局<ArrowRight size={18} /></button>{save && <button className="secondary large" onClick={() => { setScreen('game'); setReplayIndex(null); }}>继续对局<span className="count-badge">{save.moves.length} 手</span></button>}</div><div className="menu-links"><button onClick={() => file.current?.click()}><Upload size={14} />导入棋谱</button>{save && <button onClick={() => downloadSave(save)}><Download size={14} />导出棋谱</button>}</div><div className="intro-facts"><div><b>15 × 15</b><span>经典棋盘</span></div><div><b>5 连</b><span>一线定胜负</span></div><div><b>3 档</b><span>离线 AI</span></div></div></section><DemoBoard /></main>
      <section className="mode-preview"><div className="mode-preview-intro"><span className="eyebrow">YOUR TABLE, YOUR PACE</span><h2>落子之前，选个对手。</h2></div>{(['ai', 'local', 'watch'] as Mode[]).map(mode => { const Icon = mode === 'ai' ? Cpu : mode === 'local' ? Users : Eye; return <button className="mode-preview-card" key={mode} onClick={() => openNew(mode)}><Icon size={23} strokeWidth={1.4} /><div><h3>{MODES[mode]}</h3><p>{mode === 'ai' ? '与 AI 切磋，步步精进' : mode === 'local' ? '与身边的人，共享一盘好棋' : '暂歇片刻，看攻守悄然发生'}</p></div><ArrowUpRight size={16} /></button>; })}</section>
    </> : <main className="game"><div className="game-heading"><div><div className="eyebrow">A QUIET MOMENT. A THOUGHTFUL MOVE.</div><h1>{isReplay ? '棋谱回放' : latest.over ? '一局落定' : '棋局进行中'}<span>{save && MODES[save.mode]}{beginnerTrial && save && save.rule !== 'exact' && save.difficulty === 'easy' && save.mode !== 'local' ? ' · 自训入门' : ''}</span></h1></div><div className="heading-actions"><button className="text-btn" onClick={() => openNew()}><Plus size={16} />新对局</button><button className="icon-btn" aria-label="棋局菜单" onClick={() => { setModal('pause'); setPlaying(false); setHintTask(false); }}><Settings2 size={19} /></button></div></div>
      <div className="game-layout"><section className="table"><div className="table-status"><span className={`status-stone stone ${(position.winner || position.turn) === 1 ? 'black' : 'white'} ${thinking ? 'thinking' : ''}`} /><div role="status" aria-live="polite"><strong>{title}</strong><small>{position.over ? `最后一手 ${finalMove} · ${foulReason || (position.ending === 'no-legal-moves' ? '黑棋无合法落点' : position.winner ? `连成${position.line.length}子` : '双方和棋')}` : isReplay ? `第 ${shown} / ${latest.ply} 手 · ${save && RULES[save.rule]}` : `${who(position.turn)}执${colorName(position.turn)} · ${save && RULES[save.rule]}`}</small></div><span className="move-label">MOVE <b>{String(shown).padStart(2, '0')}</b></span></div>
        <Board position={position} interactive={interactive} onMove={commit} hint={isReplay ? null : hint} numbers={numbers} moves={save?.moves.slice(0, shown)} forbidden={forbidden} />
        <div className="board-legend"><span><i className="legend-last" />最后落子</span>{position.ending === 'forbidden' ? <span><i className="legend-foul" />红圈与虚线 · 禁手棋形</span> : <span><i className="legend-hint">✧</i>推荐落点</span>}{save?.rule === 'renju' && !position.over && <span><i className="legend-forbidden">×</i>禁手 · 落子判负</span>}<span className="keyboard-note">方向键移动 · Enter 落子</span></div>{ruleError && <div className="rule-feedback" role="alert">{ruleError}</div>}
        {aiError && <div className="notice" role="alert">{aiError}<button className="text-btn" onClick={() => { setAIError(''); setRetry(value => value + 1); }}>重试</button></div>}
        <div className="board-tools"><button className="tool" disabled={!canUndo || isReplay} onClick={() => { if (!save) return; setSave({ ...save, moves: save.moves.slice(0, undoCount(save.moves, save.mode, save.human)) }); setHint(null); setHintTask(false); setWatchPaused(true); setAIError(''); }}><Undo2 size={17} />悔棋</button>{save?.mode !== 'watch' ? <button className={`tool ${hint !== null ? 'selected' : ''}`} disabled={!interactive || thinking} onClick={() => { if (hint !== null) setHint(null); else setHintTask(true); }}><Lightbulb size={17} />{hintTask && thinking ? '分析中' : '提示'}</button> : <button className="tool" disabled={latest.over || isReplay} onClick={() => setWatchPaused(value => !value)}>{watchPaused ? <Play size={17} /> : <Pause size={17} />}{watchPaused ? '继续观战' : '暂停观战'}</button>}<label className="numbers-toggle"><input type="checkbox" checked={numbers} onChange={e => setNumbers(e.target.checked)} />显示手数</label><button className="icon-btn sound-btn" aria-label={sound ? '关闭音效' : '开启音效'} aria-pressed={sound} onClick={() => { setSound(!sound); if (!sound) { try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* optional audio */ } } }}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button></div>
      </section><aside className="sidebar">{position.over && save ? <section className="panel finish-panel" aria-label="对局结果">
          <div className="finish-heading">{position.winner ? <Trophy size={28} strokeWidth={1.5} /> : <Leaf size={28} strokeWidth={1.5} />}<div><span>胜负落定</span><h2>{position.winner ? `${colorName(position.winner)}获胜` : '平分秋色'}</h2></div></div>
          <p className="finish-meta">{position.winner ? `${who(position.winner)} · ` : ''}第 {position.ply} 手</p>
          <div className={`finish-reason ${position.foul ? 'is-foul' : ''}`} role="status"><strong>{finishReason}</strong>{position.foul && <span>黑棋落于 {finalMove}，{position.foul === 1 ? '同时形成两组活三' : position.foul === 2 ? '同时形成两组四' : '形成六子及以上的长连'}。棋盘已用红圈与虚线标出。</span>}</div>
          <div className="finish-last"><div><span>{position.foul ? '禁手落点' : '最后一手'}</span><strong>{finalMove}</strong></div><button className="text-btn" onClick={() => enterReplay(Math.max(0, position.ply - 1))}><ChevronLeft size={13} />回看最后一手</button></div>
          {position.line.length > 0 && <p className="finish-line">获胜连线 <span>{coordinate(position.line[0])} → {coordinate(position.line[position.line.length - 1])}</span></p>}
          <div className="finish-actions"><button className="secondary" onClick={() => enterReplay(0)}>回看棋谱</button><button className="primary" onClick={() => start(save)}>再来一局<ArrowRight size={13} /></button></div>
        </section> : <section className="panel players-panel"><div className="panel-title"><h2>对弈双方</h2><span>BLACK GOES FIRST</span></div><div className="players">{([1, 2] as Color[]).map(color => <div key={color} className={`player ${!position.over && position.turn === color ? 'current' : ''}`}><span className={`stone player-stone ${color === 1 ? 'black' : 'white'}`} /><div><b>{colorName(color)}<small>{color === 1 ? '先手' : '后手'}</small></b><span>{who(color)}</span></div>{position.winner === color ? <Trophy size={18} /> : !position.over && position.turn === color ? <span className="turn-pill">行棋中</span> : <span className="player-count">{position.board.filter(value => value === color).length}<small>子</small></span>}</div>)}</div><div className="players-note">纵 · 横 · 斜，率先连成五子即获胜</div></section>}
        <section className="panel history-panel"><div className="panel-title"><h2>落子记录 <small>{latest.ply} 手</small></h2><button className="icon-btn" aria-label="导出棋谱" onClick={() => save && downloadSave(save)}><Download size={15} /></button></div><div className="history-list" ref={historyList}>{!latest.ply ? <div className="history-empty"><span>一盘好棋，从第一手开始。</span><small>落子后，棋谱会自动记录在这里</small></div> : save?.moves.map((move, index) => <button className={`history-item ${shown === index + 1 ? 'current' : ''}`} key={index} onClick={() => enterReplay(index + 1)} aria-label={`回看第${index + 1}手 ${coordinate(move)}`}><span className="history-number">{String(index + 1).padStart(2, '0')}</span><i className={`stone mini-stone ${index % 2 === 0 ? 'black' : 'white'}`} /><b>{coordinate(move)}</b><small>{index % 2 === 0 ? '黑棋' : '白棋'}</small><ChevronRight size={12} /></button>)}</div><div className="replay-controls"><div className="replay-buttons"><button className="icon-btn" aria-label="回到开局" disabled={!latest.ply} onClick={() => enterReplay(0)}><ChevronsLeft size={17} /></button><button className="icon-btn" aria-label="上一手" disabled={!shown} onClick={() => enterReplay(shown - 1)}><ChevronLeft size={17} /></button><button className="icon-btn playback" aria-label={playing ? '暂停回放' : '自动回放'} disabled={!latest.ply} onClick={() => { if (playing) setPlaying(false); else { if (replayIndex === null || shown === latest.ply) setReplayIndex(0); setPlaying(true); } }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button><button className="icon-btn" aria-label="下一手" disabled={shown === latest.ply} onClick={() => enterReplay(shown + 1)}><ChevronRight size={17} /></button><button className="icon-btn" aria-label="最后一手" disabled={!latest.ply} onClick={() => enterReplay(latest.ply)}><ChevronsRight size={17} /></button></div><input type="range" min={0} max={latest.ply || 1} value={shown} disabled={!latest.ply} aria-label="棋谱回放进度" onChange={e => enterReplay(Number(e.target.value))} />{isReplay && <button className="return-live" onClick={() => { setReplayIndex(null); setPlaying(false); }}>{latest.over ? '返回终局' : '返回当前对局'}<ArrowRight size={13} /></button>}</div></section></aside></div>
    </main>}
    <footer><span>一棋一会，从容落子。</span><span><i className="online-dot" />C++ Rapfi · 离线对弈<span className="footer-separator">/</span>自动保存</span><span><a href="./engine/source.tar.gz" download>引擎源码</a> · <a href="./engine/LICENSE.txt" target="_blank" rel="noreferrer">GPL-3.0</a></span></footer>
    {modal === 'new' && <Dialog title="开启一盘好棋" onClose={closeModal}><p className="dialog-copy">选一种方式，落下你的第一子。</p><div className="field-label">对弈方式</div><div className="mode-options">{(['ai', 'local', 'watch'] as Mode[]).map(mode => { const Icon = mode === 'ai' ? Cpu : mode === 'local' ? Users : Eye; return <button className={`choice ${settings.mode === mode ? 'chosen' : ''}`} aria-pressed={settings.mode === mode} onClick={() => setSettings({ ...settings, mode })} key={mode}><Icon size={23} strokeWidth={1.5} /><b>{MODES[mode]}</b>{settings.mode === mode && <Check className="choice-check" size={12} />}</button>; })}</div>{settings.mode !== 'local' && <><div className="field-label">AI 难度<small>{beginnerTrial && settings.difficulty === 'easy' ? '自训模型 · 零搜索' : 'C++ 搜索 · 本地运行'}</small></div><div className="difficulty-options">{(['easy', 'normal', 'hard'] as Difficulty[]).map((difficulty, i) => <button className={`choice ${settings.difficulty === difficulty ? 'chosen' : ''}`} aria-pressed={settings.difficulty === difficulty} key={difficulty} onClick={() => setSettings({ ...settings, difficulty })}><span className="level-bars">{[0, 1, 2].map(j => <i key={j} className={j <= i ? 'filled' : ''} />)}</span><b>{LEVELS[difficulty]}</b><small>{['熟悉攻守', '多步思考', '更深搜索'][i]}</small></button>)}</div></>}{settings.mode === 'ai' && <><div className="field-label">选择执子</div><div className="color-options">{([1, 2] as Color[]).map(human => <button className={`choice ${settings.human === human ? 'chosen' : ''}`} aria-pressed={settings.human === human} key={human} onClick={() => setSettings({ ...settings, human })}><i className={`stone mini-stone ${human === 1 ? 'black' : 'white'}`} />{human === 1 ? '执黑 · 先手' : '执白 · 后手'}</button>)}</div></>}<div className="field-label">获胜规则</div><div className="rule-options">{(['renju', 'freestyle'] as Rule[]).map(rule => <button className={`choice ${settings.rule === rule ? 'chosen' : ''}`} aria-pressed={settings.rule === rule} key={rule} onClick={() => setSettings({ ...settings, rule, engine: 'rapfi', difficulty: trialPage ? settings.difficulty : rule === 'freestyle' ? 'easy' : 'normal' })}><b>{RULES[rule]}</b><small>{rule === 'renju' ? '黑棋三三、四四、长连禁手' : '轻松入门，双方均无禁手'}</small></button>)}</div><p className="field-help">{settings.rule === 'freestyle' ? '休闲模式：双方五连及以上获胜，三三、四四和长连均可落子。默认入门难度，也可调高挑战。' : '连珠：黑棋恰好五连胜，白棋五连或长连胜。禁手点标记 ×，黑棋落子即判负；不采用交换开局。'}</p>{save && <p className="replace-note">新对局会替换当前自动存档。<button onClick={() => downloadSave(save)}>先导出棋谱</button></p>}<button className="primary dialog-start" onClick={() => start()}>开始对局<ArrowRight size={17} /></button></Dialog>}
    {modal === 'rules' && <Dialog title="简单五子，自有深意" onClose={closeModal}><div className="rules-lead"><span className="caption-discs"><i /><i /></span><p>黑白交替，先连五子者胜。</p></div><ol className="rules-list"><li><b>十五道，落在交点上</b><p>使用 15 × 15 棋盘。黑棋先行，双方每回合在空交点上放置一枚棋子，落子后不移动、不吃子。</p></li><li><b>横、竖、斜，五子相连</b><p>连珠模式下，黑棋必须恰好五连，白棋五连或长连都获胜。休闲模式下，双方五连及以上获胜。棋盘填满仍无人获胜，则为和棋。</p></li><li><b>连珠禁手，只限制黑棋</b><p>黑棋走出三三、四四或长连禁手时判负。活三需能合法形成活四；假活三不误判为禁手。同一手恰好成五优先判胜。禁手点显示 ×，落子后保留棋子并判黑棋负、白棋胜；若黑棋已无任何合法落点，则白棋获胜。</p></li><li><b>从容对弈，随时回看</b><p>人机悔棋会退回到你上一次落子之前。点击落子记录或拖动进度条可以回放，返回当前对局即可继续。</p></li></ol><div className="rules-tip"><Lightbulb size={18} /><p>主玩法采用连珠禁手与自由落子开局，未实现交换开局等完整赛事流程。白棋可利用禁手点逼胜；休闲模式默认较弱 AI，适合入门。</p></div><button className="primary dialog-start" onClick={closeModal}>明白了，落子吧<ArrowRight size={16} /></button></Dialog>}
    {modal === 'pause' && <Dialog title="棋间小憩" onClose={closeModal}><p className="dialog-copy">棋局已暂停，下一手不必着急。</p><div className="pause-actions"><button className="primary" onClick={closeModal}><Play size={17} />继续对局</button><button className="secondary" onClick={() => setModal('restart')}><RotateCcw size={17} />重新开始本局</button><button className="secondary" onClick={() => save && downloadSave(save)}><Download size={17} />导出棋谱</button><button className="secondary" onClick={() => file.current?.click()}><Upload size={17} />导入棋谱</button><button className="text-btn" onClick={() => { setScreen('menu'); setModal(null); }}><Home size={16} />返回首页，保留对局</button></div></Dialog>}
    {modal === 'restart' && <Dialog title="重新开始这一局？" onClose={closeModal}><p className="dialog-copy">将保留对弈方式和规则，清空当前落子记录。你可以先导出棋谱留作纪念。</p><div className="pause-actions"><button className="secondary" onClick={() => save && downloadSave(save)}><Download size={16} />导出当前棋谱</button><button className="primary" onClick={() => save && start(save)}><RotateCcw size={16} />确认重新开始</button></div></Dialog>}

  </div>;
}
