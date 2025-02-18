import './globals.css';

export const metadata = {
  title: 'מערכת ניהול מסמכים חכמה',
  description: 'מערכת לניהול, חיפוש ויצירת תוכן מסמכים באמצעות AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  );
}
