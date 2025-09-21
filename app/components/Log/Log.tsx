import React from "react";
import styles from "./Log.module.scss";
import type { LogEntry } from "@/types/chat";

export default function Log({
  logs,
  logEndRef,
  onCopy,
  onClear,
  autoscroll,
  setAutoscroll,
}: {
  logs: LogEntry[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
  onCopy: () => void;
  onClear: () => void;
  autoscroll: boolean;
  setAutoscroll: (b: boolean) => void;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.actions}>
          <button onClick={onCopy}>Копировать лог</button>
          <button onClick={onClear}>Очистить</button>
          <label className={styles.badge}>
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
            />{" "}
            автоскролл
          </label>
        </div>
      </div>
      <div className={styles.log} aria-live="polite">
        {logs.map((l) => (
          <div key={l.id} className={styles.entry} data-kind={l.kind}>
            <div className={styles.meta}>
              <span className={styles.kind}>{l.kind.toUpperCase()}</span>
              <span className={styles.time}>{l.time}</span>
            </div>
            <pre className={styles.pre}>
              {typeof l.content === "string"
                ? l.content
                : (() => {
                    try {
                      return JSON.stringify(l.content, null, 2);
                    } catch {
                      return String(l.content);
                    }
                  })()}
            </pre>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
