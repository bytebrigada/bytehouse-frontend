import React from "react";
import styles from "./Chat.module.scss";
import type { GroupedMessages } from "@/types/chat";

export default function Chat({
  groups,
  autoscroll,
  setAutoscroll,
  chatEndRef,
}: {
  groups: GroupedMessages[];
  autoscroll: boolean;
  setAutoscroll: (b: boolean) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
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
                    {new Date(it.send_time).toLocaleTimeString()}
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
