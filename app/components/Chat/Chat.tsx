"use client";
import React, { useEffect } from "react";
import styles from "./Chat.module.scss";
import type { GroupedMessages } from "@/types/chat";

type Props = {
  groups: GroupedMessages[];
  autoscroll: boolean;
  setAutoscroll: (b: boolean) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
};

function safeTimeString(iso: string, locale?: string) {
  // если есть дробные секунды — оставим только 3 знака
  const fixed = iso.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d+)Z$/,
    (_, base, frac) => `${base}.${frac.slice(0, 3).padEnd(3, "0")}Z`
  );
  const d = new Date(fixed);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString(locale);
}

export default function Chat({
  groups,
  autoscroll,
  setAutoscroll,
  chatEndRef,
}: Props) {
  useEffect(() => {
    console.log(groups);
  }, [groups]);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <label className={styles.badge}>
          <input
            type="checkbox"
            checked={autoscroll}
            onChange={(e) => setAutoscroll(e.target.checked)}
          />{" "}
          автоскролл
        </label>
      </div>

      <div className={styles.chat} aria-live="polite">
        {groups.map((g) => (
          <div key={g.key} className={styles.group} data-mine={g.mine}>
            {!g.mine && <div className={styles.author}>{g.name}</div>}
            <div className={styles.bunch}>
              {g.items.map((it) => (
                <div key={it.id} className={styles.bubble}>
                  <div className={styles.text}>{it.text}</div>
                  <div className={styles.time}>
                    {safeTimeString(it.send_time)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
