import "dotenv/config";
import express from "express";
import { Inngest } from "inngest";
import { serve } from "inngest/express";
import { createClient } from "@libsql/client";
import cronParser from "cron-parser";

// ─── DB ────────────────────────────────────────────────────

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ─── Inngest ───────────────────────────────────────────────

const inngest = new Inngest({ id: "crondom" });

function getNextRun(expression) {
  const interval = cronParser.parseExpression(expression);
  return interval.next().toDate();
}

// The function that executes a single HTTP job
const executeJob = inngest.createFunction(
  {
    id: "execute-http-job",
    retries: 3,
  },
  { event: "job/execute" },
  async ({ event, step }) => {
    const { jobId, url, method, headers, body, expression } = event.data;

    // 1. Execute the HTTP request
    const response = await step.run("execute-http", async () => {
      return fetch(url, {
        method: method || "GET",
        headers: { ...(headers || {}), "User-Agent": "crondom-engine/1.0" },
        body: method !== "GET" && method !== "HEAD" ? body || undefined : undefined,
      });
    });

    const output = await step.run("read-response", async () => response.text());

    // 2. Log to Turso
    const logId = crypto.randomUUID();
    await step.run("log-to-turso", async () => {
      await db.execute({
        sql: `INSERT INTO execution_logs (id, job_id, status, status_code, output, started_at, finished_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [logId, jobId, "success", response.status, output.slice(0, 5000)],
      });
    });

    // 3. Schedule the next run
    const nextRun = getNextRun(expression);
    console.log(`  ${url} → ${response.status} (next: ${nextRun.toISOString()})`);

    await step.sleepUntil("wait-for-next", nextRun);

    // 4. Re-trigger itself
    await step.run("re-schedule", async () => {
      await inngest.send({ name: "job/execute", data: event.data });
    });
  }
);

// ─── Server ────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Inngest handler
app.use("/api/inngest", serve({ client: inngest, functions: [executeJob] }));

// API: Register a new job with Inngest
app.post("/api/jobs", async (req, res) => {
  try {
    const data = req.body;

    // Store in Turso
    const jobId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO cron_jobs (id, user_id, name, expression, url, method, headers, body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [jobId, data.user_id, data.name, data.expression, data.url, data.method, data.headers || "{}", data.body || ""],
    });

    // Register with Inngest
    await inngest.send({
      name: "job/execute",
      data: {
        jobId,
        url: data.url,
        method: data.method || "GET",
        headers: JSON.parse(data.headers || "{}"),
        body: data.body || "",
        expression: data.expression,
      },
    });

    res.json({ id: jobId });
  } catch (err) {
    console.error("Create job error:", err);
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`crondom-engine running on port ${port}`);
  console.log(`Inngest endpoint: /api/inngest`);
});
