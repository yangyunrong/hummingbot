import crypto from 'node:crypto';

const encode = (entries) => entries
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  .join('&');

export function buildSignedFormRequest({
  path,
  method = 'POST',
  params = {},
  apiKey,
  secret,
  timestamp = Date.now(),
  recvWindow,
  baseUrl = 'https://api.toobit.com',
} = {}) {
  if (!path || !apiKey || !secret) throw new Error('TRANSPORT_ARGUMENT_REQUIRED');
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  entries.push(['timestamp', timestamp]);
  if (recvWindow !== undefined && recvWindow !== null) entries.push(['recvWindow', recvWindow]);
  const unsignedBody = encode(entries);
  const signature = crypto.createHmac('sha256', String(secret)).update(unsignedBody).digest('hex');
  return Object.freeze({
    method: String(method).toUpperCase(),
    url: `${baseUrl}${path}`,
    headers: Object.freeze({
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-BB-APIKEY': String(apiKey),
    }),
    body: `${unsignedBody}&signature=${signature}`,
    unsignedBody,
    signature,
  });
}

export function normalizeToobitResponse(status, data = {}) {
  const numericStatus = Number(status) || 0;
  const code = data?.code === undefined || data?.code === null ? null : Number(data.code);
  const message = String(data?.msg ?? data?.message ?? data?.error ?? '');
  const httpOk = numericStatus >= 200 && numericStatus < 300;
  const businessOk = code === null || code === 0 || code === 200;
  if (httpOk && businessOk) return Object.freeze({ok:true,retryable:false,kind:'SUCCESS',code:code ?? numericStatus,message,data});

  if (code === -1003 || numericStatus === 429) return Object.freeze({ok:false,retryable:true,kind:'RATE_LIMIT',code:code ?? numericStatus,message,data});
  if ([-1002,-1022,-1107,-2014,-2015,-2017,-1023].includes(code)) return Object.freeze({ok:false,retryable:false,kind:'AUTH_PERMISSION',code,message,data});
  if (/missing required parameter|invalid.*parameter|parameter.*invalid/i.test(message)) return Object.freeze({ok:false,retryable:false,kind:'PARAMETER_SERIALIZATION',code:code ?? numericStatus,message,data});
  if ([-1000,-1001,-1006,-1007,-1016].includes(code) || numericStatus >= 500) return Object.freeze({ok:false,retryable:true,kind:'UPSTREAM_TRANSIENT',code:code ?? numericStatus,message,data});
  return Object.freeze({ok:false,retryable:false,kind:'ORDER_REJECTED',code:code ?? numericStatus,message,data});
}
