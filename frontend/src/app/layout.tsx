import "../styles/globals.css";

import { AuthProvider } from "@/features/auth/AuthProvider";

export const metadata = {
  title: "INIT",
  description: "AI interview recruiting platform",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
