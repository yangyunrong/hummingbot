import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const js=fs.readFileSync(new URL('../console/app.js',import.meta.url),'utf8');
test('V49 UI is wired to Tokyo local executor',()=>{assert.match(js,/LOCAL_API\s*=\s*['"]\/v49-local/);assert.match(js,/\/strategy\/start/);assert.match(js,/\/strategy\/disarm/);assert.match(js,/localCall/);});
test('Tokyo credential bind is local, password-only, and not persisted in browser storage',()=>{assert.match(js,/\/credential\/bind/);assert.match(js,/type="password"/);assert.doesNotMatch(js,/localStorage|sessionStorage/);});
test('strategy save synchronizes dedicated settings API and Tokyo runtime',()=>{assert.match(js,/SETTINGS_API/);assert.match(js,/\/settings/);assert.match(js,/maxLeverageForDualSide/);assert.match(js,/maxDualSideLeverage/);});
