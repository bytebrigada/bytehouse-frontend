"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./NameModal.module.scss";

export default function NameModal({
  open,
  initialName = "",
  onSubmit,
  onCancel,
}: {
  open: boolean;
  initialName?: string;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, initialName]);

  if (!open) return null;
  return (
    <div className={styles.backdrop} role="dialog" aria-modal>
      <div className={styles.modal}>
        <h3 className={styles.title}>Введите имя</h3>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            const v = name.trim();
            if (v) onSubmit(v);
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="например, Nikolay"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
          />
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              Продолжить
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel}>
                Отмена
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
