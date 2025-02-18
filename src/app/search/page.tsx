"use client";

import React, { useState } from 'react';

interface SearchMatch {
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

interface SearchResult {
  file_name: string;
  file_url: string;
  total_chunks: number;
  matches: SearchMatch[];
  best_match: number;
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!query) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error performing search');
      }
      
      setResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      alert('Error performing search');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-(calc(100vh-4rem)) pt-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-center mb-6">חיפוש מסמכים</h1>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="הכנס את שאילתת החיפוש שלך..."
                value={query} 
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md p-2"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                disabled={!query || isLoading}
              >
                {isLoading ? 'מחפש...' : 'חפש'}
              </button>
            </div>
          </div>
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">תוצאות:</h2>
            <div className="space-y-8">
              {results.map((result, index) => (
                <div key={index} className="border-b last:border-b-0 pb-6 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <a 
                        href={result.file_url} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium text-lg"
                      >
                        {result.file_name}
                      </a>
                      <p className="text-sm text-gray-500">
                        התאמה: {(result.best_match * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4 mt-3">
                    {result.matches.map((match, matchIndex) => (
                      <div 
                        key={matchIndex}
                        className="bg-gray-50 rounded p-3 border-r-4 border-blue-500"
                      >
                        <div className="text-sm text-gray-500 mb-1">
                          קטע {match.chunk_index + 1} מתוך {result.total_chunks} • 
                          התאמה: {(match.similarity * 100).toFixed(1)}%
                        </div>
                        <div className="text-gray-700 whitespace-pre-line">
                          {match.chunk_text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && query && !isLoading && (
          <div className="bg-white rounded-lg shadow-lg p-6 text-center text-gray-500">
            לא נמצאו תוצאות
          </div>
        )}
      </div>
    </div>
  );
}
