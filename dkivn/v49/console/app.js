const API='/api';
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=(v,d=2)=>num(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
let token='',adminConfigured=false,tradePermissionStatus='UNKNOWN',lastRuntime={},lastTelemetry={},lastCapability={ok:false,reason:'EXECUTOR_OFFLINE'};

function toast(message){const e=q('#toast');e.textContent=message;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),2200)}
async function call(path,options={}){const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(options.body!==undefined)headers['Content-Type']='application/json';const r=await fetch(API+path,{method:options.method||'GET',headers,cache:'no-store',body:options.body!==undefined?JSON.stringify(options.body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||data.error||`HTTP ${r.status}`);return data}

function capability(x={}){
  const mode=String(x.executorMode||'').toUpperCase(),trade=String(x.tradePermissionStatus||'').toUpperCase();
  if(mode!=='V49_LIVE')return{ok:false,reason:'EXECUTOR_OFFLINE'};
  if(!x.liveEnabled)return{ok:false,reason:'LIVE_DISABLED'};
  if(trade!=='VERIFIED')return{ok:false,reason:'TRADE_NOT_VERIFIED'};
  if(!x.publicWs)return{ok:false,reason:'PUBLIC_WS_OFFLINE'};
  if(!x.privateWs)return{ok:false,reason:'PRIVATE_WS_OFFLINE'};
  return{ok:true,reason:'READY'};
}

const reasonText={EXECUTOR_OFFLINE:'實盤 Executor 尚未啟用',LIVE_DISABLED:'Live execution 目前被安全鎖定',TRADE_NOT_VERIFIED:'Trade 權限尚未完成實盤驗證',PUBLIC_WS_OFFLINE:'Public WebSocket 未就緒',PRIVATE_WS_OFFLINE:'Private WebSocket 未就緒',READY:'所有實盤前置條件已通過'};

function setText(id,value){const e=q(id);if(e)e.textContent=value}
function setStateClass(el,state){if(!el)return;el.classList.remove('up','warn','danger');if(['READY','RUNNING','VERIFIED','ONLINE'].includes(state))el.classList.add('up');else if(['LOCKED','PAUSED','RISK_REDUCE'].includes(state))el.classList.add('warn');else if(['DISARMED','OFFLINE','ERROR'].includes(state))el.classList.add('danger')}

function renderCapability(){
  const t=lastTelemetry,r=lastRuntime,mode=String(t.strategy_mode||'').toUpperCase();
  const liveEnabled=t.live_enabled===true||(mode==='V49_LIVE'&&String(r.reason||'').toUpperCase()!=='LIVE_DISABLED');
  lastCapability=capability({executorMode:mode,liveEnabled,tradePermissionStatus,publicWs:!!r.public_ws_connected,privateWs:!!r.private_ws_connected});
  const state=q('#strategyState'),btn=q('#primaryAction'),running=String(r.state||'').toUpperCase()==='RUNNING';
  if(running){state.textContent='RUNNING';setStateClass(state,'RUNNING');btn.disabled=false;btn.textContent='停止策略';btn.classList.add('running');setText('#strategyReason','Adaptive Maker 正在執行；停止會撤銷 Bot-owned orders 並回到 DISARMED。');return}
  state.textContent=lastCapability.ok?'READY':'LOCKED';setStateClass(state,lastCapability.ok?'READY':'LOCKED');btn.disabled=!lastCapability.ok;btn.textContent=lastCapability.ok?'啟動策略':'尚未可啟動';btn.classList.remove('running');setText('#strategyReason',reasonText[lastCapability.reason]||lastCapability.reason);
}

function renderTelemetry(data){
  lastTelemetry=data.telemetry||{};lastRuntime=data.runtime||{};const t=lastTelemetry,r=lastRuntime;
  const online=!!data.online,pub=!!r.public_ws_connected,priv=!!r.private_ws_connected;
  const cp=q('#connectionPill');cp.textContent=online&&pub&&priv?'● 已連線':'● 連線異常';setStateClass(cp,online&&pub&&priv?'ONLINE':'OFFLINE');
  setText('#todayPnlValue',`${fmt(r.daily_pnl)} U`);setText('#positionValue',`${fmt(t.gross_inventory_notional??r.position_value)} U`);
  setText('#publicWsValue',pub?'READY':'OFFLINE');setText('#privateWsValue',priv?'READY':'OFFLINE');setText('#riskValue',fmt(r.risk_rate));
  setStateClass(q('#publicWsValue'),pub?'READY':'OFFLINE');setStateClass(q('#privateWsValue'),priv?'READY':'OFFLINE');
  setText('#fairValue',t.fair_price?fmt(t.fair_price):'—');setText('#microValue',t.micro_price?fmt(t.micro_price):'—');setText('#imbalanceValue',t.depth_imbalance!=null?`${fmt(num(t.depth_imbalance)*100,1)}%`:'—');
  setText('#inventoryValue',`${fmt(t.gross_inventory_notional??r.position_value)} U`);setText('#runtimeValue',`${r.state||'—'}${r.reason?' · '+r.reason:''}`);setText('#liquidationValue',r.liquidation_price?fmt(r.liquidation_price):'—');setText('#upnlValue',`${fmt(r.unrealized_pnl)} U`);setText('#apiErrorValue',String(r.api_error_streak??0));
  renderCapability();
}

async function refreshTelemetry(){try{renderTelemetry(await call('/telemetry'))}catch(e){const cp=q('#connectionPill');cp.textContent='● 資料異常';setStateClass(cp,'ERROR')}}
async function refreshDiagnostics(){try{const d=await call('/account-diagnostics'),a=d.account||{},b=a.balance||{},p=Array.isArray(a.positions)?a.positions[0]:a.position||{};setText('#equityValue',fmt(b.balance));setText('#availableValue',`${fmt(b.availableBalance)} U`);setText('#leverageValue',p?.leverage?`${fmt(p.leverage,0)}×`:'—')}catch(e){toast('帳戶資料讀取失敗')}}
async function refreshCredential(){try{const d=await call('/credential-status');tradePermissionStatus=String(d.tradePermissionStatus||'UNKNOWN').toUpperCase();renderCapability()}catch{tradePermissionStatus='UNKNOWN'}}
async function refreshOrders(){try{const rows=(await call('/bot-orders?limit=30')).orders||[],card=q('#ordersCard');if(!rows.length){card.className='detail-card empty-state';card.textContent='目前沒有 Bot Orders';return}card.className='detail-card';card.innerHTML=rows.map(o=>`<div class="detail-row"><span>${o.side||'—'} · ${o.status||'—'}</span><b>${o.price?fmt(o.price):'—'} · ${o.requested_notional?fmt(o.requested_notional)+' U':''}</b></div>`).join('')}catch{}}

async function bootstrap(){
  try{const s=await call('/system-status');adminConfigured=!!s.adminConfigured;q('#loginOverlay').classList.add('on')}catch(e){q('#loginError').textContent='系統狀態讀取失敗'}
}

q('#loginForm').onsubmit=async e=>{e.preventDefault();q('#loginError').textContent='';try{const password=q('#password').value,d=await call(adminConfigured?'/auth-login':'/setup',{method:'POST',body:adminConfigured?{password}:{password}});token=d.sessionToken||'';q('#loginOverlay').classList.remove('on');await Promise.allSettled([refreshCredential(),refreshTelemetry(),refreshDiagnostics(),refreshOrders()])}catch(err){q('#loginError').textContent='登入失敗：'+err.message}};

q('#primaryAction').onclick=async()=>{
  const running=String(lastRuntime.state||'').toUpperCase()==='RUNNING';
  if(running){try{await call('/runtime-disarm',{method:'POST',body:{}});toast('已送出停止指令');setTimeout(refreshTelemetry,600)}catch(e){toast('停止失敗：'+e.message)}return}
  if(!lastCapability.ok){toast(reasonText[lastCapability.reason]||lastCapability.reason);return}
  try{await call('/strategy-command',{method:'POST',body:{action:'START'}});toast('啟動指令已送出');setTimeout(refreshTelemetry,800)}catch(e){toast('啟動失敗：'+e.message)}
};

qa('.tab-btn').forEach(button=>button.onclick=()=>{qa('.tab-btn').forEach(x=>x.classList.toggle('active',x===button));qa('.page').forEach(page=>page.classList.toggle('active',page.dataset.page===button.dataset.tab));if(button.dataset.tab==='orders')refreshOrders()});
qa('[data-more]').forEach(button=>button.onclick=()=>toast(`${button.textContent.trim()} 將在下一批接回完整頁面`));
setInterval(()=>token&&refreshTelemetry(),2000);setInterval(()=>token&&refreshDiagnostics(),10000);
bootstrap();
