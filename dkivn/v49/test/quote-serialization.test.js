import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SingleFlightRunner} from '../src/single-flight.js';
import {inventorySnapshot,inventoryPolicy,buildDesiredQuotes,evaluateRisk} from '../src/maker-core.js';

test('single-flight coalesces burst triggers and never overlaps quote cycles', async()=>{
  let running=0,maxRunning=0,runs=0,release;
  const firstGate=new Promise(r=>{release=r});
  const runner=new SingleFlightRunner(async()=>{
    running++; maxRunning=Math.max(maxRunning,running); runs++;
    if(runs===1) await firstGate;
    await new Promise(r=>setTimeout(r,2));
    running--;
  });
  const calls=Array.from({length:20},()=>runner.trigger());
  await new Promise(r=>setTimeout(r,5));
  assert.equal(maxRunning,1);
  release();
  await Promise.all(calls);
  assert.equal(maxRunning,1);
  assert.ok(runs>=1&&runs<=2,`expected coalesced 1-2 runs, got ${runs}`);
});

test('50x hedge inventory reduces LONG and SHORT independently instead of stalling at net zero',()=>{
  const snap=inventorySnapshot([
    {side:'LONG',positionValue:23.5406,leverage:50,avgPrice:78468.7},
    {side:'SHORT',positionValue:47.0987,leverage:50,avgPrice:78497.9}
  ]);
  const policy=inventoryPolicy(snap,{hardInventoryUsdt:200,softInventoryUsdt:100,maxLeverageForDualSide:20});
  assert.equal(policy.reduceOnly,true);
  assert.equal(policy.allowBid,true,'BUY SHORT close must be allowed');
  assert.equal(policy.allowAsk,true,'SELL LONG close must be allowed');
  assert.equal(policy.reduceSide,'BOTH');
  assert.equal(policy.bidReduceNotionalCap,47.0987);
  assert.equal(policy.askReduceNotionalCap,23.5406);
  const risk=evaluateRisk({publicWs:true,privateWs:true,marketDataAgeMs:10,apiErrorStreak:0,dailyPnl:0,riskRate:0,inventoryPolicy:policy},{dailyLossLimitUsdt:2});
  const q=buildDesiredQuotes({market:{bestBid:78500,bestAsk:78500.1},fair:78500.05,inventory:{...policy,allowBid:risk.allowBid,allowAsk:risk.allowAsk},config:{quoteNotional:10,minQuoteNotional:5,minNetEdgeBps:4},tickSize:.1,feeBps:1.2,adverseSelectionBps:1});
  assert.ok(q.bid); assert.ok(q.ask);
  assert.equal(q.bid.notional,10); assert.equal(q.ask.notional,10);
});

test('live runtime routes all quote triggers through SingleFlightRunner',()=>{
  const src=fs.readFileSync(new URL('../src/live-runtime.js',import.meta.url),'utf8');
  assert.match(src,/SingleFlightRunner/);
  assert.match(src,/quoteRunner\.trigger/);
  assert.doesNotMatch(src,/changed&&this\.started\)this\.#quote\(\)/);
});
