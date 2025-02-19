import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import Navbar from '../components/Navbar.tsx';

// הסרת הייבוא של Inter font
// import { Inter } from 'next/font/google';
// const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'מערכת חיפוש מסמכים',
  description: 'מערכת חיפוש מסמכים בעברית',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      {/* הסרת ה-className מה-body */}
      <body className="font-sans">
        <Navbar />
        <main className="container mx-auto px-4 pt-8">
          {children}
        </main>
      </body>
    </html>
  );
}