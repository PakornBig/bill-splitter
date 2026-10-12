import "./globals.css";

export const metadata = {
  title: "หารบิล | Bill Splitter",
  description: "เว็บสำหรับหารบิลและติดตามบิลคงค้าง",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
