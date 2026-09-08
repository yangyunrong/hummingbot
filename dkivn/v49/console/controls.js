(()=>{
  function injectStrategyControls(){
    const primary=document.querySelector('#primaryAction');
    if(!primary||document.querySelector('#strategyControls'))return;
    const wrap=document.createElement('div');
    wrap.id='strategyControls';
    wrap.className='strategy-controls';
    wrap.innerHTML=`
      <button id="pauseAction" class="control-button" type="button">暫停</button>
      <button id="resumeAction" class="control-button" type="button">恢復</button>
      <button id="disarmAction" class="control-button warn-control" type="button">DISARM</button>
      <button id="flatAction" class="control-button danger-control" type="button">全部平倉</button>
      <p class="strategy-control-note">DISARM 只撤 DKV49M_ Bot 掛單；全部平倉會以 Toobit 市價平掉目前 BTC 倉位。</p>`;
    primary.insertAdjacentElement('afterend',wrap);
    document.querySelector('#pauseAction').onclick=pauseMaker;
    document.querySelector('#resumeAction').onclick=resumeMaker;
    document.querySelector('#disarmAction').onclick=disarmMaker;
    document.querySelector('#flatAction').onclick=flatPosition;
  }

  function localSnapshot(){try{return lastLocal||null}catch{return null}}
  function updateStrategyControls(){
    injectStrategyControls();
    const d=localSnapshot();
    const primary=document.querySelector('#primaryAction'),pause=document.querySelector('#pauseAction'),resume=document.querySelector('#resumeAction'),disarm=document.querySelector('#disarmAction'),flat=document.querySelector('#flatAction');
    if(!pause||!resume||!disarm||!flat)return;
    if(!d){pause.disabled=resume.disabled=disarm.disabled=flat.disabled=true;return;}
    const state=String(d.state||'DISARMED').toUpperCase();
    const desired=String(d.desiredState||'DISARMED').toUpperCase();
    const active=['RUNNING','RISK_REDUCE'].includes(state),paused=state==='PAUSED',autoRecover=desired==='RUNNING'&&!active&&!paused;
    const gross=Number(d.inventory?.grossInventoryNotional||0);
    if(primary&&autoRecover){primary.disabled=true;primary.textContent='AUTO RUN · 自動恢復中';}
    pause.disabled=!active;
    resume.disabled=!paused;
    disarm.disabled=desired!=='RUNNING'&&state==='DISARMED'&&Number(d.openBotOrders||0)===0;
    flat.disabled=!d.credentialBound||!(gross>0.0001);
    flat.textContent=gross>0.0001?`全部平倉 ${gross.toFixed(2)} U`:'全部平倉';
  }

  async function pauseMaker(){
    try{const d=await localCall('/strategy/pause',{method:'POST',body:{}});toast('策略已暫停，Bot 掛單已撤銷');if(d.runtime)renderLocalStatus(d.runtime);await refreshOrders();}
    catch(e){toast('暫停失敗：'+e.message)}finally{updateStrategyControls()}
  }
  async function resumeMaker(){
    try{const d=await localCall('/strategy/resume',{method:'POST',body:{settings:runtimeSettingsPayload()}});toast('策略已恢復');if(d.runtime)renderLocalStatus(d.runtime);await refreshOrders();}
    catch(e){toast('恢復失敗：'+e.message)}finally{updateStrategyControls()}
  }
  async function disarmMaker(){
    if(!confirm('DISARM 會停止策略並撤銷所有 DKV49M_ Bot 掛單，但不會平倉。確定繼續？'))return;
    try{const d=await localCall('/strategy/disarm',{method:'POST',body:{}});toast('已 DISARM，Auto Run 已關閉，Bot 掛單已撤銷');if(d.runtime)renderLocalStatus(d.runtime);await refreshOrders();}
    catch(e){toast('DISARM 失敗：'+e.message)}finally{updateStrategyControls()}
  }
  async function flatPosition(){
    const d=localSnapshot(),gross=Number(d?.inventory?.grossInventoryNotional||0);
    if(!(gross>0))return toast('目前沒有可平倉的 BTC 倉位');
    if(!confirm(`這會先停止 Maker 並關閉 Auto Run，再用 Toobit 市價平掉目前約 ${gross.toFixed(2)} U 的 BTC 倉位。此操作會立即影響實盤資產。確定全部平倉？`))return;
    try{const r=await localCall('/position/flash-close',{method:'POST',body:{confirm:'CLOSE_ALL_BTC'}});toast(`平倉指令已送出 · ${Number(r.closed||0)} 個倉位`);await new Promise(x=>setTimeout(x,900));await refreshLocalStatus();await refreshOrders();}
    catch(e){toast('平倉失敗：'+e.message)}finally{updateStrategyControls()}
  }

  injectStrategyControls();
  updateStrategyControls();
  setInterval(updateStrategyControls,700);
})();
