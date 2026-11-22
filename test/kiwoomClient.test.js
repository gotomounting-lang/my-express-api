const { test } = require('node:test');
const assert = require('node:assert');
const { KiwoomClient, KiwoomError, TRADE_TYPE, parseExpiresDt } = require('../src/kiwoom/client');

const future = () => {
  const d = new Date(Date.now() + 24 * 3600 * 1000 + 9 * 3600 * 1000);
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
};

// 호출 순서대로 응답을 돌려주는 가짜 fetch
const mockFetch = (responses) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = responses.shift();
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: r.headers ?? {},
    });
  };
  return { fn, calls };
};

const tokenOk = () => ({ body: { return_code: 0, token: 'tok', token_type: 'bearer', expires_dt: future() } });
const make = (responses, extra = {}) => {
  const m = mockFetch(responses);
  const client = new KiwoomClient({ appKey: 'k', secretKey: 's', fetch: m.fn, minIntervalMs: 0, ...extra });
  return { client, calls: m.calls };
};

test('parseExpiresDt: KST 변환', () => {
  assert.strictEqual(parseExpiresDt('20241107083713'), Date.parse('2024-11-06T23:37:13Z'));
  assert.throws(() => parseExpiresDt('bad'), KiwoomError);
});

test('토큰은 캐시되어 한 번만 발급된다', async () => {
  const { client, calls } = make([
    tokenOk(),
    { body: { return_code: 0, ord_no: '1' } },
    { body: { return_code: 0, ord_no: '2' } },
  ]);
  await client.placeOrder({ side: 'BUY', symbol: '005930', qty: 1, tradeType: TRADE_TYPE.MARKET });
  await client.placeOrder({ side: 'BUY', symbol: '005930', qty: 1, tradeType: TRADE_TYPE.MARKET });
  assert.strictEqual(calls.filter((c) => c.url.endsWith('/oauth2/token')).length, 1);
  assert.deepStrictEqual(calls[0].body, { grant_type: 'client_credentials', appkey: 'k', secretkey: 's' });
});

test('매수/매도 주문: api-id, 경로, 바디', async () => {
  const { client, calls } = make([
    tokenOk(),
    { body: { return_code: 0, ord_no: '0000001', dmst_stex_tp: 'KRX' } },
    { body: { return_code: 0, ord_no: '0000002', dmst_stex_tp: 'KRX' } },
  ]);
  const buy = await client.placeOrder({ side: 'BUY', symbol: '005930', qty: 3, tradeType: TRADE_TYPE.LIMIT, price: 70000 });
  const sell = await client.placeOrder({ side: 'SELL', symbol: '005930', qty: 3, tradeType: TRADE_TYPE.MARKET });
  assert.deepStrictEqual(buy, { orderNo: '0000001', exchange: 'KRX' });
  assert.strictEqual(sell.orderNo, '0000002');
  assert.strictEqual(calls[1].headers['api-id'], 'kt10000');
  assert.strictEqual(calls[1].headers.authorization, 'Bearer tok');
  assert.ok(calls[1].url.endsWith('/api/dostk/ordr'));
  assert.deepStrictEqual(calls[1].body, {
    dmst_stex_tp: 'KRX', stk_cd: '005930', ord_qty: '3', trde_tp: '0', ord_uv: '70000',
  });
  assert.strictEqual(calls[2].headers['api-id'], 'kt10001');
  assert.ok(!('ord_uv' in calls[2].body));
});

test('주문 입력 검증', async () => {
  const { client, calls } = make([]);
  await assert.rejects(client.placeOrder({ side: 'BUY', symbol: '005930', qty: 0, tradeType: '3' }), KiwoomError);
  await assert.rejects(client.placeOrder({ side: 'BUY', symbol: '005930', qty: 1, tradeType: '0' }), KiwoomError);
  assert.strictEqual(calls.length, 0);
});

test('return_code가 0이 아니면 KiwoomError', async () => {
  const { client } = make([tokenOk(), { body: { return_code: 20, return_msg: '잔고 부족' } }]);
  await assert.rejects(
    client.placeOrder({ side: 'BUY', symbol: '005930', qty: 1, tradeType: '3' }),
    (e) => e instanceof KiwoomError && e.code === 20 && e.apiId === 'kt10000' && /잔고/.test(e.message),
  );
});

test('토큰 거부(401) 시 재발급 후 1회 재시도', async () => {
  const { client, calls } = make([
    tokenOk(),
    { status: 401, body: { return_code: 3, return_msg: '[8005:invalid token]' } },
    tokenOk(),
    { body: { return_code: 0, ord_no: '9' } },
  ]);
  const r = await client.placeOrder({ side: 'SELL', symbol: '005930', qty: 1, tradeType: '3' });
  assert.strictEqual(r.orderNo, '9');
  assert.strictEqual(calls.filter((c) => c.url.endsWith('/oauth2/token')).length, 2);
});

test('재시도 후에도 실패하면 에러', async () => {
  const { client } = make([
    tokenOk(),
    { status: 401, body: { return_code: 3, return_msg: 'x' } },
    tokenOk(),
    { status: 401, body: { return_code: 3, return_msg: 'x' } },
  ]);
  await assert.rejects(client.placeOrder({ side: 'BUY', symbol: '005930', qty: 1, tradeType: '3' }), KiwoomError);
});

test('일봉: 연속조회 후 오래된 순 정렬', async () => {
  const row = (dt, c) => ({ dt, open_pric: c, high_pric: c, low_pric: c, cur_prc: String(c), trde_qty: '10' });
  const { client, calls } = make([
    tokenOk(),
    { body: { return_code: 0, stk_dt_pole_chart_qry: [row('20261023', 3), row('20261022', 2)] }, headers: { 'cont-yn': 'Y', 'next-key': 'K1' } },
    { body: { return_code: 0, stk_dt_pole_chart_qry: [row('20261021', 1)] }, headers: { 'cont-yn': 'N' } },
  ]);
  const candles = await client.getDailyCandles('005930', '20261023', 3);
  assert.deepStrictEqual(candles.map((c) => c.date), ['20261021', '20261022', '20261023']);
  assert.strictEqual(candles[2].close, 3);
  assert.strictEqual(calls[2].headers['cont-yn'], 'Y');
  assert.strictEqual(calls[2].headers['next-key'], 'K1');
});

test('보유종목, 미체결 매핑', async () => {
  const { client } = make([
    tokenOk(),
    { body: { return_code: 0, acnt_evlt_remn_indv_tot: [{ stk_cd: 'A005930', stk_nm: '삼성전자', rmnd_qty: '5', pur_pric: '70000', cur_prc: '-71000' }] } },
    { body: { return_code: 0, oso: [{ ord_no: '1' }] } },
  ]);
  assert.deepStrictEqual(await client.getHoldings(), [
    { symbol: '005930', name: '삼성전자', qty: 5, avgPrice: 70000, price: 71000 },
  ]);
  assert.deepStrictEqual(await client.getUnfilledOrders(), [{ ord_no: '1' }]);
});

test('주문 취소와 토큰 폐기', async () => {
  const { client, calls } = make([
    tokenOk(),
    { body: { return_code: 0, ord_no: '5', cncl_qty: '2' } },
    { body: { return_code: 0 } },
  ]);
  assert.deepStrictEqual(await client.cancelOrder('1', '005930'), { orderNo: '5', cancelQty: 2 });
  assert.strictEqual(calls[1].body.cncl_qty, '0');
  await client.revokeToken();
  assert.ok(calls[2].url.endsWith('/oauth2/revoke'));
  assert.strictEqual(calls[2].body.token, 'tok');
});

test('appKey 없으면 생성 실패', () => {
  assert.throws(() => new KiwoomClient({ appKey: '', secretKey: '' }), KiwoomError);
});
