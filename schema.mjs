// Creates the tables. Run once: npm run db
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const schema = `
create table if not exists users (
  id serial primary key,
  sub text unique not null, -- Masky's per-app pseudonym for the chosen avatar
  name text not null,
  picture text not null default '',
  tags text[] not null default '{}',
  bio text not null default '',
  created timestamptz not null default now()
);
create table if not exists sessions (
  token text primary key,
  user_id int not null references users on delete cascade,
  created timestamptz not null default now()
);
create table if not exists posts (
  id serial primary key,
  user_id int not null references users on delete cascade,
  body text not null,
  created timestamptz not null default now()
);
create table if not exists comments (
  id serial primary key,
  post_id int not null references posts on delete cascade,
  user_id int not null references users on delete cascade,
  body text not null,
  created timestamptz not null default now()
);
create table if not exists swipes (
  from_id int not null references users on delete cascade,
  to_id int not null references users on delete cascade,
  liked boolean not null,
  primary key (from_id, to_id)
);
create table if not exists messages (
  id serial primary key,
  from_id int not null references users on delete cascade,
  to_id int not null references users on delete cascade,
  body text not null,
  created timestamptz not null default now()
);
create index if not exists messages_pair on messages (from_id, to_id);
`;

for (const statement of schema.split(';').filter(s => s.trim())) await sql.query(statement);
console.log('schema ready');
