import test from 'node:test';
import assert from 'node:assert/strict';
import {ToobitDirectClient} from '../src/toobit-direct.js';

function okResponse(payload={code:200,msg:'success',data:{}}){return{status:200,async text(){return JSON.stringify(payload)}}}

test('single order uses signed form wire with symbol and POST_ONLY',async()=>{
  let seen=null;
  const client=new ToobitDirectClient({apiKey:'key12345',secret:'secret123',fetchImpl:async(url,opts)=>{seen={url,opts};return okResponse({code:200,msg:'success',data:{clientOrderId:'x'}})}});
  await client.place({symbol:'BTC-SWAP-USDT',side:'SELL',positionSide:'LONG',clientOrderId:'DKV49M_x',valueQuantity:'7.93',price:'79000.1'});
  assert.equal(seen.opts.headers['Content-Type'],'application/x-www-form-urlencoded');
  assert.match(seen.opts.body,/symbol=BTC-SWAP-USDT/);
  assert.match(seen.opts.body,/side=SELL/);
  assert.match(seen.opts.body,/positionSide=LONG/);
  assert.match(seen.opts.body,/timeInForce=POST_ONLY/);
  assert.match(seen.opts.body,/signature=/);
});

test('flash close is explicit signed POST with symbol and position side',async()=>{
  let seen=null;
  const client=new ToobitDirectClient({apiKey:'key12345',secret:'secret123',fetchImpl:async(url,opts)=>{seen={url,opts};return okResponse({code:200,msg:'success',data:{orderId:'1'}})}});
  await client.flashClose('BTC-SWAP-USDT','LONG','DKV49C_test');
  assert.equal(seen.opts.method,'POST');
  assert.match(seen.url,/\/api\/v1\/futures\/flashClose\?/);
  assert.match(seen.url,/symbol=BTC-SWAP-USDT/);
  assert.match(seen.url,/side=LONG/);
});

test('reduce-only exact contract quantity omits valueQuantity',async()=>{
  let seen=null;
  const client=new ToobitDirectClient({apiKey:'key12345',secret:'secret123',fetchImpl:async(url,opts)=>{seen={url,opts};return okResponse({code:200,msg:'success',data:{clientOrderId:'x'}})}});
  await client.place({symbol:'BTC-SWAP-USDT',side:'BUY',positionSide:'SHORT',clientOrderId:'DKV49M_tail',quantity:'0.1',price:'78300.0'});
  assert.match(seen.opts.body,/quantity=0.1/);
  assert.doesNotMatch(seen.opts.body,/valueQuantity=/);
});
