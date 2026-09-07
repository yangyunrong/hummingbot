import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadiness, evaluateRuntimeRisk } from '../src/risk-engine.js';

const config={marketStaleMs:2000,clockSkewHardMs:1500,apiErrorHardLimit:3,dailyLossLimitUsdt:2,riskHard:90};
const base={publicWs:true,privateWs:true,marketDataAgeMs:0,clockSkewMs:0,reconciliationAmbiguous:false,selfCrossGuardFailed:false,apiErrorStreak:0,dailyPnl:0,riskRate:0,inventoryPolicy:{allowBid:true,allowAsk:true}};

for (const [name, patch, reason] of [
  ['public ws',{publicWs:false},'PUBLIC_WS_OFFLINE'],
  ['private ws',{privateWs:false},'PRIVATE_WS_OFFLINE'],
  ['stale market',{marketDataAgeMs:2001},'MARKET_STALE'],
  ['clock skew',{clockSkewMs:1501},'CLOCK_SKEW_HIGH'],
  ['reconciliation',{reconciliationAmbiguous:true},'RECONCILIATION_AMBIGUOUS'],
  ['self cross',{selfCrossGuardFailed:true},'SELF_CROSS_GUARD'],
  ['api streak',{apiErrorStreak:3},'API_ERROR_STREAK'],
  ['daily loss',{dailyPnl:-2},'DAILY_LOSS_LIMIT'],
  ['risk hard',{riskRate:90},'RISK_RATE_HARD_LIMIT'],
]) test(`${name} hard-disarms`,()=>{ const r=evaluateRuntimeRisk({...base,...patch},config); assert.equal(r.state,'DISARMED'); assert.equal(r.reason,reason); assert.equal(r.ok,false); });

test('soft inventory remains running with de-risk side policy',()=>{ const r=evaluateRuntimeRisk({...base,inventoryPolicy:{allowBid:true,allowAsk:true,softBreached:true}},config); assert.equal(r.state,'RUNNING'); assert.equal(r.ok,true); });
test('hard long inventory keeps reducing side only',()=>{ const r=evaluateRuntimeRisk({...base,inventoryPolicy:{allowBid:false,allowAsk:true,hardBreached:true}},config); assert.equal(r.state,'RISK_REDUCE'); assert.equal(r.allowBid,false); assert.equal(r.allowAsk,true); });
test('readiness returns READY only when guards pass',()=>{ const r=evaluateReadiness(base,{...config,liveEnabled:true}); assert.equal(r.ok,true); assert.equal(r.state,'READY'); });
