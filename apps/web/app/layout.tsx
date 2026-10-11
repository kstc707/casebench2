import "./globals.css";

export const metadata = {
  title: "Casebench 2",
  description: "Learn how real open-source projects work, from your first fork to your first merged pull request.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
