import fs from 'node:fs';
import path from 'node:path';

const VALID=new Set(['RUNNING','PAUSED','DISARMED']);
const HARD=new Set(['MANUAL_DISARM','MANUAL_PAUSE','DAILY_LOSS_LIMIT','RISK_RATE_HARD_LIMIT','CREDENTIAL_REMOVED','LIVE_DISABLED','TRADE_NOT_DECLARED']);

export function classifyRunStopReason(reason=''){
  return HARD.has(String(reason).toUpperCase())?'HARD':'TRANSIENT';
}

export class RunIntentStore{
  constructor({file='/etc/dkivn-v49/run-state.json'}={}){this.file=file;}
  load(){
    try{
      const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));
      const desiredState=VALID.has(String(raw?.desiredState).toUpperCase())?String(raw.desiredState).toUpperCase():'DISARMED';
      return{desiredState,settings:raw?.settings&&typeof raw.settings==='object'?raw.settings:{},updatedAt:raw?.updatedAt||null};
    }catch(e){if(e?.code!=='ENOENT')throw e;return{desiredState:'DISARMED',settings:{},updatedAt:null};}
  }
  #write(next){
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o750});
    const tmp=`${this.file}.tmp`;
    const payload={...next,updatedAt:new Date().toISOString()};
    fs.writeFileSync(tmp,JSON.stringify(payload),{mode:0o640});
    fs.renameSync(tmp,this.file);
    return payload;
  }
  setDesiredState(state){
    const desiredState=String(state||'').toUpperCase();
    if(!VALID.has(desiredState))throw new Error('INVALID_DESIRED_STATE');
    const cur=this.load();return this.#write({...cur,desiredState});
  }
  setSettings(settings={}){const cur=this.load();return this.#write({...cur,settings:{...cur.settings,...settings}});}
}
