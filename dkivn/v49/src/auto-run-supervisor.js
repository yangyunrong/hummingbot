import {classifyRunStopReason} from './run-intent.js';

const ACTIVE=new Set(['RUNNING','RISK_REDUCE']);
const HARD_CAPABILITY=new Set(['CREDENTIAL_NOT_PROVISIONED','LIVE_DISABLED','TRADE_NOT_DECLARED']);

export class AutoRunSupervisor{
  constructor({runtime,store,intervalMs=1000,retryBaseMs=3000,retryMaxMs=60000,now=()=>Date.now()}={}){
    if(!runtime||!store)throw new Error('SUPERVISOR_DEPENDENCY_REQUIRED');
    Object.assign(this,{runtime,store,intervalMs,retryBaseMs,retryMaxMs,now});
    this.timer=null;this.retryCount=0;this.nextRetryAt=0;this.inFlight=false;
  }
  initialize(){
    const saved=this.store.load();
    if(saved.settings&&Object.keys(saved.settings).length)this.runtime.setSettings(saved.settings);
    if(!this.timer)this.timer=setInterval(()=>this.tick().catch(()=>{}),this.intervalMs);
    return this.status();
  }
  close(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  status(){const persisted=this.store.load();return{...this.runtime.status(),desiredState:persisted.desiredState,autoRunEnabled:persisted.desiredState==='RUNNING',autoRetryAt:this.nextRetryAt||null};}
  saveSettings(settings={}){const applied=this.runtime.setSettings(settings);this.store.setSettings(applied);return applied;}
  async start(settings={}){const applied=this.saveSettings(settings);this.store.setDesiredState('RUNNING');this.retryCount=0;this.nextRetryAt=0;return this.#attempt('start',applied);}
  async resume(settings={}){return this.start(settings);}
  async pause(){this.store.setDesiredState('PAUSED');this.retryCount=0;this.nextRetryAt=0;return this.runtime.pause();}
  async disarm(reason='MANUAL_DISARM'){this.store.setDesiredState('DISARMED');this.retryCount=0;this.nextRetryAt=0;return this.runtime.stop(reason);}
  async tick(){
    if(this.inFlight)return this.status();
    const desired=this.store.load();
    if(desired.desiredState!=='RUNNING')return this.status();
    const current=this.runtime.status();
    if(ACTIVE.has(String(current.state).toUpperCase()))return this.status();
    const reason=String(current.reason||current.lastStopReason||'').toUpperCase();
    if(reason&&classifyRunStopReason(reason)==='HARD'){
      this.store.setDesiredState('DISARMED');return this.status();
    }
    const cap=current.capability||{};
    if(cap.ok===false&&HARD_CAPABILITY.has(String(cap.reason||'').toUpperCase())){
      this.store.setDesiredState('DISARMED');return this.status();
    }
    if(this.now()<this.nextRetryAt)return this.status();
    return this.#attempt('recover',desired.settings||{});
  }
  async #attempt(method,settings){
    if(this.inFlight)return this.status();
    this.inFlight=true;
    try{
      const fn=method==='recover'?this.runtime.recover:this.runtime.start;if(typeof fn!=='function')throw new Error(`RUNTIME_${method.toUpperCase()}_UNAVAILABLE`);const result=await fn.call(this.runtime,settings);
      const state=String(result?.state||'').toUpperCase(),reason=String(result?.reason||'').toUpperCase();
      if(ACTIVE.has(state)){this.retryCount=0;this.nextRetryAt=0;return this.status();}
      if(reason&&classifyRunStopReason(reason)==='HARD'){
        this.store.setDesiredState('DISARMED');this.retryCount=0;this.nextRetryAt=0;return this.status();
      }
      this.#backoff();return this.status();
    }catch{
      this.#backoff();return this.status();
    }finally{this.inFlight=false;}
  }
  #backoff(){this.retryCount+=1;const delay=Math.min(this.retryMaxMs,this.retryBaseMs*Math.max(1,2**(this.retryCount-1)));this.nextRetryAt=this.now()+delay;}
}