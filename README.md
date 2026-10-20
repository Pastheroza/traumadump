# TraumaDump

A private place to write about what happened to you, and get support from people who understand.

**Live:** https://traumadump.vercel.app

## Features

- **Dump** — post about a trauma. Posts are private: only people you allow can see them.
- **Support** — others can comment with support, and you can get pointed to mental-health help.
- **TraumaMatch** — like a dating app, but instead of hobbies you match on shared experiences, to find people who have been through something similar.
- **Sol** — an AI support companion built as a [Masky](https://masky.ai) avatar. Sol greets you knowing only the experiences and bio you chose, listens, and points to 988 when someone may be in danger. Its persona is in `companion.mjs`. Replies are text-only so no Masky share page is ever created; reading them aloud uses the browser's on-device voice.

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
npm run companion   # create Sol on Masky (once; needs MASKY_API_KEY and SOL_IMAGE_URL)
npm test        # end-to-end check against the database
vercel dev
```

Built for the AI Workforce 2026 hackathon.
