const API='/api';
const SETTINGS_API='/v49-settings/';
const LOCAL_API='/v49-local';
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=(v,d=2)=>num(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let token='',adminConfigured=false,strategySettingsLoaded=false,lastTelemetry={},lastRuntime={},lastLocal=null,lastCapability={ok:false,reason:'EXECUTOR_STATUS_UNAVAILABLE'};

function toast(message){const e=q('#toast');if(!e)return;e.textContent=message;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),2400)}
async function request(url,options={}){const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(options.body!==undefined)headers['Content-Type']='application/json';const r=await fetch(url,{method:options.method||'GET',headers,cache:'no-store',body:options.body!==undefined?JSON.stringify(options.body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.message||data.error||`HTTP ${r.status}`);e.status=r.status;e.data=data;throw e}return data}
const call=(path,options={})=>request(API+path,options);
const settingsCall=(options={})=>request(SETTINGS_API,options);
const localCall=(path,options={})=>request(LOCAL_API+path,options);
function setText(id,value){const e=q(id);if(e)e.textContent=value}
function setInput(id,value){const e=q(id);if(e)e.value=Number.isFinite(Number(value))?String(value):''}
function setStateClass(el,state){if(!el)return;el.classList.remove('up','warn','danger');if(['READY','RUNNING','VERIFIED','ONLINE','RISK_REDUCE'].includes(state))el.classList.add('up');else if(['LOCKED','PAUSED','UNVERIFIED'].includes(state))el.classList.add('warn');else if(['DISARMED','OFFLINE','ERROR'].includes(state))el.classList.add('danger')}

const reasonText={
  EXECUTOR_STATUS_UNAVAILABLE:'Tokyo Executor 狀態尚未取得',
  CREDENTIAL_NOT_PROVISIONED:'Tokyo Trading API 尚未綁定，請到「更多」完成綁定',
  LIVE_DISABLED:'Live execution 目前被安全鎖定',
  TRADE_NOT_DECLARED:'Trade 權限尚未宣告',
  TRADE_NOT_VERIFIED:'Trade 權限尚未完成實盤驗證',
  PUBLIC_WS_OFFLINE:'Public WebSocket 未就緒',
  PRIVATE_WS_OFFLINE:'Private WebSocket 未就緒',
  MARKET_STALE:'市場行情過期，等待新行情',
  READY_TRADE_UNVERIFIED:'Executor 已就緒；第一筆 Toobit 接受的 POST_ONLY 會完成 Trade 驗證',
  READY:'所有實盤前置條件已通過',
  MAKER_ACTIVE:'Adaptive Maker 正在執行',
  INVENTORY_HARD_LIMIT:'高風險既有倉位：目前只允許減倉方向 Maker',
  MANUAL_DISARM:'策略已停止',
  MANUAL_PAUSE:'策略已暫停'
};

function runtimeSettingsPayload(s=readStrategyForm()){
  return{...s,quoteNotional:s.baseQuoteNotional,maxLeverageForDualSide:s.maxDualSideLeverage};
}

function renderLocalStatus(d={}){
  lastLocal=d;
  const cap=d.capability||{ok:false,reason:d.reason||'EXECUTOR_STATUS_UNAVAILABLE'};
  lastCapability={ok:!!cap.ok,reason:String(cap.reason||d.reason||'EXECUTOR_STATUS_UNAVAILABLE')};
  const stateName=String(d.state||'DISARMED').toUpperCase();
  const active=['RUNNING','RISK_REDUCE'].includes(stateName),paused=stateName==='PAUSED';
  const state=q('#strategyState'),btn=q('#primaryAction');
  if(state){state.textContent=active?stateName:paused?'PAUSED':lastCapability.ok?'READY':'LOCKED';setStateClass(state,active?stateName:paused?'PAUSED':lastCapability.ok?'READY':'LOCKED')}
  if(btn){btn.disabled=!active&&!paused&&!lastCapability.ok;btn.classList.toggle('running',active);btn.textContent=active?'停止策略':paused?'恢復策略':lastCapability.ok?'啟動策略':'尚未可啟動'}
  setText('#strategyReason',active?(reasonText[d.reason]||d.reason||'策略執行中'):paused?'策略已暫停，所有 DKV49M_ 掛單已撤銷。':reasonText[lastCapability.reason]||lastCapability.reason);
  const cp=q('#connectionPill'),connected=!!d.publicWs&&(d.credentialBound?!!d.privateWs:true);if(cp){cp.textContent=connected?'● 已連線':'● 連線檢查';setStateClass(cp,connected?'ONLINE':'OFFLINE')}
  setText('#publicWsValue',d.publicWs?'READY':'OFFLINE');setStateClass(q('#publicWsValue'),d.publicWs?'READY':'OFFLINE');
  setText('#privateWsValue',d.credentialBound?(d.privateWs?'READY':'OFFLINE'):'待綁定');setStateClass(q('#privateWsValue'),d.privateWs?'READY':'OFFLINE');
  const positions=d.account?.positions||[],risk=Math.max(0,...positions.map(p=>num(p.riskRate))),inv=num(d.inventory?.grossInventoryNotional);
  setText('#riskValue',fmt(risk));setText('#positionValue',`${fmt(inv)} U`);setText('#inventoryValue',`${fmt(inv)} U`);
  if(d.account){setText('#equityValue',fmt(d.account.balance));setText('#availableValue',`${fmt(d.account.available)} U`);setText('#todayPnlValue',`${fmt(d.account.todayPnl)} U`)}
  setText('#fairValue',d.fairPrice?fmt(d.fairPrice):'—');
  const pos=positions.find(p=>num(p.positionValue)>0)||positions[0]||{};setText('#leverageValue',pos.leverage?`${fmt(pos.leverage,0)}×`:'—');
  setText('#runtimeValue',`${stateName}${d.reason?' · '+d.reason:''}`);setText('#liquidationValue',pos.liquidationPrice?fmt(pos.liquidationPrice):'—');
  setText('#upnlValue',`${fmt(positions.reduce((s,p)=>s+num(p.unrealizedPnl),0))} U`);setText('#apiErrorValue',String(d.apiErrorStreak??0));
  updateLocalApiPanel(d);
}

function renderTelemetry(data){lastTelemetry=data.telemetry||{};lastRuntime=data.runtime||{};const t=lastTelemetry;if(!lastLocal?.fairPrice)setText('#fairValue',t.fair_price?fmt(t.fair_price):'—');setText('#microValue',t.micro_price?fmt(t.micro_price):'—');setText('#imbalanceValue',t.depth_imbalance!=null?`${fmt(num(t.depth_imbalance)*100,1)}%`:'—')}
async function refreshTelemetry(){try{renderTelemetry(await call('/telemetry'))}catch{}}
async function refreshLocalStatus(){if(!token)return null;try{const d=await localCall('/status');renderLocalStatus(d);return d}catch(e){lastLocal=null;lastCapability={ok:false,reason:'EXECUTOR_STATUS_UNAVAILABLE'};const state=q('#strategyState');if(state){state.textContent='LOCKED';setStateClass(state,'LOCKED')}const btn=q('#primaryAction');if(btn){btn.disabled=true;btn.textContent='尚未可啟動'}setText('#strategyReason','Tokyo Executor 無法讀取：'+e.message);return null}}

function renderStrategySettings(s={}){setInput('#quoteNotionalInput',s.baseQuoteNotional);setInput('#baseSpreadInput',s.baseSpreadBps);setInput('#minEdgeInput',s.minNetEdgeBps);setInput('#inventoryRiskInput',s.inventoryRisk);setInput('#capitalUtilInput',num(s.capitalUtilization)*100);setInput('#leverageInput',s.requestedLeverage);setInput('#requoteInput',s.requoteBps);setInput('#quoteLifeInput',num(s.minQuoteLifeMs)/1000);setInput('#orderAgeInput',num(s.maxOrderAgeMs)/1000);setInput('#dailyLossInput',s.dailyLossLimitUsdt);setInput('#dualSideMaxLevInput',s.maxDualSideLeverage);setInput('#monthlyTargetInput',s.monthlyVolumeTarget);strategySettingsLoaded=true;const stamp=s.updatedAt?new Date(s.updatedAt).toLocaleString('zh-TW',{hour12:false}):'預設值';setText('#settingsStatus',`已載入 · ${stamp}`)}
function readStrategyForm(){return{baseQuoteNotional:num(q('#quoteNotionalInput')?.value),baseSpreadBps:num(q('#baseSpreadInput')?.value),minNetEdgeBps:num(q('#minEdgeInput')?.value),inventoryRisk:num(q('#inventoryRiskInput')?.value),capitalUtilization:num(q('#capitalUtilInput')?.value)/100,requestedLeverage:num(q('#leverageInput')?.value),requoteBps:num(q('#requoteInput')?.value),minQuoteLifeMs:Math.round(num(q('#quoteLifeInput')?.value)*1000),maxOrderAgeMs:Math.round(num(q('#orderAgeInput')?.value)*1000),dailyLossLimitUsdt:num(q('#dailyLossInput')?.value),maxDualSideLeverage:num(q('#dualSideMaxLevInput')?.value),monthlyVolumeTarget:num(q('#monthlyTargetInput')?.value)}}
async function loadStrategySettings(){if(!token)return;setText('#settingsStatus','載入中…');try{const d=await settingsCall(),s=d.settings||{};renderStrategySettings(s);await localCall('/settings',{method:'POST',body:runtimeSettingsPayload(s)}).catch(()=>{});return s}catch(e){setText('#settingsStatus','載入失敗');toast('策略參數讀取失敗：'+e.message);throw e}}
async function saveStrategySettings(event){event?.preventDefault();const btn=q('#saveStrategySettings');if(btn)btn.disabled=true;setText('#settingsStatus','儲存中…');try{const d=await settingsCall({method:'POST',body:readStrategyForm()}),s=d.settings||{};renderStrategySettings(s);await localCall('/settings',{method:'POST',body:runtimeSettingsPayload(s)});toast('策略參數已儲存並同步 Tokyo Executor');return s}catch(e){setText('#settingsStatus','儲存失敗');toast('策略參數儲存失敗：'+e.message);throw e}finally{if(btn)btn.disabled=false}}

async function refreshDiagnostics(){try{const d=await call('/account-diagnostics'),a=d.account||{},b=a.balance||{},p=Array.isArray(a.positions)?a.positions[0]:a.position||{};if(!lastLocal?.credentialBound){setText('#equityValue',fmt(b.balance));setText('#availableValue',`${fmt(b.availableBalance)} U`)}if(!lastLocal?.account?.positions?.length)setText('#leverageValue',p?.leverage?`${fmt(p.leverage,0)}×`:'—')}catch{}}
async function refreshOrders(){if(!token)return;try{const d=await localCall('/orders'),rows=d.orders||[],card=q('#ordersCard');if(!rows.length){card.className='detail-card empty-state';card.textContent='目前沒有 DKV49M_ Bot Orders';return}card.className='detail-card';card.innerHTML=rows.map(o=>`<div class="detail-row"><span>${esc(o.side||'—')} · ${esc(o.status||'—')}</span><b>${o.price?fmt(o.price):'—'} · ${o.valueQuantity?fmt(o.valueQuantity)+' U':''}</b></div>`).join('')}catch(e){q('#ordersCard').textContent='訂單讀取失敗：'+e.message}}

function ensureLocalApiPanel(){if(q('#localApiPanel'))return;const page=q('[data-page="more"]');if(!page)return;const panel=document.createElement('article');panel.id='localApiPanel';panel.className='settings-card local-api-card';panel.innerHTML=`<div class="settings-head"><div><span class="label">TOKYO EXECUTOR</span><h3>Trading API</h3></div><span id="localApiStatus" class="state-pill">NOT BOUND</span></div><p class="settings-note">這組 API 只存放在 Tokyo VPS 的 AES-256-GCM 加密檔。瀏覽器不保存 Secret；不需要 Withdraw 權限。</p><form id="localBindForm"><label class="field"><span>Toobit API Key</span><input id="localApiKey" type="password" autocomplete="off" placeholder="API Key"></label><label class="field"><span>Toobit Secret</span><input id="localSecret" type="password" autocomplete="new-password" placeholder="Secret"></label><button class="save-button" type="submit">驗證並綁定 Tokyo</button></form><div class="settings-savebar"><div><b id="localMaskedKey">尚未綁定</b><span>綁定成功後 Private WS 會自動連線</span></div><button id="deleteLocalCredential" class="ghost-button" type="button">刪除</button></div>`;page.appendChild(panel);q('#localBindForm').onsubmit=bindLocalCredential;q('#deleteLocalCredential').onclick=deleteLocalCredential}
function updateLocalApiPanel(d=lastLocal||{}){ensureLocalApiPanel();const st=q('#localApiStatus');if(st){st.textContent=d.credentialBound?(d.privateWs?'READY':'CONNECTING'):'NOT BOUND';setStateClass(st,d.credentialBound&&d.privateWs?'READY':d.credentialBound?'LOCKED':'OFFLINE')}setText('#localMaskedKey',d.maskedKey||'尚未綁定')}
async function bindLocalCredential(e){e.preventDefault();const apiKey=q('#localApiKey').value.trim(),secret=q('#localSecret').value.trim();if(apiKey.length<8||secret.length<8)return toast('API Key / Secret 格式不足');const btn=e.submitter;if(btn)btn.disabled=true;try{const d=await localCall('/credential/bind',{method:'POST',body:{apiKey,secret}});q('#localApiKey').value='';q('#localSecret').value='';toast('Tokyo Trading API 綁定成功');renderLocalStatus(d.runtime||await localCall('/status'));setTimeout(refreshLocalStatus,800)}catch(err){q('#localSecret').value='';toast('Tokyo API 綁定失敗：'+err.message)}finally{if(btn)btn.disabled=false}}
async function deleteLocalCredential(){if(!confirm('確定刪除 Tokyo Trading API？策略會立即停止。'))return;try{await localCall('/credential',{method:'DELETE'});toast('Tokyo Trading API 已刪除');await refreshLocalStatus()}catch(e){toast('刪除失敗：'+e.message)}}

async function bootstrap(){ensureLocalApiPanel();try{const s=await call('/system-status');adminConfigured=!!s.adminConfigured;q('#loginOverlay').classList.add('on')}catch{q('#loginError').textContent='系統狀態讀取失敗'}}
q('#loginForm').onsubmit=async e=>{e.preventDefault();q('#loginError').textContent='';try{const password=q('#password').value,d=await call(adminConfigured?'/auth-login':'/setup',{method:'POST',body:adminConfigured?{password}:{password}});token=d.sessionToken||'';q('#password').value='';q('#loginOverlay').classList.remove('on');await Promise.allSettled([refreshLocalStatus(),refreshTelemetry(),refreshDiagnostics(),refreshOrders(),loadStrategySettings()])}catch(err){q('#loginError').textContent='登入失敗：'+err.message}};

q('#primaryAction').onclick=async()=>{if(!lastLocal)return toast('Tokyo Executor 狀態尚未取得');const state=String(lastLocal.state||'').toUpperCase();try{if(['RUNNING','RISK_REDUCE'].includes(state)){await localCall('/strategy/disarm',{method:'POST',body:{}});toast('策略已停止，DKV49M_ 掛單已撤銷')}else if(state==='PAUSED'){await localCall('/strategy/resume',{method:'POST',body:{settings:runtimeSettingsPayload()}});toast('策略已恢復')}else{if(!lastCapability.ok)return toast(reasonText[lastCapability.reason]||lastCapability.reason);await localCall('/strategy/start',{method:'POST',body:{settings:runtimeSettingsPayload()}});toast('V4.9 Tokyo Executor 已啟動')}await refreshLocalStatus();await refreshOrders()}catch(e){toast('策略操作失敗：'+e.message);await refreshLocalStatus()}};
q('#strategySettingsForm').onsubmit=saveStrategySettings;q('#reloadStrategySettings').onclick=()=>loadStrategySettings().catch(()=>{});
qa('.tab-btn').forEach(button=>button.onclick=()=>{qa('.tab-btn').forEach(x=>x.classList.toggle('active',x===button));qa('.page').forEach(page=>page.classList.toggle('active',page.dataset.page===button.dataset.tab));if(button.dataset.tab==='orders')refreshOrders();if(button.dataset.tab==='strategy'&&!strategySettingsLoaded)loadStrategySettings().catch(()=>{});if(button.dataset.tab==='more')updateLocalApiPanel()});
qa('[data-more]').forEach(button=>button.onclick=()=>{if(button.dataset.more==='api'){q('#localApiPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return}toast(`${button.textContent.trim()} 會接續整合到這個 V4.9 介面`)});
setInterval(()=>token&&Promise.allSettled([refreshLocalStatus(),refreshTelemetry()]),2000);setInterval(()=>token&&refreshDiagnostics(),10000);
bootstrap();
