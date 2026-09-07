import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedFormRequest, normalizeToobitResponse } from '../src/toobit-transport.js';

test('single regular order serializes symbol into form body before signing', () => {
  const r = buildSignedFormRequest({
    path:'/api/v2/futures/order', method:'POST', apiKey:'k', secret:'s', timestamp:123,
    params:{symbol:'BTC-SWAP-USDT',side:'BUY',positionSide:'LONG',type:'LIMIT',newClientOrderId:'DKV48M_x',valueQuantity:'10.00',price:'79000.1',timeInForce:'POST_ONLY'}
  });
  assert.equal(r.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(r.body, /symbol=BTC-SWAP-USDT/);
  assert.match(r.body, /timeInForce=POST_ONLY/);
  assert.match(r.body, /timestamp=123/);
  assert.match(r.body, /signature=[0-9a-f]{64}/);
  assert.equal(r.url, 'https://api.toobit.com/api/v2/futures/order');
});

test('normalizes success and known error classes', () => {
  assert.deepEqual(normalizeToobitResponse(200,{code:200,msg:'success'}).ok, true);
  const auth = normalizeToobitResponse(401,{code:-2015,msg:'Rejected MBX key'});
  assert.equal(auth.ok, false); assert.equal(auth.retryable, false); assert.equal(auth.kind, 'AUTH_PERMISSION');
  const rate = normalizeToobitResponse(429,{code:-1003,msg:'Too many requests'});
  assert.equal(rate.retryable, true); assert.equal(rate.kind, 'RATE_LIMIT');
  const param = normalizeToobitResponse(400,{message:"Missing required parameter 'symbol'"});
  assert.equal(param.retryable, false); assert.equal(param.kind, 'PARAMETER_SERIALIZATION');
});
