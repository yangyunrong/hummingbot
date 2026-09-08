import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { MarketDataEngine } from "./market-data.js";
import { microPrice, fairPrice, RollingVolatility } from "./fair-value.js";
import { inventorySnapshot } from "./inventory.js";

const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

export function normalizeBridgeAccountSnapshot(raw={}){
  const p=raw?.position||{};
  const active=Math.abs(finite(p.positionValue??p.notional))+Math.abs(finite(p.position??p.positionQty));
  const positions=Array.isArray(raw?.positions)?raw.positions:(active>0?[{...p,side:String(p.side??p.positionSide??"").toUpperCase(),positionSide:String(p.positionSide??p.side??"").toUpperCase(),positionValue:finite(p.positionValue??p.notional),position:finite(p.position??p.positionQty),avgPrice:finite(p.avgPrice??p.entryPrice),riskRate:finite(p.riskRate),unrealizedPnl:finite(p.unrealizedPnl??p.unrealizedPnL),realizedPnl:finite(p.realizedPnl??p.realizedPnL),liquidationPrice:finite(p.liquidationPrice??p.flp),leverage:finite(p.leverage)}]:[]);
  return {...raw,positions,position:p};
}

export class SafeMonitor{
  constructor({config=loadConfig(),marketData=new MarketDataEngine(config.symbol),accountProvider,connectivity=()=>({publicWs:false,privateWs:false}),clockSkewMs=()=>0,feeBps=1.2,adverseSelectionBps=1,imbalanceBps=2}={}){
    if(!accountProvider)throw new Error("ACCOUNT_PROVIDER_REQUIRED");
    Object.assign(this,{config,marketData,accountProvider,connectivity,clockSkewMs,feeBps,adverseSelectionBps,imbalanceBps});
    this.volatility=new RollingVolatility(30);this.account={positions:[],position:{},balance:{},todayPnl:0};this.lastMicro=null;this.lastFair=null;this.lastReject={code:null,message:null,at:null};this.reason="LIVE_DISABLED";
  }
  #derive(now=Date.now()){try{const m=this.marketData.snapshot(now);this.lastMicro=microPrice(m);this.lastFair=fairPrice(m,m.depthImbalance,this.imbalanceBps);}catch{}return true;}
  async onBookTicker(payload,recvMs=Date.now()){const ok=this.marketData.onBookTicker(payload,recvMs);if(!ok)return false;const m=this.marketData.snapshot(recvMs);if(m.midPrice)this.volatility.push(m.midPrice);this.#derive(recvMs);return true;}
  async onDiffDepth(payload,recvMs=Date.now()){const ok=this.marketData.onDiffDepth(payload,recvMs);if(!ok)return false;this.#derive(recvMs);return true;}
  async refreshAccountTruth(){try{this.account=normalizeBridgeAccountSnapshot(await this.accountProvider.snapshot());return true;}catch(e){this.lastReject={code:e?.code??null,message:String(e?.message||e).slice(0,180),at:new Date().toISOString()};return false;}}
  telemetrySnapshot(now=Date.now()){const m=this.marketData.snapshot(now),inv=inventorySnapshot(this.account.positions??[]),conn=this.connectivity();return{strategy_mode:"V48_SAFE_MONITOR",strategy_status:"DISARMED",fair_price:this.lastFair,micro_price:this.lastMicro,depth_imbalance:m.depthImbalance,short_volatility:this.volatility.valueBps(),maker_bid_price:null,maker_ask_price:null,maker_bid_notional:null,maker_ask_notional:null,long_inventory_notional:inv.longInventoryNotional,short_inventory_notional:inv.shortInventoryNotional,net_inventory_notional:inv.netInventoryNotional,gross_inventory_notional:inv.grossInventoryNotional,quote_age_bid_ms:null,quote_age_ask_ms:null,fill_count:0,maker_fill_count:0,maker_fill_rate:0,amend_count:0,cancel_count:0,cancel_to_fill_ratio:0,estimated_adverse_selection_bps:this.adverseSelectionBps,estimated_net_edge_bps:null,last_reject_code:this.lastReject.code,last_reject_message:this.lastReject.message,last_reject_at:this.lastReject.at,bid:m.bestBid,ask:m.bestAsk,mid:m.midPrice,public_ws_connected:Boolean(conn.publicWs),private_ws_connected:Boolean(conn.privateWs),open_bot_orders:0,inventory_value:inv.grossInventoryNotional,buy_quote_price:null,sell_quote_price:null,buy_quote_notional:null,sell_quote_notional:null,net_edge_bps:null};}
  runtimeSnapshot(now=Date.now()){const conn=this.connectivity(),m=this.marketData.snapshot(now),inv=inventorySnapshot(this.account.positions??[]),positions=this.account.positions??[],riskRate=Math.max(...positions.map(p=>finite(p.riskRate)),finite(this.account.position?.riskRate));return{state:"DISARMED",reason:this.reason,manual_rearm_required:true,public_ws_connected:Boolean(conn.publicWs),private_ws_connected:Boolean(conn.privateWs),last_market_at:Number.isFinite(m.marketDataAgeMs)?new Date(now-m.marketDataAgeMs).toISOString():null,risk_rate:riskRate,daily_pnl:finite(this.account.todayPnl),unrealized_pnl:positions.reduce((s,p)=>s+finite(p.unrealizedPnl),0),realized_pnl:positions.reduce((s,p)=>s+finite(p.realizedPnl),0),position_value:inv.grossInventoryNotional,liquidation_price:finite(this.account.position?.liquidationPrice),open_bot_orders:0,api_error_streak:0};}
}

class BridgeClient{constructor(base,token){this.base=base;this.token=token;}async call(path,{method="GET",body}={}){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),7000);try{const r=await fetch(this.base+path,{method,headers:{Authorization:`Bearer ${this.token}`,Accept:"application/json",...(body!==undefined?{"Content-Type":"application/json"}:{})},body:body!==undefined?JSON.stringify(body):undefined,cache:"no-store",signal:ctl.signal});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(`${path}:${r.status}:${d.error||d.message||"ERR"}`);e.code=d.code??r.status;throw e;}return d;}finally{clearTimeout(timer);}}}
class BridgeAccountProvider{constructor(bridge){this.bridge=bridge;}async snapshot(){return normalizeBridgeAccountSnapshot(await this.bridge.call("/account-snapshot"));}}

export async function runSafeProduction(){
  const config=loadConfig(),bridgeUrl=process.env.DKIVN_BRIDGE_URL,token=process.env.DKIVN_GATEWAY_TOKEN;if(!bridgeUrl||!token)throw new Error("GATEWAY_ENV_MISSING");
  const bridge=new BridgeClient(bridgeUrl,token);await bridge.call("/health");const conn={publicWs:false,privateWs:false};let clockSkew=0,publicWs=null,privateWs=null,listenKey="",stopping=false;
  const monitor=new SafeMonitor({config,accountProvider:new BridgeAccountProvider(bridge),connectivity:()=>conn,clockSkewMs:()=>clockSkew,feeBps:finite(process.env.V48_MAKER_FEE_BPS,1.2),adverseSelectionBps:finite(process.env.V48_ADVERSE_SELECTION_BPS,1),imbalanceBps:finite(process.env.V48_IMBALANCE_BPS,2)});await monitor.refreshAccountTruth();
  const connectPublic=()=>{if(stopping)return;try{publicWs?.close();}catch{}publicWs=new WebSocket("wss://stream.toobit.com/quote/ws/v1");publicWs.onopen=()=>{conn.publicWs=true;publicWs.send(JSON.stringify({symbol:config.symbol,topic:"bookTicker",event:"sub"}));publicWs.send(JSON.stringify({symbol:config.symbol,topic:"diffDepth",event:"sub",params:{binary:false}}));};publicWs.onmessage=(ev)=>{let m;try{m=JSON.parse(String(ev.data));}catch{return;}const now=Date.now();if(m?.topic==="bookTicker"||m?.data?.e==="bookTicker")monitor.onBookTicker(m,now);else if(m?.topic==="diffDepth")monitor.onDiffDepth(m,now);};publicWs.onclose=()=>{conn.publicWs=false;if(!stopping)setTimeout(connectPublic,1500);};publicWs.onerror=()=>{conn.publicWs=false;};};
  const connectPrivate=async()=>{if(stopping||conn.privateWs)return;try{const d=await bridge.call("/listen-key",{method:"POST",body:{}});listenKey=String(d.listenKey||"");if(!listenKey)throw new Error("LISTEN_KEY_EMPTY");privateWs=new WebSocket(`wss://stream.toobit.com/api/v1/ws/${encodeURIComponent(listenKey)}`);privateWs.onopen=()=>{conn.privateWs=true;};privateWs.onmessage=()=>{monitor.refreshAccountTruth().catch(()=>{});};privateWs.onclose=()=>{conn.privateWs=false;listenKey="";if(!stopping)setTimeout(()=>connectPrivate().catch(()=>{}),1500);};privateWs.onerror=()=>{conn.privateWs=false;};}catch{conn.privateWs=false;if(!stopping)setTimeout(()=>connectPrivate().catch(()=>{}),5000);}};
  connectPublic();await connectPrivate();
  setInterval(()=>{try{if(publicWs?.readyState===1)publicWs.send(JSON.stringify({ping:Date.now()}));if(privateWs?.readyState===1)privateWs.send(JSON.stringify({ping:Date.now()}));}catch{}},30000);
  setInterval(()=>{if(listenKey)bridge.call("/listen-key",{method:"PUT",body:{listenKey}}).catch(()=>{});},25*60*1000);
  setInterval(async()=>{try{const s=Date.now(),r=await fetch("https://api.toobit.com/api/v1/time",{cache:"no-store"}),e=Date.now(),d=await r.json();if(Number.isFinite(Number(d.serverTime)))clockSkew=Number(d.serverTime)-(s+(e-s)/2);}catch{}},10000);
  setInterval(()=>monitor.refreshAccountTruth().catch(()=>{}),5000);
  setInterval(async()=>{try{const d=await bridge.call("/command"),c=d.command;if(!c)return;await bridge.call("/ack",{method:"POST",body:{id:c.id,state:"DISARMED"}});}catch{}},1000);
  setInterval(async()=>{try{await bridge.call("/telemetry",{method:"POST",body:monitor.telemetrySnapshot(Date.now())});await bridge.call("/runtime",{method:"POST",body:monitor.runtimeSnapshot(Date.now())});}catch{}},2000);
  const shutdown=async()=>{stopping=true;try{if(listenKey)await bridge.call("/listen-key",{method:"DELETE",body:{listenKey}});}catch{}try{publicWs?.close();privateWs?.close();}catch{}await sleep(50);process.exit(0);};process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);return monitor;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){runSafeProduction().catch(e=>{console.error("fatal",String(e?.message||e));process.exit(1);});}
