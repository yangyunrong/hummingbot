import http from 'node:http';
import {CredentialStore} from './credential-store.js';
import {V49LiveRuntime} from './live-runtime.js';

const PORT=Number(process.env.V49_PORT||9490),HOST=process.env.V49_HOST||'127.0.0.1';
const CONTROL_BASE=process.env.V49_CONTROL_BASE||'https://txutcpmarsvsdcvgyhtu.supabase.co/functions/v1/dkivn-v45-control';
const store=new CredentialStore({masterKeyFile:process.env.V49_MASTER_KEY_FILE||'/etc/dkivn-v49/master.key',credentialFile:process.env.V49_CREDENTIAL_FILE||'/etc/dkivn-v49/credentials.enc'});
const runtime=new V49LiveRuntime({credentialStore:store,liveEnabled:String(process.env.V49_LIVE_ENABLED||'false').toLowerCase()==='true'});

const json=(res,status,data)=>{const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':Buffer.byteLength(body)});res.end(body);};
const tokenOf=req=>String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
async function parseBody(req){let raw='';for await(const c of req){raw+=c;if(raw.length>65536)throw new Error('BODY_TOO_LARGE');}try{return raw?JSON.parse(raw):{};}catch{throw new Error('INVALID_JSON');}}
async function controlCall(path,token){const r=await fetch(CONTROL_BASE+path,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`},cache:'no-store'});const d=await r.json().catch(()=>({}));return{ok:r.ok,data:d};}
async function requireAdmin(req){const token=tokenOf(req);if(!token)return null;const r=await controlCall('/session',token);return r.ok&&r.data?.authenticated===true?token:null;}
async function inheritedTradeStatus(token,apiKey){try{const r=await controlCall('/credential-status',token),last4=String(apiKey).slice(-4),masked=String(r.data?.maskedKey||'');return masked.endsWith(last4)&&String(r.data?.tradePermissionStatus||'').toUpperCase()==='VERIFIED'?'VERIFIED':'DECLARED_UNVERIFIED';}catch{return'DECLARED_UNVERIFIED';}}
async function flashCloseAll(){
 if(!runtime.client)throw Object.assign(new Error('Tokyo Trading API 尚未綁定'),{code:'CREDENTIAL_NOT_PROVISIONED'});
 await runtime.stop('MANUAL_FLAT');
 const positions=runtime.status().account?.positions||[];
 const active=positions.filter(p=>Math.abs(Number(p?.positionValue||0))>0.0001||Math.abs(Number(p?.position||0))>0.00000001);
 if(!active.length){runtime.state='DISARMED';runtime.reason='ALREADY_FLAT';return{closed:0,runtime:runtime.status()};}
 const results=[];
 for(const p of active){const side=String(p?.side||p?.positionSide||'').toUpperCase();if(!['LONG','SHORT'].includes(side))continue;const clientOrderId=`DKV49C_${Date.now()}_${side}`;const result=await runtime.client.flashClose(runtime.symbol,side,clientOrderId);results.push({side,orderId:String(result?.orderId??result?.data?.orderId??'')});}
 runtime.state='DISARMED';runtime.reason=results.length?'FLASH_CLOSE_SUBMITTED':'NO_CLOSEABLE_POSITION';
 return{closed:results.length,results,runtime:runtime.status()};
}

async function handler(req,res){const url=new URL(req.url,'http://local'),p=url.pathname;if(req.method==='OPTIONS')return json(res,204,{});if(p==='/health')return json(res,200,{ok:true,version:'4.9-local',executorMode:'V49_LIVE',liveEnabled:runtime.liveEnabled});const token=await requireAdmin(req);if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
 try{
  if(p==='/status'&&req.method==='GET')return json(res,200,{ok:true,...runtime.status()});
  if(p==='/credential/status'&&req.method==='GET')return json(res,200,{ok:true,...store.status()});
  if(p==='/credential/bind'&&req.method==='POST'){const b=await parseBody(req),apiKey=String(b.apiKey||'').trim(),secret=String(b.secret||'').trim();if(apiKey.length<8||secret.length<8)return json(res,400,{ok:false,error:'INVALID_CREDENTIAL_FORMAT'});const tradeStatus=await inheritedTradeStatus(token,apiKey);await runtime.bindCredential({apiKey,secret,tradeStatus});return json(res,200,{ok:true,...store.status(),runtime:runtime.status()});}
  if(p==='/credential'&&req.method==='DELETE'){await runtime.deleteCredential();return json(res,200,{ok:true,bound:false});}
  if(p==='/settings'&&req.method==='GET')return json(res,200,{ok:true,settings:runtime.settings});
  if(p==='/settings'&&req.method==='POST'){const b=await parseBody(req);return json(res,200,{ok:true,settings:runtime.setSettings(b)});}
  if(p==='/orders'&&req.method==='GET')return json(res,200,{ok:true,orders:await runtime.openBotOrders()});
  if(p==='/strategy/start'&&req.method==='POST'){const b=await parseBody(req),s=await runtime.start(b.settings||b);return json(res,s.state==='DISARMED'?409:200,{ok:s.state!=='DISARMED',runtime:s});}
  if(p==='/strategy/pause'&&req.method==='POST')return json(res,200,{ok:true,runtime:await runtime.pause()});
  if(p==='/strategy/resume'&&req.method==='POST'){const b=await parseBody(req);const s=await runtime.resume(b.settings||b);return json(res,s.state==='DISARMED'?409:200,{ok:s.state!=='DISARMED',runtime:s});}
  if(p==='/strategy/disarm'&&req.method==='POST')return json(res,200,{ok:true,runtime:await runtime.stop('MANUAL_DISARM')});
  if(p==='/position/flash-close'&&req.method==='POST'){const b=await parseBody(req);if(String(b.confirm||'')!=='CLOSE_ALL_BTC')return json(res,400,{ok:false,error:'CONFIRMATION_REQUIRED'});const out=await flashCloseAll();return json(res,200,{ok:true,...out});}
  return json(res,404,{ok:false,error:'NOT_FOUND'});
 }catch(e){return json(res,500,{ok:false,error:String(e?.code||'LOCAL_CONTROL_ERROR'),message:String(e?.message||e).slice(0,240)});}
}

await runtime.initialize();
const server=http.createServer((req,res)=>handler(req,res).catch(e=>json(res,500,{ok:false,error:'UNHANDLED',message:String(e?.message||e)})));
server.listen(PORT,HOST,()=>console.log(`DKIVN V4.9 local control listening ${HOST}:${PORT}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{try{await runtime.shutdown();}finally{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),3000).unref();}});
