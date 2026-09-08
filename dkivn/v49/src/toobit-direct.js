import {buildV2JsonRequest,buildSignedFormRequest,buildSignedQuery,normalizeResponse} from './v2-transport.js';

export class ToobitDirectClient {
  constructor({apiKey,secret,fetchImpl=fetch,baseUrl='https://api.toobit.com'}={}){if(!apiKey||!secret)throw new Error('CREDENTIAL_REQUIRED');Object.assign(this,{apiKey,secret,fetchImpl,baseUrl});}
  async #send(req){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),7000);try{const r=await this.fetchImpl(req.url,{method:req.method,headers:req.headers,body:req.body,cache:'no-store',signal:ctl.signal});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={message:text.slice(0,240)}}const n=normalizeResponse(r.status,data);if(!n.ok){const e=new Error(n.message||`TOOBIT_${n.code??r.status}`);e.code=n.code??r.status;e.response=data;throw e;}return data?.data??data;}finally{clearTimeout(timer);}}
  #q(path,{method='GET',params={}}={}){return buildSignedQuery({path,method,params,apiKey:this.apiKey,secret:this.secret,baseUrl:this.baseUrl});}
  #j(path,body,{method='POST',category}={}){return buildV2JsonRequest({path,method,body,apiKey:this.apiKey,secret:this.secret,category,baseUrl:this.baseUrl});}
  #f(path,params,{method='POST'}={}){return buildSignedFormRequest({path,method,params,apiKey:this.apiKey,secret:this.secret,baseUrl:this.baseUrl});}
  balance(){return this.#send(this.#q('/api/v1/futures/balance'));}
  positions(symbol='BTC-SWAP-USDT'){return this.#send(this.#q('/api/v1/futures/positions',{params:{symbol}}));}
  commission(symbol='BTC-SWAP-USDT'){return this.#send(this.#q('/api/v1/futures/commissionRate',{params:{symbol}}));}
  todayPnl(){return this.#send(this.#q('/api/v1/futures/todayPnl',{params:{category:'USDT'}}));}
  openOrders(symbol='BTC-SWAP-USDT'){return this.#send(this.#q('/api/v2/futures/open-orders',{params:{symbol,limit:1000,category:'USDT'}}));}
  order(clientOrderId){return this.#send(this.#q('/api/v2/futures/order',{params:{origClientOrderId:clientOrderId,category:'USDT'}}));}
  createListenKey(){return this.#send(this.#q('/api/v1/listenKey',{method:'POST',params:{category:'USDT'}}));}
  keepaliveListenKey(listenKey){return this.#send(this.#q('/api/v1/listenKey',{method:'PUT',params:{listenKey,category:'USDT'}}));}
  closeListenKey(listenKey){return this.#send(this.#q('/api/v1/listenKey',{method:'DELETE',params:{listenKey,category:'USDT'}}));}
  async place(order){
    const params={symbol:order.symbol,side:order.side,positionSide:order.positionSide,type:'LIMIT',newClientOrderId:order.clientOrderId,valueQuantity:String(order.valueQuantity),price:String(order.price),timeInForce:'POST_ONLY',category:'USDT'};
    try{return await this.#send(this.#f('/api/v2/futures/order',params));}
    catch(e){
      if(![-1004,-1102].includes(Number(e?.code)))throw e;
      const {category,...body}=params;
      return this.#send(this.#j('/api/v2/futures/order',body,{category}));
    }
  }
  update(order){return this.#send(this.#f('/api/v2/futures/order/update',{origClientOrderId:order.origClientOrderId||order.clientOrderId,newClientOrderId:order.clientOrderId,valueQuantity:String(order.valueQuantity),price:String(order.price),category:'USDT'}));}
  cancel(clientOrderId){return this.#send(this.#q('/api/v2/futures/order',{method:'DELETE',params:{origClientOrderId:clientOrderId,category:'USDT'}}));}
  flashClose(symbol='BTC-SWAP-USDT',side='LONG',clientOrderId){return this.#send(this.#q('/api/v1/futures/flashClose',{method:'POST',params:{symbol,side,clientOrderId:clientOrderId||`DKV49C_${Date.now()}`,category:'USDT'}}));}
}

export function rows(data){return Array.isArray(data)?data:(Array.isArray(data?.data)?data.data:[]);}