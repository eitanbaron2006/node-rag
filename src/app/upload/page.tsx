"use client";

import React, { useState } from 'react';

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const allowedTypes = [
    'text/plain',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!allowedTypes.includes(selectedFile.type)) {
      setMessage({
        text: 'סוג הקובץ אינו נתמך. אנא העלה קובץ טקסט, CSV, JSON, PDF, או Word.',
        type: 'error'
      });
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setMessage(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'שגיאה בהעלאת הקובץ');
      }

      setMessage({
        text: 'הקובץ הועלה והתווקטור נוצר בהצלחה!',
        type: 'success'
      });
      setFile(null);
      if (document.querySelector('input[type="file"]')) {
        (document.querySelector('input[type="file"]') as HTMLInputElement).value = '';
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'שגיאה בהעלאת הקובץ',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">העלאת קובץ</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              בחר קובץ
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              accept={allowedTypes.join(',')}
              className="w-full border border-gray-300 rounded-md p-2"
              disabled={isLoading}
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                קובץ נבחר: {file.name}
              </p>
            )}
          </div>
          
          {message && (
            <div className={`p-3 rounded-md ${
              message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleUpload}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            disabled={!file || isLoading}
          >
            {isLoading ? 'מעלה...' : 'העלה קובץ'}
          </button>
        </div>
      </div>
    </div>
  );
}
