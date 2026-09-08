import test from 'node:test';
import assert from 'node:assert/strict';
import { executionCapability } from '../src/execution-capability.js';

test('blocks START when executor is safe monitor',()=>{
  const x=executionCapability({executorMode:'V49_SAFE_MONITOR',liveEnabled:false,tradePermissionStatus:'VERIFIED',publicWs:true,privateWs:true});
  assert.equal(x.startAllowed,false); assert.equal(x.reason,'EXECUTOR_OFFLINE');
});

test('blocks START when trade permission is not verified',()=>{
  const x=executionCapability({executorMode:'V49_LIVE',liveEnabled:true,tradePermissionStatus:'DECLARED_UNVERIFIED',publicWs:true,privateWs:true});
  assert.equal(x.startAllowed,false); assert.equal(x.reason,'TRADE_NOT_VERIFIED');
});

test('blocks START when either websocket is offline',()=>{
  assert.equal(executionCapability({executorMode:'V49_LIVE',liveEnabled:true,tradePermissionStatus:'VERIFIED',publicWs:false,privateWs:true}).reason,'PUBLIC_WS_OFFLINE');
  assert.equal(executionCapability({executorMode:'V49_LIVE',liveEnabled:true,tradePermissionStatus:'VERIFIED',publicWs:true,privateWs:false}).reason,'PRIVATE_WS_OFFLINE');
});

test('allows START only when live executor and all prerequisites are ready',()=>{
  const x=executionCapability({executorMode:'V49_LIVE',liveEnabled:true,tradePermissionStatus:'VERIFIED',publicWs:true,privateWs:true});
  assert.deepEqual(x,{startAllowed:true,reason:'READY'});
});
