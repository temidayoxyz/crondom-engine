# crondom-engine

The scheduler engine for [crondom](https://crondom.temidayo.xyz/) — powered by **Inngest**.

Replaces the unreliable GitHub Actions-based scheduler with Inngest's reliable cron execution.

## How it works

1. When a job is created, the frontend sends a `job/execute` event to Inngest
2. Inngest triggers this engine → makes the HTTP request → logs to Turso
3. The engine calculates the next run time, sleeps until then, and re-triggers itself
4. This chain continues indefinitely — one event per job per execution

## Stack

- **Runtime**: Node.js (any host)
- **Scheduling**: [Inngest](https://inngest.com) (free — 10K runs/month)
- **Database**: Turso via `@libsql/client`

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo
4. Set:
   - **Start command**: `node src/server.js`
   - **Health check path**: `/health`
5. Add environment variables (see below)
6. Deploy

## Environment variables

| Variable | Description |
|---|---|
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `INNGEST_EVENT_KEY` | Inngest event key (from inngest.com) |
| `INNGEST_SIGNING_KEY` | Inngest signing key (from inngest.com) |
| `PORT` | Server port (default: 3000) |

## Inngest setup

1. Go to [inngest.com](https://inngest.com) → create account
2. Create a new app → copy Event Key + Signing Key
3. After deploying, set the Inngest app URL to `https://your-app.onrender.com/api/inngest`
