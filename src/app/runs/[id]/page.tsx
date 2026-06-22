"use client";

import { use } from "react";
import styles from "../../ui.module.css";
import { useRunStream } from "./useRunStream";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" ? styles.pass : status === "failed" ? styles.fail : styles.running;
  return <span className={`${styles.badge} ${cls}`}>{status}</span>;
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { run, connected } = useRunStream(id);

  if (!run) {
    return (
      <main className={styles.page}>
        <a href="/">← Back</a>
        <p className={styles.muted} style={{ marginTop: 16 }}>Loading run…</p>
      </main>
    );
  }

  const toolsUsed = Array.from(
    new Set(run.steps.filter((s) => s.toolName).map((s) => s.toolName!)),
  );

  return (
    <main className={styles.page}>
      <a href="/">← Back</a>

      <section className={styles.panel} style={{ marginTop: 12 }}>
        <div className={`${styles.row} ${styles.between}`}>
          <h1 className={styles.h1}>Run {id.slice(0, 8)}</h1>
          <StatusBadge status={run.status} />
        </div>
        <p className={styles.sub}>{run.prompt}</p>
        <div className={styles.row} style={{ gap: 16, flexWrap: "wrap" }}>
          <span className={styles.muted}>Steps: {run.steps.length}</span>
          <span className={styles.muted}>
            Connections: {run.connectionsEnabled.length ? run.connectionsEnabled.join(", ") : "none"}
          </span>
          <span className={styles.muted}>Tools: {toolsUsed.length ? toolsUsed.join(", ") : "—"}</span>
          <span className={styles.muted}>{connected ? "● live" : "○ idle"}</span>
        </div>
        {run.error && <p className={styles.fail}>{run.error}</p>}
      </section>

      {run.artifacts.length > 0 && (
        <section className={styles.panel}>
          <strong>Artifacts</strong>
          <ul className={styles.list}>
            {run.artifacts.map((a) => (
              <li key={a.name} className={styles.listItem}>
                <span>{a.name}</span>
                <a href={`/api/runs/${id}/artifacts/${encodeURIComponent(a.name)}`} download>
                  Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {run.evaluation && (
        <section className={styles.panel}>
          <div className={`${styles.row} ${styles.between}`}>
            <strong>Evaluation</strong>
            <span
              className={`${styles.badge} ${run.evaluation.verdict === "pass" ? styles.pass : styles.fail}`}
            >
              {run.evaluation.verdict} · {(run.evaluation.score * 100).toFixed(0)}%
            </span>
          </div>
          <ul className={styles.list}>
            {run.evaluation.deterministicChecks.map((c) => (
              <li key={c.name} className={styles.listItem}>
                <span>{c.passed ? "✓" : "✗"} {c.name}</span>
                <span className={styles.muted}>{c.detail}</span>
              </li>
            ))}
          </ul>
          {run.evaluation.judgeReasons.length > 0 && (
            <ul className={styles.muted} style={{ marginTop: 8 }}>
              {run.evaluation.judgeReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={styles.panel}>
        <strong>Timeline</strong>
        <ul className={styles.list}>
          {run.steps.map((s) => (
            <li key={s.seq} className={styles.listItem}>
              <div style={{ flex: 1 }}>
                <div className={s.type === "mcp_call" ? styles.running : undefined}>
                  {s.type === "mcp_call" ? "🔌 " : ""}
                  {s.title}
                </div>
                {s.detail && (
                  <pre className={styles.muted} style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                    {s.detail}
                  </pre>
                )}
              </div>
              <span className={styles.muted}>{s.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
