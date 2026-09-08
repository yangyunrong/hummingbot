import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveMakerGateway, normalizeBridgeAccountSnapshot } from "../src/gateway.js";

const executor={snapshot:()=>({bid:null,ask:null,metrics:{}}),reconcile:()=>({}),cancelOwned:async()=>{},applyDesiredQuotes:async()=>{throw new Error("SHOULD_NOT_TRADE_WHILE_DISARMED")}};

test("normalizes V5 singular position into V4.8 positions array",()=>{
  const x=normalizeBridgeAccountSnapshot({position:{side:"LONG",positionValue:7.94,position:0.0001,avgPrice:79369.9,leverage:50,riskRate:12.03,liquidationPrice:77951.5}});
  assert.equal(x.positions.length,1); assert.equal(x.positions[0].side,"LONG"); assert.equal(x.positions[0].positionValue,7.94); assert.equal(x.positions[0].leverage,50);
});

test("DISARMED market monitoring still calculates micro/fair without placing orders",async()=>{
  const accountProvider={snapshot:async()=>({positions:[]}),openOrders:async()=>[]};
  const g=new AdaptiveMakerGateway({executor,accountProvider,connectivity:()=>({publicWs:true,privateWs:true})});
  await g.onBookTicker({topic:"bookTicker",data:{s:"BTC-SWAP-USDT",b:"79000",a:"79001",bq:"10",aq:"8"}},Date.now());
  const t=g.telemetrySnapshot(); assert.equal(g.status().state,"DISARMED"); assert.ok(t.micro_price>0); assert.ok(t.fair_price>0);
});

test("safe account refresh exposes existing high leverage inventory while DISARMED",async()=>{
  const accountProvider={snapshot:async()=>({position:{side:"LONG",positionValue:7.94,position:0.0001,leverage:50,riskRate:12.03,liquidationPrice:77951.5}}),openOrders:async()=>[]};
  const g=new AdaptiveMakerGateway({executor,accountProvider});
  assert.equal(await g.refreshAccountTruth(),true); const t=g.telemetrySnapshot(); assert.equal(g.status().state,"DISARMED"); assert.equal(t.long_inventory_notional,7.94); assert.equal(t.gross_inventory_notional,7.94);
});
