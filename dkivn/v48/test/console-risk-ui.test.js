import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../console/index.html', import.meta.url), 'utf8');

test('console exposes live inventory risk mode fields', () => {
  for (const id of ['mkMode','mkLeverage','mkExisting','mkReduceSide','mkReduceCap','mkRiskNote']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const label of ['Maker Mode','Live Leverage','Existing Inventory','Reduce Side','Reduce Cap']) {
    assert.ok(html.includes(label), label);
  }
});

test('console derives high leverage takeover from exchange position truth', () => {
  assert.ok(html.includes('function positionTruth('));
  assert.ok(html.includes("'RISK REDUCE'"));
  assert.ok(html.includes("'DUAL SIDE'"));
  assert.ok(html.includes("'SELL / ASK'"));
  assert.ok(html.includes("'BUY / BID'"));
});
