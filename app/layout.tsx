import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "职位雷达｜上海产品经理岗位",
  description: "只看上海产品经理岗位，按产品方向和岗位名称快速筛选。",
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
