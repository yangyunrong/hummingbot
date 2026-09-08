import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../console/index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../console/app.css",import.meta.url),"utf8");
const js=readFileSync(new URL("../console/app.js",import.meta.url),"utf8");
const ids=["quoteNotionalInput","baseSpreadInput","minEdgeInput","inventoryRiskInput","capitalUtilInput","leverageInput","requoteInput","quoteLifeInput","orderAgeInput","dailyLossInput","dualSideMaxLevInput","monthlyTargetInput","saveStrategySettings"];

test("strategy parameters are editable numeric inputs",()=>{
  for(const id of ids)assert.match(html,new RegExp(`id=[\\\"']${id}[\\\"']`),id);
  assert.match(html,/type="number"/);
});

test("desktop and mobile layouts are both explicitly supported",()=>{
  assert.match(css,/@media\s*\(min-width:\s*980px\)/);
  assert.match(css,/grid-template-columns:\s*220px\s+minmax\(0,1fr\)/);
  assert.match(css,/position:\s*fixed/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
});

test("settings persist through dedicated V49 settings API",()=>{
  assert.match(js,/\/v49-settings\//);
  assert.match(js,/loadStrategySettings/);
  assert.match(js,/saveStrategySettings/);
  assert.match(js,/capitalUtilization/);
  assert.match(js,/requestedLeverage/);
  assert.match(js,/baseQuoteNotional/);
});
