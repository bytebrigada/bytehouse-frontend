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
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="max-w-3xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
