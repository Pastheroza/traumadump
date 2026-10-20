# TraumaDump

A private place to write about what happened to you, and get support from people who understand.

**Live:** https://traumadump.vercel.app

## Features

- **Dump** — post about a trauma. Posts are private: only people you allow can see them.
- **Support** — others can comment with support, and you can get pointed to mental-health help.
- **TraumaMatch** — like a dating app, but instead of hobbies you match on shared experiences, to find people who have been through something similar.

## Privacy

Everything is private by default. No public profiles, no public posts.

## Not a crisis service

TraumaDump is peer support, not therapy. If you are in danger, call your local emergency number. In the US, call or text **988** (Suicide & Crisis Lifeline).

## Run it

Plain HTML (`public/index.html`) plus one Vercel function (`api/[route].js`) on Neon Postgres.

```sh
vercel link && vercel env pull .env.local   # gets DATABASE_URL
npm install
npm run db      # create tables (once)
npm test        # end-to-end check against the database
vercel dev
```

Built for the AI Workforce 2026 hackathon.
