import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderExecutor } from '../src/order-executor.js';

class FakeTransport {
  constructor(){ this.calls=[]; }
  async place(o){ this.calls.push(['place',o]); return {...o,status:'NEW'}; }
  async update(o){ this.calls.push(['update',o]); return {...o,status:'NEW'}; }
  async cancel(id){ this.calls.push(['cancel',id]); return {clientOrderId:id,status:'CANCELED'}; }
}
const config={minQuoteLifeMs:2500,requoteBps:2,quoteNotional:10};

test('reconcile adopts only DKV48M orders and preserves manual', () => {
  const t=new FakeTransport(); const e=new OrderExecutor({transport:t,config});
  const r=e.reconcile([{clientOrderId:'manual-1',side:'BUY',price:99},{clientOrderId:'DKV48M_b1',side:'BUY',price:100,time:1000}]);
  assert.equal(r.manualCount,1); assert.equal(r.ownedCount,1); assert.equal(e.snapshot().bid.clientOrderId,'DKV48M_b1');
});

test('missing desired quote creates one POST_ONLY order', async () => {
  const t=new FakeTransport(); const e=new OrderExecutor({transport:t,config});
  await e.applyDesiredQuotes({bid:{side:'BUY',price:100,notional:10,timeInForce:'POST_ONLY',type:'LIMIT'},ask:null},10000);
  assert.equal(t.calls[0][0],'place');
  assert.equal(t.calls[0][1].timeInForce,'POST_ONLY');
  assert.match(t.calls[0][1].clientOrderId,/^DKV48M_/);
});

test('materially different mature quote amends instead of cancel-new', async () => {
  const t=new FakeTransport(); const e=new OrderExecutor({transport:t,config,tickSize:0.01});
  e.reconcile([{clientOrderId:'DKV48M_b1',side:'BUY',price:100,time:1000}]);
  await e.applyDesiredQuotes({bid:{side:'BUY',price:100.1,notional:10,timeInForce:'POST_ONLY',type:'LIMIT'},ask:null},5000);
  assert.equal(t.calls[0][0],'update');
  assert.equal(t.calls.some(c=>c[0]==='cancel'),false);
});

test('two owned bids are reconciliation ambiguity', () => {
  const e=new OrderExecutor({transport:new FakeTransport(),config});
  assert.throws(()=>e.reconcile([{clientOrderId:'DKV48M_1',side:'BUY'},{clientOrderId:'DKV48M_2',side:'BUY'}]),/AMBIGUOUS_OWNED_ORDERS/);
});

test('cancelOwned only emits cancels for owned prefix', async () => {
  const t=new FakeTransport(); const e=new OrderExecutor({transport:t,config});
  e.reconcile([{clientOrderId:'manual-1',side:'SELL'},{clientOrderId:'DKV48M_a1',side:'SELL',price:101}]);
  await e.cancelOwned('TEST');
  assert.deepEqual(t.calls,[['cancel','DKV48M_a1']]);
});
