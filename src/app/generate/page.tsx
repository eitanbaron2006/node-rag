'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  debug?: {
    contextChunks: number;
    hasContext: boolean;
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyCount, setHistoryCount] = useState<number>(6);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const textareaRef = useRef<null | HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: userMessage,
          history: messages.slice(-historyCount)  // שליחת מספר מוגבל של הודעות מההיסטוריה
        }),
      });

      if (!response.ok) {
        throw new Error(`שגיאת שרת: ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content,
        debug: {
          contextChunks: data.debug.contextChunks,
          hasContext: data.debug.hasContext
        }
      }]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'שגיאה לא ידועה';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `מצטער, אירעה שגיאה: ${errorMessage}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(200, Math.max(44, textarea.scrollHeight));
      textarea.style.height = `${newHeight}px`;
    }
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-semibold">שיחה על המידע</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="historyCount" className="text-sm text-gray-600">
            מספר הודעות בזיכרון:
          </label>
          <input
            id="historyCount"
            type="number"
            min="1"
            max="20"
            value={historyCount}
            onChange={(e) => setHistoryCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            className="w-16 p-1 text-center border rounded"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} items-end space-x-2 space-x-reverse`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white rounded-bl-lg mr-2'
                  : 'bg-gray-100 text-gray-800 rounded-br-lg ml-2'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
              {message.debug && (
                <div className={`text-xs mt-2 ${
                  message.role === 'user' 
                    ? 'text-blue-100' 
                    : 'text-gray-500'
                }`}>
                  {message.debug.hasContext 
                    ? `נמצאו ${message.debug.contextChunks} קטעי טקסט רלוונטיים` 
                    : 'לא נמצא מידע רלוונטי'}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-lg ml-2">
              <div className="flex items-center space-x-1 space-x-reverse">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4 bg-white">
        <form onSubmit={handleSubmit} className="flex items-end gap-2 items-start">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="הקלד הודעה..."
              rows={1}
              className="w-full p-3 border rounded-lg resize-none min-h-[44px] max-h-[200px] focus:ring-2 focus:ring-blue-500 focus:border-transparent leading-5"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={`h-[44px] px-4 rounded-lg font-medium transition-colors flex-shrink-0 ${
              loading || !input.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            שלח
          </button>
        </form>
      </div>
    </div>
  );
}
