import {classifyRunStopReason} from './run-intent.js';

const ACTIVE=new Set(['RUNNING','RISK_REDUCE']);
const RUNTIME_OWNED=new Set(['RECOVERING']);
const HARD_CAPABILITY=new Set(['CREDENTIAL_NOT_PROVISIONED','LIVE_DISABLED','TRADE_NOT_DECLARED']);

export class AutoRunSupervisor{
  constructor({runtime,store,intervalMs=1000}={}){
    if(!runtime||!store)throw new Error('SUPERVISOR_DEPENDENCY_REQUIRED');
    Object.assign(this,{runtime,store,intervalMs});
    this.timer=null;this.inFlight=false;this.bootstrapRecoveryAttempted=false;
  }
  initialize(){
    const saved=this.store.load();
    if(saved.settings&&Object.keys(saved.settings).length)this.runtime.setSettings(saved.settings);
    if(!this.timer)this.timer=setInterval(()=>this.tick().catch(()=>{}),this.intervalMs);
    return this.status();
  }
  close(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  status(){const persisted=this.store.load();return{...this.runtime.status(),desiredState:persisted.desiredState,autoRunEnabled:persisted.desiredState==='RUNNING',autoRetryAt:null};}
  saveSettings(settings={}){const applied=this.runtime.setSettings(settings);this.store.setSettings(applied);return applied;}
  async start(settings={}){
    const applied=this.saveSettings(settings);
    this.store.setDesiredState('RUNNING');
    this.bootstrapRecoveryAttempted=false;
    return this.#invoke('start',applied);
  }
  async resume(settings={}){return this.start(settings);}
  async pause(){this.store.setDesiredState('PAUSED');this.bootstrapRecoveryAttempted=false;return this.runtime.pause();}
  async disarm(reason='MANUAL_DISARM'){this.store.setDesiredState('DISARMED');this.bootstrapRecoveryAttempted=false;return this.runtime.stop(reason);}
  async tick(){
    if(this.inFlight)return this.status();
    const desired=this.store.load();
    if(desired.desiredState!=='RUNNING')return this.status();
    const current=this.runtime.status();
    const state=String(current.state||'').toUpperCase();
    if(ACTIVE.has(state)||RUNTIME_OWNED.has(state))return this.status();
    const reason=String(current.reason||current.lastStopReason||'').toUpperCase();
    if(reason&&classifyRunStopReason(reason)==='HARD'){
      this.store.setDesiredState('DISARMED');return this.status();
    }
    const cap=current.capability||{};
    if(cap.ok===false){
      if(HARD_CAPABILITY.has(String(cap.reason||'').toUpperCase()))this.store.setDesiredState('DISARMED');
      return this.status();
    }
    if(this.bootstrapRecoveryAttempted){
      this.store.setDesiredState('DISARMED');return this.status();
    }
    this.bootstrapRecoveryAttempted=true;
    const out=await this.#invoke('recover',desired.settings||{});
    const after=String(out?.state||'').toUpperCase();
    if(!ACTIVE.has(after)&&!RUNTIME_OWNED.has(after))this.store.setDesiredState('DISARMED');
    return this.status();
  }
  async #invoke(method,settings){
    if(this.inFlight)return this.status();
    this.inFlight=true;
    try{
      const fn=method==='recover'?this.runtime.recover:this.runtime.start;
      if(typeof fn!=='function')throw new Error(`RUNTIME_${method.toUpperCase()}_UNAVAILABLE`);
      return await fn.call(this.runtime,settings);
    }catch(e){
      if(method==='recover')this.store.setDesiredState('DISARMED');
      throw e;
    }finally{this.inFlight=false;}
  }
}
