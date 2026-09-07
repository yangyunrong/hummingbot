import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AdaptiveMakerGateway } from '../src/gateway.js';

const required = [
  'fair_price','micro_price','depth_imbalance','short_volatility',
  'maker_bid_price','maker_ask_price','maker_bid_notional','maker_ask_notional',
  'long_inventory_notional','short_inventory_notional','net_inventory_notional','gross_inventory_notional',
  'quote_age_bid_ms','quote_age_ask_ms','fill_count','maker_fill_count','maker_fill_rate',
  'amend_count','cancel_count','cancel_to_fill_ratio','estimated_adverse_selection_bps',
  'estimated_net_edge_bps','last_reject_code','last_reject_message','last_reject_at'
];

class FakeExecutor {
  reconcile(){ return {ownedCount:0,manualCount:0}; }
  async applyDesiredQuotes(){}
  async cancelOwned(){}
  snapshot(){ return {bid:null,ask:null,metrics:{amendCount:0,cancelCount:0,createCount:0}}; }
}
class FakeAccount { async snapshot(){ return {positions:[],todayPnl:0,position:{riskRate:0},balance:{availableBalance:100}}; } async openOrders(){ return []; } }

test('gateway emits full V4.8 maker telemetry contract', () => {
  const g = new AdaptiveMakerGateway({
    config:{symbol:'BTC-SWAP-USDT',botPrefix:'DKV48M_',quoteNotional:10,softInventoryUsdt:10,hardInventoryUsdt:20,minQuoteLifeMs:2500,requoteBps:2,marketStaleMs:2000,clockSkewHardMs:1500,apiErrorHardLimit:3,dailyLossLimitUsdt:2,riskHard:90,liveEnabled:false},
    executor:new FakeExecutor(), accountProvider:new FakeAccount(), connectivity:()=>({publicWs:true,privateWs:true}), tickSize:0.1
  });
  const t = g.telemetrySnapshot(1000);
  for (const key of required) assert.ok(Object.hasOwn(t,key), `missing telemetry field ${key}`);
});

test('console preserves existing modules and adds V4.8 maker panel', async () => {
  const html = await readFile(new URL('../console/index.html', import.meta.url), 'utf8');
  for (const id of ['terminal','api','risk','market','strategy','arbitrage','exchanges','settings']) assert.match(html, new RegExp(`id=["']${id}["']`));
  for (const id of ['mkFair','mkMicro','mkImb','mkVol','mkBid','mkAsk','mkLong','mkShort','mkNet','mkFillRate','mkCancelFill','mkNetEdge','mkReject']) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html,/DKIVN · BTC ADAPTIVE MAKER TERMINAL V4\.8/);
  assert.match(html,/DKV48M_/);
});

test('migration is additive and declares all new maker telemetry columns', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/20260908090000_v48_maker_telemetry.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql,/drop\s+(table|column)|alter\s+column/i);
  for (const key of required) assert.match(sql, new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${key}\\b`,'i'));
});
