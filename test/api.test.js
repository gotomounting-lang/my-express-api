const { test, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../index');

let server;
let base;

const call = async (method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

const login = async (username) =>
  (await call('POST', '/auth/login', { body: { username, password: 'pw' } })).json.token;

before(async () => {
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test('public routes', async () => {
  assert.deepStrictEqual((await call('GET', '/')).json, { message: 'Hello, Express!' });
  const res = await call('POST', '/', { body: { a: 1 } });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(res.json, { received: { a: 1 } });
});

test('register: first user is admin, next is user', async () => {
  const a = await call('POST', '/auth/register', { body: { username: 'admin1', password: 'pw' } });
  assert.deepStrictEqual([a.status, a.json.role], [201, 'admin']);
  const b = await call('POST', '/auth/register', { body: { username: 'user1', password: 'pw' } });
  assert.deepStrictEqual([b.status, b.json.role], [201, 'user']);
});

test('register: validation and duplicates', async () => {
  assert.strictEqual((await call('POST', '/auth/register', { body: {} })).status, 400);
  const dup = await call('POST', '/auth/register', { body: { username: 'user1', password: 'pw' } });
  assert.strictEqual(dup.status, 409);
});

test('login: wrong password and unknown user', async () => {
  const bad = await call('POST', '/auth/login', { body: { username: 'user1', password: 'x' } });
  assert.strictEqual(bad.status, 401);
  const none = await call('POST', '/auth/login', { body: { username: 'nobody', password: 'pw' } });
  assert.strictEqual(none.status, 401);
});

test('no token or invalid token -> 401', async () => {
  assert.strictEqual((await call('DELETE', '/1')).status, 401);
  assert.strictEqual((await call('DELETE', '/1', { token: 'bogus' })).status, 401);
});

test('user role: PUT ok, DELETE forbidden', async () => {
  const token = await login('user1');
  const put = await call('PUT', '/1', { token, body: { n: 1 } });
  assert.strictEqual(put.status, 200);
  assert.deepStrictEqual(put.json, { id: '1', updated: { n: 1 } });
  const del = await call('DELETE', '/1', { token });
  assert.deepStrictEqual([del.status, del.json], [403, { error: 'forbidden' }]);
});

test('admin role: DELETE ok', async () => {
  const token = await login('admin1');
  const del = await call('DELETE', '/1', { token });
  assert.deepStrictEqual([del.status, del.json], [200, { id: '1', deleted: true }]);
});

test('logout invalidates token', async () => {
  const token = await login('admin1');
  await call('POST', '/auth/logout', { token });
  assert.strictEqual((await call('DELETE', '/1', { token })).status, 401);
});
