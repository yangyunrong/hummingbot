import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=()=>readFileSync(new URL('../console/index.html',import.meta.url),'utf8');
const css=()=>readFileSync(new URL('../console/app.css',import.meta.url),'utf8');
const js=()=>readFileSync(new URL('../console/app.js',import.meta.url),'utf8');

test('V4.9 has exactly five primary mobile tabs',()=>{
  const s=html();
  for(const id of ['overview','strategy','orders','risk','more']) assert.ok(s.includes(`data-tab="${id}"`),id);
  assert.equal((s.match(/class="tab-btn/g)||[]).length,5);
});

test('mobile shell uses safe areas and fixed bottom navigation without page overflow',()=>{
  const s=html(),c=css();
  assert.ok(s.includes('viewport-fit=cover'));
  assert.ok(c.includes('env(safe-area-inset-bottom)'));
  assert.ok(c.includes('overflow-x:hidden'));
  assert.ok(c.includes('.bottom-nav'));
});

test('overview prioritizes equity, strategy state and one primary action',()=>{
  const s=html();
  for(const id of ['equityValue','availableValue','todayPnlValue','positionValue','strategyState','primaryAction']) assert.ok(s.includes(`id="${id}"`),id);
  assert.equal((s.match(/id="primaryAction"/g)||[]).length,1);
});

test('START gating exposes explicit blocker reason instead of fake activation',()=>{
  const s=js();
  for(const reason of ['EXECUTOR_OFFLINE','LIVE_DISABLED','TRADE_NOT_VERIFIED','PUBLIC_WS_OFFLINE','PRIVATE_WS_OFFLINE']) assert.ok(s.includes(reason),reason);
  assert.ok(s.includes('btn.disabled=!lastCapability.ok'));
});
