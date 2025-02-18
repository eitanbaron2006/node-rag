'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-(calc(100vh-4rem)) pt-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">מערכת ניהול מסמכים חכמה</h1>
          <p className="text-xl text-gray-600">
            העלאה, חיפוש ויצירת תוכן מותאם אישית באמצעות AI
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link 
            href="/upload"
            className="block bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-semibold mb-4 text-blue-600">העלאת קבצים</h2>
            <p className="text-gray-600">
              העלה קבצים חדשים למערכת. המערכת תעבד אותם ותיצור Embeddings באופן אוטומטי.
            </p>
          </Link>

          <Link
            href="/search"
            className="block bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-semibold mb-4 text-blue-600">חיפוש מסמכים</h2>
            <p className="text-gray-600">
              חפש מסמכים רלוונטיים באמצעות חיפוש סמנטי מבוסס AI.
            </p>
          </Link>

          <Link
            href="/generate"
            className="block bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
          >
            <h2 className="text-2xl font-semibold mb-4 text-blue-600">יצירת תוכן</h2>
            <p className="text-gray-600">
              צור תוכן מותאם אישית (סיכומים, מבחנים, שיעורים) בהתבסס על המסמכים שלך.
            </p>
          </Link>
        </div>

        <div className="mt-12 text-center text-gray-500">
          <p>מופעל על ידי Gemini 2.0 Flash ו-Supabase</p>
        </div>
      </div>
    </div>
  );
}
