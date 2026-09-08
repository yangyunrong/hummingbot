import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const controls=fs.readFileSync(new URL('../console/controls.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../src/control-server.js',import.meta.url),'utf8');
test('strategy lifecycle controls expose pause resume disarm and flat',()=>{for(const id of ['pauseAction','resumeAction','disarmAction','flatAction'])assert.match(controls,new RegExp(id));for(const path of ['/strategy/pause','/strategy/resume','/strategy/disarm','/position/flash-close'])assert.ok(controls.includes(path),path)});
test('flash close endpoint requires explicit confirmation and clears auto-run before closing',()=>{assert.ok(server.includes("'/position/flash-close'"));assert.ok(server.includes("'CLOSE_ALL_BTC'"));assert.ok(server.includes("supervisor.disarm('MANUAL_FLAT')"));assert.ok(server.includes('runtime.client.flashClose'))});
test('auto-run recovery is visible and DISARM stays available while desired RUNNING',()=>{assert.match(controls,/desiredState/);assert.match(controls,/AUTO RUN · 自動恢復中/);assert.match(controls,/desired===['"]RUNNING['"]/);});
