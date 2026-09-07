import crypto from 'node:crypto';
import { isOwnedOrder, shouldRequote, validateOwnedPair } from './order-guard.js';

const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export class OrderExecutor {
  constructor({transport, config = {}, symbol = 'BTC-SWAP-USDT', prefix = 'DKV48M_', tickSize = 0.1} = {}) {
    if (!transport) throw new Error('TRANSPORT_REQUIRED');
    this.transport = transport;
    this.config = config;
    this.symbol = symbol;
    this.prefix = prefix;
    this.tickSize = tickSize;
    this.bid = null;
    this.ask = null;
    this.metrics = { amendCount: 0, cancelCount: 0, createCount: 0 };
  }

  reconcile(openOrders = []) {
    const all = Array.isArray(openOrders) ? openOrders : [];
    const owned = all.filter((o) => isOwnedOrder(o, this.prefix));
    const bids = owned.filter((o) => String(o?.side).toUpperCase() === 'BUY');
    const asks = owned.filter((o) => String(o?.side).toUpperCase() === 'SELL');
    if (bids.length > 1 || asks.length > 1) throw new Error('AMBIGUOUS_OWNED_ORDERS');
    this.bid = bids[0] ? this.#adopt(bids[0]) : null;
    this.ask = asks[0] ? this.#adopt(asks[0]) : null;
    validateOwnedPair({bid:this.bid, ask:this.ask});
    return Object.freeze({ownedCount:owned.length, manualCount:all.length-owned.length});
  }

  snapshot() {
    return Object.freeze({bid:this.bid?{...this.bid}:null,ask:this.ask?{...this.ask}:null,metrics:{...this.metrics}});
  }

  async applyDesiredQuotes(desired = {}, nowMs = Date.now()) {
    validateOwnedPair(desired);
    await this.#applySide('bid', desired.bid ?? null, nowMs);
    await this.#applySide('ask', desired.ask ?? null, nowMs);
    validateOwnedPair({bid:this.bid, ask:this.ask});
    return this.snapshot();
  }

  async cancelOwned(reason = 'CANCEL_OWNED') {
    for (const key of ['bid','ask']) {
      const current = this[key];
      if (!current || !isOwnedOrder(current, this.prefix)) continue;
      await this.transport.cancel(current.clientOrderId, {reason});
      this.metrics.cancelCount += 1;
      this[key] = null;
    }
    return this.snapshot();
  }

  async #applySide(key, target, nowMs) {
    const current = this[key];
    if (!target) {
      if (current) {
        await this.transport.cancel(current.clientOrderId, {reason:'QUOTE_DISABLED'});
        this.metrics.cancelCount += 1;
        this[key] = null;
      }
      return;
    }
    if (!current) {
      const order = this.#newOrder(target, key, nowMs);
      const accepted = await this.transport.place(order);
      this.metrics.createCount += 1;
      this[key] = this.#adopt({...order, ...accepted, createdAt:nowMs});
      return;
    }
    if (!shouldRequote(current, target, nowMs, this.config, this.tickSize)) return;
    const update = {symbol:this.symbol,origClientOrderId:current.clientOrderId,clientOrderId:current.clientOrderId,side:current.side,positionSide:current.positionSide,type:'LIMIT',timeInForce:'POST_ONLY',price:target.price,valueQuantity:target.notional};
    const accepted = await this.transport.update(update);
    this.metrics.amendCount += 1;
    this[key] = this.#adopt({...current, ...accepted, ...update, createdAt:nowMs});
  }

  #newOrder(target, key, nowMs) {
    const side = String(target.side ?? (key === 'bid' ? 'BUY' : 'SELL')).toUpperCase();
    const positionSide = String(target.positionSide ?? (side === 'BUY' ? 'LONG' : 'SHORT')).toUpperCase();
    return {symbol:this.symbol,clientOrderId:`${this.prefix}${nowMs}_${crypto.randomBytes(3).toString('hex')}`,side,positionSide,type:'LIMIT',timeInForce:'POST_ONLY',price:finite(target.price),valueQuantity:finite(target.notional,finite(this.config.quoteNotional,10)),createdAt:nowMs};
  }

  #adopt(order) {
    return {...order,side:String(order?.side??'').toUpperCase(),price:finite(order?.price),createdAt:finite(order?.createdAt??order?.time??order?.updateTime,Date.now())};
  }
}
