const games = [
  {id:'gomoku',name:'五子之间',english:'GOMOKU ATELIER',category:'chess',tag:'五子棋 · 人机 / 双人',description:'纵横十五道，先连五子。连珠禁手与休闲玩法，随心选择。',art:'gomoku',color:'sage'},
  {id:'othello',name:'黑白棋',english:'OTHELLO',category:'chess',tag:'黑白棋 · 人机对弈',description:'落下一子，翻转一线。黑白之间，寻找下一步的可能。',art:'othello',color:'forest'},
  {id:'scout',name:'星光马戏团',english:'SCOUT',category:'table',tag:'卡牌 · 组合与取舍',description:'把握手中的牌，安排精彩的表演，让这一轮成为你的主场。',art:'scout',color:'peach'},
  {id:'heaven-ale',name:'天堂与美酒',english:'HEAVEN & ALE',category:'table',tag:'策略 · 经营与规划',description:'经营你的酿酒事业，在资源与时机之间，酝酿一局好棋。',art:'ale',color:'wheat'},
  {id:'modern-art',name:'现代艺术',english:'MODERN ART',category:'table',tag:'拍卖 · 眼光与报价',description:'画作上桌，好戏开场。你眼中的价值，会是谁的下一笔交易？',art:'art',color:'rose'},
  {id:'jaipur',name:'粉城商事',english:'JAIPUR',category:'table',tag:'交易 · 商队与市场',description:'走进热闹的集市，在货物、商队与交易之间，做出你的选择。',art:'jaipur',color:'sand'},
  {id:'patchwork',name:'拼布艺术',english:'PATCHWORK',category:'table',tag:'拼图 · 空间与时间',description:'一块一块，拼出自己的小天地。留意每一块布，也留意时间。',art:'patchwork',color:'blue'},
  {id:'ra',name:'太阳神 Ra',english:'RA',category:'table',tag:'拍卖 · 藏品收集',description:'在尼罗河畔收集藏品，等待出手的时刻，争取这一轮的荣耀。',art:'ra',color:'clay'},
  {id:'carnegie',name:'卡内基工具',english:'CARNEGIE COMPANION',category:'tool',tag:'辅助工具 · 开局准备',description:'基础、扩展与 Open Bar 部门抽选，为下一场卡内基做好准备。',art:'carnegie',color:'stone'},
];
const svg = (body) => `<svg viewBox="0 0 300 180" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const black='#2e4135', white='#fffbed';
function artwork(type){
  if(type==='gomoku'||type==='othello'){
    const grid=Array.from({length:7},(_,i)=>`<path d="M${78+i*24} 18v144M78 ${18+i*24}h144"/>`).join('');
    const stones=type==='gomoku'?[[102,42,black],[126,66,black],[150,90,black],[174,114,black],[126,42,white],[150,66,white],[174,90,white],[198,90,white]]:[[126,66,white],[150,66,black],[174,66,black],[126,90,black],[150,90,white],[174,90,black],[126,114,black],[150,114,white]];
    return svg(`<g stroke="${type==='othello'?'#bad0b34d':'#78896c66'}" stroke-width="1">${grid}</g>${stones.map(([x,y,c])=>circle(x,y,10,c,'stroke="#71836b55"')).join('')}`);
  }
  if(type==='scout')return svg(`<path d="M52 149h196L150 21Z" fill="#d68e7555"/><path d="m150 21-42 128h84Z" fill="#faf2db99"/><g transform="rotate(-13 137 100)"><rect x="91" y="40" width="75" height="107" rx="8" fill="#f9f0d8" stroke="#bd826d"/><path d="m129 65 15 27-15 27-15-27Z" fill="#bc765f"/></g><g transform="rotate(12 180 100)"><rect x="151" y="49" width="67" height="98" rx="7" fill="#e9ba7c" stroke="#bd826d"/><path d="m185 68 6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2Z" fill="#fff5db"/></g>`);
  if(type==='patchwork')return svg(`<g transform="translate(90 28) rotate(-8 65 65)"><rect width="125" height="125" rx="7" fill="#f8f3e6" stroke="#8095a1"/><path d="M7 7h53v53H7Z" fill="#78969b"/><path d="M66 7h52v53H66Z" fill="#d8b68d"/><path d="M7 66h53v52H7Z" fill="#d5a797"/><path d="M66 66h52v52H66Z" fill="#a0b3a4"/><path d="M63 0v125M0 63h125" stroke="#f8f3e6" stroke-dasharray="3 4" stroke-width="2"/>${circle(32,32,9,'#f3e6cc')}${circle(92,92,9,'#f3e6cc')}</g>`);
  if(type==='art')return svg(`<g transform="rotate(-8 132 90)"><rect x="71" y="26" width="115" height="131" rx="3" fill="#bd9673"/><rect x="79" y="34" width="99" height="115" fill="#fff4de"/><path d="M89 137 132 49l35 88Z" fill="#a3aca0"/>${circle(112,65,16,'#dca58b')}</g><g transform="rotate(9 204 100)"><rect x="163" y="61" width="69" height="92" fill="#8a7567"/><rect x="170" y="68" width="55" height="78" fill="#e6c9b3"/>${circle(198,105,20,'#b67e6c')}</g>`);
  if(type==='ra')return svg(`${circle(150,62,28,'#d7a457')}<g stroke="#bf8d48" stroke-width="2">${Array.from({length:12},(_,i)=>`<path d="M150 25V14" transform="rotate(${i*30} 150 62)"/>`).join('')}</g><path d="m68 152 54-77 54 77Z" fill="#b47d57"/><path d="m135 152 43-60 43 60Z" fill="#d7ad75"/><path d="M45 158h210" stroke="#a57850"/>`);
  if(type==='ale')return svg(`<path d="M141 145V36m0 20-19-16m19 33-22-15m22 34-22-15m22 34-22-15m22-40 18-16m-18 33 22-15m-22 34 22-15m-22 34 22-15" stroke="#ad914c" stroke-width="5" stroke-linecap="round"/><rect x="177" y="73" width="40" height="71" rx="7" fill="#e6c880" stroke="#b0985b"/><path d="M217 87h14v38h-14" stroke="#b0985b" stroke-width="5"/><path d="M183 90h28" stroke="#f8edcd" stroke-width="6"/>`);
  if(type==='jaipur')return svg(`<path d="M63 145h180" stroke="#b18b67"/><path d="M92 143V69l36-27 36 27v74m-61-66h48m-48 17h48m-48 17h48" stroke="#b18b67" stroke-width="3"/><path d="M122 143v-27h17v27" fill="#ad8b6e"/>${[0,1,2].map(i=>circle(188+i*13,133-i*16,14,['#d8af69','#c7896f','#efcf91'][i],'stroke="#b78d61"')).join('')}`);
  return svg(`<path d="M77 147V56l37-24 37 24v91m-58 0V75h42v72m16 0V80h65v67M65 147h167" stroke="#87928a" stroke-width="3"/><path d="M103 87h23m-23 15h23m-23 15h23m42-19h35m-35 16h35m-35 16h35" stroke="#a9b5a7" stroke-width="5"/>`);
}
let category='all';const input=document.querySelector('#search'),grid=document.querySelector('#game-grid');
function render(){
  const keyword=input.value.trim().toLocaleLowerCase();
  const list=games.filter(game=>(category==='all'||game.category===category)&&`${game.name} ${game.english} ${game.id} ${game.tag}`.toLocaleLowerCase().includes(keyword));
  grid.innerHTML=list.map(game=>`<a class="game-card ${game.color}" href="/boardgame/${game.id}/" data-game="${game.id}" aria-label="打开${game.name}"><div class="card-art">${artwork(game.art)}<span class="art-word">${game.english}</span></div><div class="card-copy"><p class="card-tag">${game.tag}</p><h3>${game.name}<span aria-hidden="true">↗</span></h3><p class="card-description">${game.description}</p></div></a>`).join('');
  document.querySelector('#empty').hidden=list.length!==0;
  document.querySelector('#results').textContent=`显示 ${list.length} 款游戏`;
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});render();}));
input.addEventListener('input',render);
document.querySelector('#reset').addEventListener('click',()=>{input.value='';document.querySelector('[data-filter="all"]').click();input.focus();});
document.addEventListener('click',event=>{const card=event.target.closest('[data-game]');if(card)try{localStorage.setItem('boardgame:last-game:v1',card.dataset.game);}catch{}});
try{const previous=games.find(game=>game.id===localStorage.getItem('boardgame:last-game:v1'));if(previous){const link=document.querySelector('#last-game');link.textContent=`接着玩 · ${previous.name} ↗`;link.href=`/boardgame/${previous.id}/`;link.hidden=false;}}catch{}
render();
