import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const OWNER='primary-admin';
const GATEWAY='tokyo-gateway';
const EXCHANGE='toobit';
const secretMap=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')}catch{return {}}})();
const adminKey=(secretMap.default&&Deno.env.get(secretMap.default))||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const supabase=createClient(Deno.env.get('SUPABASE_URL')||'https://txutcpmarsvsdcvgyhtu.supabase.co',adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const te=new TextEncoder();
function json(status:number,data:unknown){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
async function sha256(s:string){const d=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(s)));return [...d].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function authed(req:Request){const t=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!t)return false;const {data,error}=await supabase.from('gateway_auth').select('token_sha256').eq('owner_id',OWNER).eq('gateway_name',GATEWAY).maybeSingle();return !error&&!!data&&(await sha256(t))===String(data.token_sha256)}
Deno.serve(async(req)=>{try{if(!(await authed(req)))return json(401,{ok:false,error:'UNAUTHORIZED'});const p=new URL(req.url).pathname.split('/dkivn-v48-state-read')[1]||'/';if(p==='/health')return json(200,{ok:true,service:'dkivn-v48-state-read',version:1});if(p==='/runtime'){const {data,error}=await supabase.from('bot_runtime').select('state,reason,public_ws_connected,private_ws_connected,open_bot_orders,api_error_streak,risk_rate,daily_pnl,updated_at').eq('owner_id',OWNER).eq('exchange',EXCHANGE).maybeSingle();if(error)return json(502,{ok:false,error:'RUNTIME_READ_FAILED'});return json(200,{ok:true,runtime:data||null})}if(p==='/telemetry'){const {data,error}=await supabase.from('gateway_telemetry').select('heartbeat_at,public_ws_connected,private_ws_connected,bid,ask,mid,strategy_mode,strategy_status,fair_price,micro_price,depth_imbalance,short_volatility,maker_bid_price,maker_ask_price,open_bot_orders,updated_at').eq('owner_id',OWNER).eq('exchange',EXCHANGE).maybeSingle();if(error)return json(502,{ok:false,error:'TELEMETRY_READ_FAILED'});return json(200,{ok:true,telemetry:data||null})}return json(404,{ok:false,error:'NOT_FOUND'})}catch(e){return json(500,{ok:false,error:'INTERNAL',message:String((e as any)?.message||e).slice(0,160)})}});
