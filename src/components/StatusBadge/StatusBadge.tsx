import styles from "./StatusBadge.module.scss";

export default function StatusBadge({
  text,
  tone,
}: {
  text: string;
  tone: "ok" | "err" | "warn" | "muted";
}) {
  return (
    <div className={styles.badge} data-tone={tone}>
      <span className={styles.dot} />
      <span>{text}</span>
    </div>
  );
}
