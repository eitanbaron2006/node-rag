// deno-lint-ignore-file jsx-button-has-type
'use client';

import React, { useState, useEffect } from 'react';
import { toast, Toaster } from 'react-hot-toast';

interface StorageFile {
  id: string;
  name: string;
  created_at: string;
  size: number;
}

interface EmbeddingsInfo {
  count: number;
  file_name: string;
  last_updated: string;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
}

export default function AdminPage() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [embeddings, setEmbeddings] = useState<EmbeddingsInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [maxRetries, setMaxRetries] = useState(3);
  const [systemMaxRetries, setSystemMaxRetries] = useState(20);
  const [retryStrategy, setRetryStrategy] = useState('single'); // 'single' או 'all'
  const [confirmation, setConfirmation] = useState('');
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);

  useEffect(() => {
    fetchData();
    fetchSettings();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const storageRes = await fetch('/api/admin/storage');
      const embeddingsRes = await fetch('/api/admin/embeddings');
      
      if (storageRes.ok && embeddingsRes.ok) {
        const storageData = await storageRes.json();
        const embeddingsData = await embeddingsRes.json();
        
        setFiles(storageData.files);
        setEmbeddings(embeddingsData.embeddings);
      } else {
        toast.error('שגיאה בטעינת נתונים');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('שגיאה בטעינת נתונים');
    } finally {
      setIsLoading(false);
    }
  }
  
  async function fetchSettings() {
    try {
      const response = await fetch('/api/admin/settings');
      
      if (response.ok) {
        const data = await response.json();
        
        // עדכון מודלים זמינים
        if (data.availableModels && Array.isArray(data.availableModels)) {
          setAvailableModels(data.availableModels);
        }
        
        // עדכון הגדרות קיימות
        if (data.settings) {
          setSelectedModel(data.settings.selectedModel || '');
          setMaxRetries(data.settings.maxRetries || 3);
          setRetryStrategy(data.settings.retryStrategy || 'single');
        }
        
        // עדכון מגבלת מערכת
        if (data.systemMaxRetries) {
          setSystemMaxRetries(data.systemMaxRetries);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('שגיאה בטעינת הגדרות');
    }
  }

  async function handleDeleteAll() {
    if (confirmation !== 'מחק הכל') {
      toast.error('יש להקליד "מחק הכל" לאישור');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/delete-all', {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast.success('כל הנתונים נמחקו בהצלחה');
        setFiles([]);
        setEmbeddings([]);
        setConfirmation('');
      } else {
        toast.error('שגיאה במחיקת נתונים');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('שגיאה במחיקת נתונים');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteFile(fileName: string) {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/delete-file', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileName }),
      });
      
      if (response.ok) {
        toast.success(`הקובץ ${fileName} נמחק בהצלחה`);
        fetchData();
      } else {
        toast.error('שגיאה במחיקת הקובץ');
      }
    } catch (error) {
      console.error('Delete file error:', error);
      toast.error('שגיאה במחיקת הקובץ');
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings() {
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel,
          maxRetries,
          retryStrategy,
        }),
      });
      
      if (response.ok) {
        toast.success('ההגדרות נשמרו בהצלחה');
      } else {
        const error = await response.json();
        toast.error(`שגיאה בשמירת ההגדרות: ${error.message || 'אירעה שגיאה'}`);
      }
    } catch (error) {
      console.error('Save settings error:', error);
      toast.error('שגיאה בשמירת ההגדרות');
    }
  }

  return (
    <div className="container mx-auto pt-8 pb-16">
      <Toaster position="top-center" />
      <h1 className="text-2xl font-bold mb-6">ניהול מערכת</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* הגדרות כלליות */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">הגדרות AI</h2>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1">מודל AI:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md ltr"
              >
                {availableModels.length === 0 ? (
                  <option value="">טוען מודלים...</option>
                ) : (
                  availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                מקור: .env.local / GOOGLE_MODEL
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                מספר ניסיונות חוזרים (Retries): 
                <span className="text-xs text-gray-500 mr-1">
                  (מקסימום מערכת: {systemMaxRetries})
                </span>
              </label>
              <input
                type="number"
                min="0"
                max={systemMaxRetries}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Math.min(Number(e.target.value), systemMaxRetries))}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                מקור: .env.local / MODEL_RETRIES
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">אסטרטגיית ניסיונות:</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="single"
                    checked={retryStrategy === 'single'}
                    onChange={() => setRetryStrategy('single')}
                    className="ml-2"
                  />
                  <span>ניסיון חוזר על המודל הנבחר בלבד</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="all"
                    checked={retryStrategy === 'all'}
                    onChange={() => setRetryStrategy('all')}
                    className="ml-2"
                  />
                  <span>ניסיון עם כל המודלים ברצף ({availableModels.length} מודלים)</span>
                </label>
              </div>
            </div>
          </div>

          <button
            onClick={saveSettings}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            שמור הגדרות
          </button>
        </div>

        {/* מחיקת נתונים */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">מחיקת נתונים</h2>
          
          <div className="border border-red-200 bg-red-50 rounded-md p-4 mb-6">
            <h3 className="text-lg font-medium text-red-700 mb-2">מחיקת כל הנתונים</h3>
            <p className="text-red-600 mb-4">
              פעולה זו תמחק את כל הקבצים מהאחסון ואת כל ה-embeddings ממסד הנתונים. פעולה זו אינה ניתנת לביטול!
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                הקלד `&quot;`מחק הכל`&quot;` לאישור:
              </label>
              <input
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder='מחק הכל'
              />
            </div>
            
            <button
              onClick={handleDeleteAll}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400"
              disabled={isLoading || confirmation !== 'מחק הכל'}
            >
              {isLoading ? 'מוחק...' : 'מחק את כל הנתונים'}
            </button>
          </div>
        </div>
      </div>

      {/* טבלת קבצים */}
      <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
        <h2 className="text-xl font-semibold mb-4">קבצים מאוחסנים ({files.length})</h2>
        
        {isLoading ? (
          <div className="text-center py-8">טוען נתונים...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">לא נמצאו קבצים באחסון</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 text-right border">שם קובץ</th>
                  <th className="p-2 text-right border">נוצר בתאריך</th>
                  <th className="p-2 text-right border">גודל</th>
                  <th className="p-2 text-right border">embeddings</th>
                  <th className="p-2 text-right border">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => {
                  const fileEmbeddings = embeddings.find(e => e.file_name === file.name);
                  
                  return (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="p-2 border">{file.name}</td>
                      <td className="p-2 border">{new Date(file.created_at).toLocaleString('he-IL')}</td>
                      <td className="p-2 border">{formatFileSize(file.size)}</td>
                      <td className="p-2 border">{fileEmbeddings ? fileEmbeddings.count : 0}</td>
                      <td className="p-2 border">
                        <button
                          onClick={() => handleDeleteFile(file.name)}
                          className="text-red-600 hover:text-red-800"
                          disabled={isLoading}
                        >
                          מחק
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}