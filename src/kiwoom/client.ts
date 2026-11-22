export const BASE_URLS = {
  real: 'https://api.kiwoom.com',
  mock: 'https://mockapi.kiwoom.com',
} as const;

export type KiwoomEnv = keyof typeof BASE_URLS;

export interface KiwoomClientOptions {
  appKey: string;
  secretKey: string;
  env?: KiwoomEnv;
  fetch?: typeof fetch;
  minIntervalMs?: number;
  timeoutMs?: number;
}

export class KiwoomError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string,
    public readonly apiId?: string,
  ) {
    super(message);
    this.name = 'KiwoomError';
  }
}

export interface KiwoomResponse<T> {
  body: T;
  contYn: string;
  nextKey: string;
}

type ApiBody = Record<string, unknown> & { return_code?: number | string; return_msg?: string };

// 응답 필드는 공식 예제 코드 기준이며 전체 명세와는 대조하지 않았다.
export type OrderSide = 'BUY' | 'SELL';

export const TRADE_TYPE = { LIMIT: '0', MARKET: '3' } as const;

export interface OrderParams {
  side: OrderSide;
  symbol: string;
  qty: number;
  tradeType: (typeof TRADE_TYPE)[keyof typeof TRADE_TYPE];
  price?: number;
  exchange?: 'KRX' | 'NXT' | 'SOR';
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TOKEN_RETRY_CODES = new Set(['8005']);
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 키움 expires_dt(YYYYMMDDhhmmss, KST)를 epoch ms로 변환
export const parseExpiresDt = (value: string): number => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!m) throw new KiwoomError(`invalid expires_dt: ${value}`);
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`);
};

const num = (value: unknown): number => Math.abs(Number(String(value ?? '0').replace(/,/g, '')));

export class KiwoomClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private token?: { value: string; expiresAt: number };
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly options: KiwoomClientOptions) {
    if (!options.appKey || !options.secretKey) {
      throw new KiwoomError('appKey and secretKey are required');
    }
    this.baseUrl = BASE_URLS[options.env ?? 'real'];
    this.fetchFn = options.fetch ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 250;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env, extra: Partial<KiwoomClientOptions> = {}) {
    return new KiwoomClient({
      appKey: env.KIWOOM_APP_KEY ?? '',
      secretKey: env.KIWOOM_SECRET_KEY ?? '',
      env: env.KIWOOM_ENV === 'mock' ? 'mock' : 'real',
      ...extra,
    });
  }

  // 요청을 직렬화하고 최소 간격을 둔다 (호출 제한 수치는 미확인이라 보수적으로 제한)
  private throttle<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.lastRequestAt = Date.now();
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async post(path: string, headers: Record<string, string>, body: unknown) {
    const res = await this.fetchFn(this.baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=UTF-8', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    let json: ApiBody;
    try {
      json = text ? (JSON.parse(text) as ApiBody) : {};
    } catch {
      throw new KiwoomError(`non-JSON response (HTTP ${res.status})`, res.status);
    }
    return { res, json };
  }

  async getToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return this.token.value;
    }
    const { res, json } = await this.throttle(() =>
      this.post('/oauth2/token', {}, {
        grant_type: 'client_credentials',
        appkey: this.options.appKey,
        secretkey: this.options.secretKey,
      }),
    );
    if (!res.ok || String(json.return_code) !== '0' || typeof json.token !== 'string') {
      throw new KiwoomError(`token request failed: ${json.return_msg ?? res.status}`, json.return_code, 'au10001');
    }
    this.token = { value: json.token, expiresAt: parseExpiresDt(String(json.expires_dt)) };
    return this.token.value;
  }

  async revokeToken(): Promise<void> {
    if (!this.token) return;
    const { json } = await this.throttle(() =>
      this.post('/oauth2/revoke', {}, {
        appkey: this.options.appKey,
        secretkey: this.options.secretKey,
        token: this.token!.value,
      }),
    );
    this.token = undefined;
    if (String(json.return_code) !== '0') {
      throw new KiwoomError(`token revoke failed: ${json.return_msg}`, json.return_code, 'au10002');
    }
  }

  async request<T = ApiBody>(
    apiId: string,
    path: string,
    body: Record<string, unknown> = {},
    page?: { contYn: string; nextKey: string },
  ): Promise<KiwoomResponse<T>> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.getToken(attempt > 0);
      const headers: Record<string, string> = { 'api-id': apiId, authorization: `Bearer ${token}` };
      if (page) {
        headers['cont-yn'] = page.contYn;
        headers['next-key'] = page.nextKey;
      }
      const { res, json } = await this.throttle(() => this.post(path, headers, body));
      const code = String(json.return_code ?? (res.ok ? '0' : res.status));
      const tokenRejected = res.status === 401 || TOKEN_RETRY_CODES.has(code);
      if (tokenRejected && attempt === 0) continue;
      if (!res.ok || code !== '0') {
        throw new KiwoomError(String(json.return_msg ?? `HTTP ${res.status}`), json.return_code ?? res.status, apiId);
      }
      return {
        body: json as T,
        contYn: res.headers.get('cont-yn') ?? 'N',
        nextKey: res.headers.get('next-key') ?? '',
      };
    }
  }

  // 연속조회가 끝나거나 maxPages에 도달할 때까지 페이지를 이어서 가져온다
  async *paginate<T = ApiBody>(
    apiId: string,
    path: string,
    body: Record<string, unknown> = {},
    maxPages = 10,
  ): AsyncGenerator<T> {
    let page: { contYn: string; nextKey: string } | undefined;
    for (let i = 0; i < maxPages; i++) {
      const r = await this.request<T>(apiId, path, body, page);
      yield r.body;
      if (r.contYn !== 'Y') return;
      page = { contYn: r.contYn, nextKey: r.nextKey };
    }
  }

  // ka10081 일봉. 오래된 순으로 정렬해 반환한다.
  async getDailyCandles(symbol: string, baseDate: string, minCount = 130): Promise<Candle[]> {
    const rows: Array<Record<string, unknown>> = [];
    for await (const page of this.paginate<ApiBody>('ka10081', '/api/dostk/chart', {
      stk_cd: symbol,
      base_dt: baseDate,
      upd_stkpc_tp: '1',
    })) {
      rows.push(...((page.stk_dt_pole_chart_qry as Array<Record<string, unknown>> | undefined) ?? []));
      if (rows.length >= minCount) break;
    }
    return rows
      .map((r) => ({
        date: String(r.dt),
        open: num(r.open_pric),
        high: num(r.high_pric),
        low: num(r.low_pric),
        close: num(r.cur_prc),
        volume: num(r.trde_qty),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // kt10000(매수), kt10001(매도). 지정가는 price가 필수.
  async placeOrder(p: OrderParams): Promise<{ orderNo: string; exchange: string }> {
    if (!Number.isInteger(p.qty) || p.qty <= 0) throw new KiwoomError('qty must be a positive integer');
    if (p.tradeType === TRADE_TYPE.LIMIT && !(p.price && p.price > 0)) {
      throw new KiwoomError('price is required for limit orders');
    }
    const apiId = p.side === 'BUY' ? 'kt10000' : 'kt10001';
    const exchange = p.exchange ?? 'KRX';
    const body: Record<string, unknown> = {
      dmst_stex_tp: exchange,
      stk_cd: p.symbol,
      ord_qty: String(p.qty),
      trde_tp: p.tradeType,
    };
    if (p.price !== undefined) body.ord_uv = String(p.price);
    const { body: res } = await this.request<ApiBody>(apiId, '/api/dostk/ordr', body);
    if (!res.ord_no) throw new KiwoomError('order accepted without ord_no', res.return_code, apiId);
    return { orderNo: String(res.ord_no), exchange: String(res.dmst_stex_tp ?? exchange) };
  }

  // kt10003. cancelQty 0이면 잔량 전부 취소
  async cancelOrder(origOrderNo: string, symbol: string, cancelQty = 0, exchange = 'KRX') {
    const { body } = await this.request<ApiBody>('kt10003', '/api/dostk/ordr', {
      dmst_stex_tp: exchange,
      orig_ord_no: origOrderNo,
      stk_cd: symbol,
      cncl_qty: String(cancelQty),
    });
    return { orderNo: String(body.ord_no ?? ''), cancelQty: num(body.cncl_qty) };
  }

  // ka10075 미체결
  async getUnfilledOrders(symbol?: string) {
    const { body } = await this.request<ApiBody>('ka10075', '/api/dostk/acnt', {
      all_stk_tp: symbol ? '1' : '0',
      trde_tp: '0',
      stex_tp: '0',
      ...(symbol ? { stk_cd: symbol } : {}),
    });
    return (body.oso as Array<Record<string, unknown>> | undefined) ?? [];
  }

  // ka10076 체결
  async getFilledOrders(symbol?: string) {
    const { body } = await this.request<ApiBody>('ka10076', '/api/dostk/acnt', {
      qry_tp: symbol ? '1' : '0',
      sell_tp: '0',
      stex_tp: '0',
      ...(symbol ? { stk_cd: symbol } : {}),
    });
    return (body.cntr as Array<Record<string, unknown>> | undefined) ?? [];
  }

  // kt00018 보유종목 (개별)
  async getHoldings() {
    const { body } = await this.request<ApiBody>('kt00018', '/api/dostk/acnt', {
      qry_tp: '2',
      dmst_stex_tp: 'KRX',
    });
    const rows = (body.acnt_evlt_remn_indv_tot as Array<Record<string, unknown>> | undefined) ?? [];
    return rows.map((r) => ({
      symbol: String(r.stk_cd ?? '').replace(/^A/, ''),
      name: String(r.stk_nm ?? ''),
      qty: num(r.rmnd_qty),
      avgPrice: num(r.pur_pric),
      price: num(r.cur_prc),
    }));
  }
}
