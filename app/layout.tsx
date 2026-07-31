import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "职位雷达｜个人求职整理工具",
  description: "导入职位、设置筛选条件，快速找到更值得投递的机会。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
