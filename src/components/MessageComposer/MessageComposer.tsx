import React, { useState } from "react";
import styles from "./MessageComposer.module.scss";

export default function MessageComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const send = () => {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue("");
  };
  return (
    <div className={styles.footer}>
      <div className={styles.composer}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Введите сообщение и нажмите Enter"
          disabled={disabled}
          type="text"
        />
        <button onClick={send} disabled={disabled}>
          Отправить
        </button>
      </div>
      <div className={styles.hint}>
        Отправляется как JSON:{" "}
        <code>
          {"{"}"text": "..."{"}"}
        </code>
      </div>
    </div>
  );
}
