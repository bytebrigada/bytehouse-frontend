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
        <div>{children}</div>
      </body>
    </html>
  );
}
