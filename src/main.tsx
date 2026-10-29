import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './style.css';
import { loadBrowserRules } from './game/renju.ts';
const container = document.getElementById('root')!;
container.textContent = '正在准备棋盘与连珠规则…';
loadBrowserRules(new URL('engine/', document.baseURI).href).then(() => {
  createRoot(container).render(<StrictMode><App /></StrictMode>);
}).catch(() => { container.textContent = '连珠规则加载失败，请刷新页面重试。'; });
