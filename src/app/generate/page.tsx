'use client';

import React, { useState } from 'react';

interface GenerateResponse {
  content: string;
  debug: {
    contextChunks: number;
    hasContext: boolean;
    query: string;
  };
}

export default function GeneratePage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-4">יצירת תוכן</h1>
        <p className="text-gray-600">
          שאל שאלה והמערכת תענה בהתבסס על המסמכים שהועלו
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="mb-4">
          <textarea
            value={query}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
            placeholder="מה תרצה לשאול?"
            className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className={`w-full py-2 px-4 rounded-lg text-white font-medium ${
            loading || !query.trim()
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {loading ? 'מעבד...' : 'שלח שאלה'}
        </button>
      </form>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">תשובה:</h2>
            <div className="prose max-w-none">
              {result.content.split('\n').map((line, i) => (
                <p key={i} className="mb-4">
                  {line}
                </p>
              ))}
            </div>
          </div>

          {result.debug?.hasContext && (
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">סטטוס:</h3>
              <p className="text-gray-700">
                נמצאו {result.debug.contextChunks} קטעי טקסט רלוונטיים במאגר
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
