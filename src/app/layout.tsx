import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}

export const metadata = {
  title: "Couple Finance",
  description: "Quản lý tài chính vợ chồng",
  manifest: "/manifest.json",
  themeColor: "#000000",
};
