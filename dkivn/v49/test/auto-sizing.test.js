import test from 'node:test';
import assert from 'node:assert/strict';
import {autoQuoteSizing} from '../src/maker-core.js';

test('100U at 50x and 70% utilization sizes near 52.5U per side',()=>{
  const s=autoQuoteSizing({balance:100,available:100,leverage:50,capitalUtilization:.7,inventory:{grossInventoryNotional:0,netInventoryNotional:0},openOrderExposure:0,baseQuoteNotional:10,minQuoteNotional:5,maxQuoteNotional:100,slicePct:.015,allowBid:true,allowAsk:true,reduceOnly:false});
  assert.equal(s.mode,'AUTO');
  assert.equal(s.baseQuoteNotional,52.5);
  assert.equal(s.bidQuoteNotional,52.5);
  assert.equal(s.askQuoteNotional,52.5);
});

test('zero available margin blocks new exposure',()=>{
  const s=autoQuoteSizing({balance:100,available:0,leverage:50,capitalUtilization:.7,inventory:{grossInventoryNotional:0,netInventoryNotional:0},openOrderExposure:0,baseQuoteNotional:10,minQuoteNotional:5,maxQuoteNotional:100,slicePct:.015,allowBid:true,allowAsk:true,reduceOnly:false});
  assert.equal(s.bidQuoteNotional,0);
  assert.equal(s.askQuoteNotional,0);
});