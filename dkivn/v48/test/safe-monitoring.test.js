import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SafeMonitor, normalizeBridgeAccountSnapshot } from "../src/safe-monitor.js";

test("normalizes V5 singular position into V4.8 positions array",()=>{const x=normalizeBridgeAccountSnapshot({position:{side:"LONG",positionValue:7.94,position:0.0001,avgPrice:79369.9,leverage:50,riskRate:12.03,liquidationPrice:77951.5}});assert.equal(x.positions.length,1);assert.equal(x.positions[0].side,"LONG");assert.equal(x.positions[0].positionValue,7.94);assert.equal(x.positions[0].leverage,50);});
test("DISARMED safe monitor calculates micro/fair",async()=>{const m=new SafeMonitor({accountProvider:{snapshot:async()=>({positions:[]})},connectivity:()=>({publicWs:true,privateWs:true})});await m.onBookTicker({topic:"bookTicker",data:{s:"BTC-SWAP-USDT",b:"79000",a:"79001",bq:"10",aq:"8"}},Date.now());const t=m.telemetrySnapshot();assert.equal(t.strategy_status,"DISARMED");assert.ok(t.micro_price>0);assert.ok(t.fair_price>0);});
test("safe account refresh exposes high leverage inventory",async()=>{const m=new SafeMonitor({accountProvider:{snapshot:async()=>({position:{side:"LONG",positionValue:7.94,position:0.0001,leverage:50,riskRate:12.03,liquidationPrice:77951.5}})}});assert.equal(await m.refreshAccountTruth(),true);const t=m.telemetrySnapshot();assert.equal(t.long_inventory_notional,7.94);assert.equal(t.gross_inventory_notional,7.94);});
test("safe monitor production source contains no order write routes",()=>{const s=readFileSync(new URL("../src/safe-monitor.js",import.meta.url),"utf8");for(const p of ["/maker/place","/maker/update","/maker/cancel"])assert.equal(s.includes(p),false,p);});
