// End-to-end check against the database: npm test (creates two throwaway users, then deletes them)
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import handler from './api/[route].js';

const call = (method, route, body, cookie, query = {}) => new Promise(resolve => {
  const res = {
    setHeader(k, v) { this.cookie = v.split(';')[0]; },
    status(code) { this.code = code; return this; },
    json(data) { resolve({ code: this.code, data, cookie: this.cookie }); },
  };
  handler({ method, query: { route, ...query }, body, headers: { cookie } }, res);
});

const tag = Date.now().toString(36);
const [a, b] = ['ta_' + tag, 'tb_' + tag];

try {
  assert.equal((await call('GET', 'posts')).code, 401, 'posts need a session');
  assert.equal((await call('POST', 'signup', { name: a, pass: 'short' })).code, 400);
  const A = (await call('POST', 'signup', { name: a, pass: 'password-a' })).cookie;
  const B = (await call('POST', 'signup', { name: b, pass: 'password-b' })).cookie;
  assert.equal((await call('POST', 'signup', { name: a, pass: 'password-a' })).code, 409, 'duplicate name');
  assert.equal((await call('POST', 'login', { name: a, pass: 'wrong-pass' })).code, 400);
  assert.ok((await call('POST', 'login', { name: a.toUpperCase(), pass: 'password-a' })).cookie, 'login is case-insensitive');

  // Dump + comments
  await call('POST', 'post', { body: 'my story' }, A);
  const post = (await call('GET', 'posts', null, B)).data.find(p => p.name === a);
  assert.equal(post.mine, false);
  await call('POST', 'comment', { post_id: post.id, body: 'sending love' }, B);
  await call('POST', 'delete', { post_id: post.id }, B); // not B's post: no-op
  const seen = (await call('GET', 'posts', null, A)).data.find(p => p.id === post.id);
  assert.equal(seen.comments[0].body, 'sending love');
  assert.equal(seen.mine, true);
  await call('POST', 'delete', { post_id: post.id }, A);
  assert.ok(!(await call('GET', 'posts', null, A)).data.some(p => p.id === post.id), 'owner can delete');

  // TraumaMatch
  assert.deepEqual((await call('POST', 'profile', { tags: ['Grief & loss', 'Accident', 'not a tag'], bio: 'hi' }, A)).data.tags, ['Grief & loss', 'Accident']);
  await call('POST', 'profile', { tags: ['Accident'], bio: '' }, B);
  const next = (await call('GET', 'next', null, A)).data;
  assert.deepEqual([next.name, next.shared], [b, ['Accident']]);
  assert.equal((await call('POST', 'message', { to: next.id, body: 'hi' }, A)).code, 403, 'no messages before a match');
  assert.equal((await call('POST', 'swipe', { to: next.id, liked: true }, A)).data.match, false);
  const aId = (await call('GET', 'next', null, B)).data.id;
  assert.equal((await call('POST', 'swipe', { to: aId, liked: true }, B)).data.match, true);
  assert.ok((await call('GET', 'matches', null, A)).data.some(m => m.name === b));
  await call('POST', 'message', { to: next.id, body: 'hello' }, A);
  assert.deepEqual((await call('GET', 'messages', null, B, { with: aId })).data.map(m => [m.body, m.mine]), [['hello', false]]);
  await call('POST', 'unmatch', { to: aId }, B);
  assert.equal((await call('POST', 'message', { to: next.id, body: 'hi' }, A)).code, 403, 'unmatch stops messages');

  await call('POST', 'logout', {}, A);
  assert.equal((await call('GET', 'me', null, A)).code, 401, 'logout ends the session');
  console.log('all checks passed');
} finally {
  await neon(process.env.DATABASE_URL)`delete from users where name in (${a}, ${b})`;
}
