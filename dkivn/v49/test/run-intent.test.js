import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RunIntentStore,classifyRunStopReason} from '../src/run-intent.js';

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
  for(const reason of ['MANUAL_DISARM','MANUAL_PAUSE','DAILY_LOSS_LIMIT','RISK_RATE_HARD_LIMIT','CREDENTIAL_REMOVED']){
    assert.equal(classifyRunStopReason(reason),'HARD',reason);
  }
  for(const reason of ['PUBLIC_WS_OFFLINE','PRIVATE_WS_OFFLINE','MARKET_STALE','API_ERROR_STREAK','SERVICE_SHUTDOWN']){
    assert.equal(classifyRunStopReason(reason),'TRANSIENT',reason);
  }
});

test('runtime contract persists desired RUNNING and has a one-second auto supervisor',()=>{
  const src=fs.readFileSync(new URL('../src/live-runtime.js',import.meta.url),'utf8');
  assert.match(src,/RunIntentStore|runIntentStore/);
  assert.match(src,/setDesiredState\(['"]RUNNING['"]\)/);
  assert.match(src,/setDesiredState\(['"]PAUSED['"]\)/);
  assert.match(src,/setDesiredState\(['"]DISARMED['"]\)/);
  assert.match(src,/setInterval\([^\n]*#autoSupervisor[^\n]*1000/);
});
