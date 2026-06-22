"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./ui.module.css";
import type { ConnectionPublic, Run } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(
    "Fetch the latest AI news from the web and save them into a CSV.",
  );
  const [connections, setConnections] = useState<ConnectionPublic[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    const res = await fetch("/api/connections");
    const data = await res.json();
    setConnections(data.connections ?? []);
  }, []);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/runs");
    const data = await res.json();
    setRuns(data.runs ?? []);
  }, []);

  useEffect(() => {
    void loadConnections();
    void loadRuns();
  }, [loadConnections, loadRuns]);

  async function updateConnection(id: string, patch: Partial<ConnectionPublic> & { token?: string }) {
    await fetch("/api/connections", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadConnections();
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const connectionIds = connections.filter((c) => c.enabled).map((c) => c.id);
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, connectionIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const { runId } = await res.json();
      router.push(`/runs/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>duvo.ai · Automation</h1>
      <p className={styles.sub}>Send one instruction to the agent and watch it run.</p>

      <section className={styles.panel}>
        <label className={styles.label}>Instruction</label>
        <textarea
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className={styles.row} style={{ marginTop: 12 }}>
          <button className={styles.btn} onClick={submit} disabled={submitting || !prompt.trim()}>
            {submitting ? "Starting…" : "Run automation"}
          </button>
          {error && <span className={styles.fail}>{error}</span>}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={`${styles.row} ${styles.between}`}>
          <strong>Connections</strong>
          <span className={styles.muted}>Enable a data connection for the agent to use.</span>
        </div>
        {connections.map((c) => (
          <div key={c.id} style={{ marginTop: 12 }}>
            <div className={`${styles.row} ${styles.between}`}>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => updateConnection(c.id, { enabled: e.target.checked })}
                />{" "}
                {c.name}
              </label>
              <span className={c.configured ? styles.pass : styles.running + " " + styles.badge}>
                {c.configured ? "configured" : "needs token + page id"}
              </span>
            </div>
            {c.type === "notion" && (
              <div className={styles.row} style={{ marginTop: 8, gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Notion integration token</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="ntn_… / secret_…"
                    onBlur={(e) => e.target.value && updateConnection(c.id, { token: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Parent page id</label>
                  <input
                    className={styles.input}
                    defaultValue={c.parentPageId ?? ""}
                    placeholder="32-char page id"
                    onBlur={(e) => updateConnection(c.id, { parentPageId: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={`${styles.row} ${styles.between}`}>
          <strong>Previous runs</strong>
          <button className={styles.btnGhost} onClick={() => loadRuns()}>Refresh</button>
        </div>
        <ul className={styles.list}>
          {runs.length === 0 && <li className={styles.muted} style={{ paddingTop: 10 }}>No runs yet.</li>}
          {runs.map((r) => (
            <li key={r.id} className={styles.listItem}>
              <a href={`/runs/${r.id}`} style={{ flex: 1 }}>
                {r.prompt.slice(0, 80)}
              </a>
              <span className={styles.muted}>{r.status}</span>
              {r.evaluation && (
                <span className={`${styles.badge} ${r.evaluation.verdict === "pass" ? styles.pass : styles.fail}`}>
                  {r.evaluation.verdict}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
