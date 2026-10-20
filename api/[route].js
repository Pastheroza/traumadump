// The whole API: /api/<route>. Every route except signup/login needs a session cookie.
import { neon } from '@neondatabase/serverless';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const sql = neon(process.env.DATABASE_URL);
const hash = promisify(scrypt);

export const TAGS = [
  'Grief & loss', 'Childhood abuse', 'Sexual assault', 'Domestic violence', 'Neglect',
  'Bullying', 'Breakup & divorce', 'Betrayal', 'Accident', 'Illness', 'Medical trauma',
  'Addiction', 'War & conflict', 'Displacement', 'Workplace trauma',
];

const fail = (status, message) => Object.assign(new Error(message), { status });

const text = (v, max) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw fail(400, `Write between 1 and ${max} characters`);
  return v.trim();
};

const id = v => {
  if (!Number.isInteger(Number(v)) || Number(v) < 1) throw fail(400, 'Bad id');
  return Number(v);
};

const matched = async (a, b) => (await sql`
  select 1 from swipes x join swipes y on y.from_id = x.to_id and y.to_id = x.from_id
  where x.from_id = ${a} and x.to_id = ${b} and x.liked and y.liked`).length > 0;

async function startSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  await sql`insert into sessions (token, user_id) values (${token}, ${userId})`;
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
}

const profile = me => ({ name: me.name, tags: me.tags, bio: me.bio, allTags: TAGS });

const routes = {
  async 'POST signup'({ name, pass }, me, res) {
    name = String(name ?? '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(name)) throw fail(400, 'Username: 3-20 letters, numbers or _');
    if (typeof pass !== 'string' || pass.length < 8) throw fail(400, 'Password: at least 8 characters');
    const salt = randomBytes(16).toString('hex');
    const key = (await hash(pass, salt, 64)).toString('hex');
    const [user] = await sql`
      insert into users (name, pass) values (${name}, ${salt + ':' + key})
      on conflict (name) do nothing returning id`;
    if (!user) throw fail(409, 'That username is taken');
    await startSession(res, user.id);
  },

  async 'POST login'({ name, pass }, me, res) {
    const [user] = await sql`select id, pass from users where name = ${String(name ?? '').toLowerCase()}`;
    const [salt, key] = (user?.pass ?? ':').split(':');
    const ok = user && timingSafeEqual(Buffer.from(key, 'hex'), await hash(String(pass ?? ''), salt, 64));
    if (!ok) throw fail(400, 'Wrong username or password');
    await startSession(res, user.id);
  },

  async 'POST logout'(body, me, res, req) {
    await sql`delete from sessions where token = ${req.token}`;
    res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  },

  'GET me': (body, me) => profile(me),

  async 'POST profile'({ tags, bio }, me) {
    tags = Array.isArray(tags) ? TAGS.filter(t => tags.includes(t)) : [];
    if (typeof bio !== 'string' || bio.length > 300) throw fail(400, 'Bio: up to 300 characters');
    const [user] = await sql`update users set tags = ${tags}, bio = ${bio.trim()} where id = ${me.id} returning name, tags, bio`;
    return profile(user);
  },

  // Dump: posts and supportive comments, visible to signed-in members only.
  'GET posts': (body, me) => sql`
    select p.id, u.name, p.body, p.created, p.user_id = ${me.id} as mine,
      coalesce((select json_agg(json_build_object('name', cu.name, 'body', c.body, 'created', c.created) order by c.id)
        from comments c join users cu on cu.id = c.user_id where c.post_id = p.id), '[]') as comments
    from posts p join users u on u.id = p.user_id
    order by p.id desc limit 50`, // ponytail: newest 50 only, add paging when the feed outgrows it

  async 'POST post'({ body }, me) {
    await sql`insert into posts (user_id, body) values (${me.id}, ${text(body, 5000)})`;
  },

  async 'POST delete'({ post_id }, me) {
    await sql`delete from posts where id = ${id(post_id)} and user_id = ${me.id}`;
  },

  async 'POST comment'({ post_id, body }, me) {
    await sql`insert into comments (post_id, user_id, body) select id, ${me.id}, ${text(body, 2000)} from posts where id = ${id(post_id)}`;
  },

  // TraumaMatch: next person sharing the most experiences, not yet swiped on.
  async 'GET next'(body, me) {
    const [person] = await sql`
      select * from (
        select u.id, u.name, u.bio, array(select unnest(u.tags) intersect select unnest(m.tags)) as shared
        from users u, users m
        where m.id = ${me.id} and u.id <> m.id and u.tags && m.tags
          and not exists (select 1 from swipes s where s.from_id = m.id and s.to_id = u.id)
      ) t order by cardinality(shared) desc, id limit 1`;
    return person ?? null;
  },

  async 'POST swipe'({ to, liked }, me) {
    to = id(to);
    await sql`
      insert into swipes (from_id, to_id, liked) select ${me.id}, id, ${liked === true} from users where id = ${to} and id <> ${me.id}
      on conflict (from_id, to_id) do update set liked = excluded.liked`;
    return { match: liked === true && await matched(me.id, to) };
  },

  'GET matches': (body, me) => sql`
    select u.id, u.name, u.bio, u.tags from swipes a
    join swipes b on b.from_id = a.to_id and b.to_id = a.from_id and b.liked
    join users u on u.id = a.to_id
    where a.from_id = ${me.id} and a.liked order by u.name`,

  async 'POST unmatch'({ to }, me) {
    await sql`update swipes set liked = false where from_id = ${me.id} and to_id = ${id(to)}`;
  },

  async 'GET messages'(body, me, res, req) {
    const peer = id(req.query.with);
    if (!await matched(me.id, peer)) throw fail(403, 'You can only message your matches');
    return sql`
      select body, created, from_id = ${me.id} as mine from messages
      where (from_id = ${me.id} and to_id = ${peer}) or (from_id = ${peer} and to_id = ${me.id})
      order by id`;
  },

  async 'POST message'({ to, body }, me) {
    if (!await matched(me.id, id(to))) throw fail(403, 'You can only message your matches');
    await sql`insert into messages (from_id, to_id, body) values (${me.id}, ${id(to)}, ${text(body, 2000)})`;
  },
};

export default async function handler(req, res) {
  const route = routes[`${req.method} ${req.query.route}`];
  if (!route) return res.status(404).json({ error: 'Not found' });
  try {
    req.token = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1];
    const [me] = req.token ? await sql`
      select u.id, u.name, u.tags, u.bio from sessions s join users u on u.id = s.user_id
      where s.token = ${req.token} and s.created > now() - interval '30 days'` : [];
    if (!me && !['signup', 'login'].includes(req.query.route)) throw fail(401, 'Please sign in');
    const out = await route(req.body ?? {}, me, res, req);
    res.status(200).json(out === undefined ? { ok: true } : out);
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Something went wrong' });
  }
}
