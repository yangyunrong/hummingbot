import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RunIntentStore,classifyRunStopReason} from '../src/run-intent.js';
import {AutoRunSupervisor} from '../src/auto-run-supervisor.js';

test('RUNNING intent and last strategy settings survive process restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dkivn-v49-intent-'));
  const file=path.join(dir,'run-state.json');
  const a=new RunIntentStore({file});
  assert.equal(a.load().desiredState,'DISARMED');
  a.setDesiredState('RUNNING');
  a.setSettings({quoteNotional:12.5,requoteBps:1.8,requestedLeverage:10});
  const b=new RunIntentStore({file});
  const state=b.load();
  assert.equal(state.desiredState,'RUNNING');
  assert.equal(state.settings.quoteNotional,12.5);
  assert.equal(state.settings.requoteBps,1.8);
  assert.equal(state.settings.requestedLeverage,10);
  fs.rmSync(dir,{recursive:true,force:true});
});

test('manual pause/disarm and hard risk never auto resume, transient transport faults may recover',()=>{
  for(const reason of ['MANUAL_DISARM','MANUAL_PAUSE','DAILY_LOSS_LIMIT','RISK_RATE_HARD_LIMIT','CREDENTIAL_REMOVED'])assert.equal(classifyRunStopReason(reason),'HARD',reason);
  for(const reason of ['PUBLIC_WS_OFFLINE','PRIVATE_WS_OFFLINE','MARKET_STALE','API_ERROR_STREAK','SERVICE_SHUTDOWN'])assert.equal(classifyRunStopReason(reason),'TRANSIENT',reason);
});

test('supervisor retries transient DISARMED runtime while desired state remains RUNNING',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dkivn-v49-supervisor-'));
  const store=new RunIntentStore({file:path.join(dir,'run-state.json')});
  let attempts=0,current={state:'DISARMED',reason:'MARKET_STALE',capability:{ok:true,reason:'READY'}};
  const runtime={
    settings:{quoteNotional:10},
    setSettings(s){this.settings={...this.settings,...s};return this.settings;},
    status(){return current;},
    async start(){attempts++;current=attempts===1?{state:'DISARMED',reason:'MARKET_STALE',capability:{ok:true,reason:'READY'}}:{state:'RUNNING',reason:'MAKER_ACTIVE',capability:{ok:true,reason:'READY'}};return current;},
    async pause(){return{state:'PAUSED',reason:'MANUAL_PAUSE'};},
    async stop(reason){return{state:'DISARMED',reason};}
  };
  const sup=new AutoRunSupervisor({runtime,store,retryBaseMs:0,retryMaxMs:0});
  store.setDesiredState('RUNNING');
  await sup.tick();
  await sup.tick();
  assert.equal(attempts,2);
  assert.equal(store.load().desiredState,'RUNNING');
  fs.rmSync(dir,{recursive:true,force:true});
});

test('hard runtime stop clears RUNNING intent instead of auto restarting',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dkivn-v49-hard-'));
  const store=new RunIntentStore({file:path.join(dir,'run-state.json')});
  store.setDesiredState('RUNNING');
  let attempts=0;
  const runtime={settings:{},setSettings(){return{};},status(){return{state:'DISARMED',reason:'DAILY_LOSS_LIMIT',capability:{ok:true,reason:'READY'}};},async start(){attempts++;return this.status();},async pause(){},async stop(){}};
  const sup=new AutoRunSupervisor({runtime,store,retryBaseMs:0,retryMaxMs:0});
  await sup.tick();
  assert.equal(attempts,0);
  assert.equal(store.load().desiredState,'DISARMED');
  fs.rmSync(dir,{recursive:true,force:true});
});

test('control server routes lifecycle through persistent auto-run supervisor',()=>{
  const src=fs.readFileSync(new URL('../src/control-server.js',import.meta.url),'utf8');
  assert.match(src,/AutoRunSupervisor/);
  assert.match(src,/supervisor\.start/);
  assert.match(src,/supervisor\.pause/);
  assert.match(src,/supervisor\.resume/);
  assert.match(src,/supervisor\.disarm/);
  assert.match(src,/supervisor\.status/);
});
