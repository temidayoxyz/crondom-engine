import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { createClient } from "@libsql/client";
import cronParser from "cron-parser";

// ─── DB ────────────────────────────────────────────────────

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ─── Scheduler ─────────────────────────────────────────────

function isDue(expression) {
  try {
    const now = Date.now();
    const interval = cronParser.parseExpression(expression, {
      currentDate: new Date(now - 60000),
    });
    const scheduled = interval.next().getTime();
    return scheduled <= now && scheduled > now - 60000;
  } catch {
    return false;
  }
}

async function executeJob(job) {
  const logId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO execution_logs (id, job_id, status, started_at)
          VALUES (?, ?, 'running', ?)`,
    args: [logId, job.id, startedAt],
  });

  try {
    let headers = {};
    try {
      headers = JSON.parse(job.headers || "{}");
    } catch {}

    const response = await fetch(job.url, {
      method: job.method || "GET",
      headers: { ...headers, "User-Agent": "crondom-engine/1.0" },
      body: job.method !== "GET" && job.method !== "HEAD" ? job.body || undefined : undefined,
    });

    const output = await response.text();

    await db.execute({
      sql: `UPDATE execution_logs
            SET status = 'success', status_code = ?, output = ?, finished_at = datetime('now')
            WHERE id = ?`,
      args: [response.status, output.slice(0, 5000), logId],
    });

    console.log(`✅ ${job.name}: ${response.status} (${job.url})`);
  } catch (error) {
    await db.execute({
      sql: `UPDATE execution_logs
            SET status = 'failure', error = ?, finished_at = datetime('now')
            WHERE id = ?`,
      args: [error.message.slice(0, 2000), logId],
    });

    console.error(`❌ ${job.name}: ${error.message} (${job.url})`);
  }
}

async function checkJobs() {
  try {
    const result = await db.execute("SELECT * FROM cron_jobs WHERE enabled = 1");
    let dueCount = 0;

    for (const job of result.rows) {
      if (isDue(job.expression)) {
        await executeJob(job);
        dueCount++;
      }
    }

    if (dueCount > 0) {
      console.log(`  ${dueCount} job(s) executed`);
    }
  } catch (error) {
    console.error("Scheduler error:", error.message);
  }
}

// Run every 60 seconds
cron.schedule("* * * * *", () => {
  const now = new Date().toISOString();
  console.log(`[${now}] Checking for due jobs...`);
  checkJobs();
});

// ─── Server ────────────────────────────────────────────────

const app = express();
app.get("/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`crondom-engine running on port ${port}`);
  console.log("Scheduler: every 60 seconds");
});
