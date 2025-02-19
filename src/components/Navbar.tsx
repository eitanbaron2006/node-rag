'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'בית' },
    { href: '/upload', label: 'העלאת קובץ' },
    { href: '/search', label: 'חיפוש מסמכים' },
    { href: '/generate', label: 'יצירת תוכן' },
    { href: '/admin', label: 'ניהול מערכת' }
  ];

  const isActive = (path: string) => pathname === path;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <nav className="bg-gray-800 text-white p-4 rtl">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex space-x-4 space-x-reverse">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={(e) => handleClick(e, href)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                isActive(href)
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}