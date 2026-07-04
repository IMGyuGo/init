import "../styles/globals.css";

import { AuthProvider } from "@/features/auth/AuthProvider";

export const metadata = {
  title: "INIT",
  description: "AI interview recruiting platform",
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
