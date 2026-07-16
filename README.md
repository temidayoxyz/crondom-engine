# crondom-engine

The scheduler engine for [crondom](https://crondom.temidayo.xyz/) — a persistent Node.js process running on **Render** that checks for due cron jobs every 60 seconds.

## How it works

1. A `node-cron` job runs every **60 seconds**
2. It queries Turso for enabled cron jobs
3. For each job whose cron expression matches the current time, it executes the HTTP request
4. Results are logged to the `execution_logs` table in Turso

## Stack

- **Runtime**: Node.js (ESM)
- **Scheduling**: `node-cron` (in-process)
- **Database**: Turso via `@libsql/client`
- **Hosting**: Render (free tier)

## Deploy

1. Push to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo
4. Set **Start command**: `node src/server.js`
5. Set **Health check path**: `/health`
6. Add environment variables:

| Variable | Value |
|---|---|
| `TURSO_DATABASE_URL` | Your Turso database URL |
| `TURSO_AUTH_TOKEN` | Your Turso auth token |
| `PORT` | 3000 |

7. Deploy
