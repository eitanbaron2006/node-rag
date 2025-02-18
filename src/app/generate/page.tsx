"use client";

import React, { useState } from 'react';

interface Source {
  file_name: string;
  similarity: number;
}

interface GenerateResponse {
  answer: string;
  sources: Source[];
}

export default function Generate() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!query) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error generating response');
      }
      
      setResult(data);
    } catch (error) {
      console.error('Generation error:', error);
      setError(error instanceof Error ? error.message : 'Error generating response');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-center mb-6">שאל שאלה על המסמכים שלך</h1>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="שאל שאלה על תוכן המסמכים..."
                value={query} 
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md p-2"
                onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
              />
              <button
                onClick={handleGenerate}
                className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                disabled={!query || isLoading}
              >
                {isLoading ? 'מעבד...' : 'שאל'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap mb-6">
                {result.answer}
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold mb-3">מקורות:</h3>
                <ul className="space-y-2">
                  {result.sources.map((source, index) => (
                    <li key={index} className="flex justify-between items-center">
                      <span className="text-gray-700">{source.file_name}</span>
                      <span className="text-gray-500 text-sm">
                        התאמה: {(source.similarity * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
