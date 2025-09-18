import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Байт Хаус",
  description: "Байт Хаус",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <header className="appbar">
          <div className="appbar-inner">
            <div className="brand">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect
                  x="3"
                  y="4"
                  width="18"
                  height="14"
                  rx="3"
                  fill="#1a73e8"
                />
                <rect x="6" y="7" width="12" height="8" rx="2" fill="white" />
              </svg>
              Байт Хаус
            </div>
            <div className="small">Voice chat</div>
          </div>
        </header>
        <div
          className="max-w-3xl"
          style={{
            margin: "0 auto",
            padding: "16px",
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
