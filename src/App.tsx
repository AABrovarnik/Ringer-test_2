/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Trash2, 
  Plus, 
  Play, 
  Loader2, 
  Download, 
  FileAudio, 
  X, 
  Terminal,
  Copy,
  CheckCircle2,
  Video,
  Headset
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';

// --- Types ---

type AppStatus = 'idle' | 'received' | 'processing' | 'done';

interface LogEntry {
  timestamp: string;
  type: 'request' | 'response' | 'error';
  content: any;
}

interface BackendResponse {
  status: 'ok' | 'error';
  analysis?: string;
  message?: string;
}

// --- Constants ---

const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg'];
const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
const ALLOWED_EXTENSIONS = [...AUDIO_EXT, ...VIDEO_EXT];
const BACKEND_URL = '/proxy-analyze';

// --- Utilities ---

const formatTimestamp = () => new Date().toLocaleTimeString();

export default function App() {
  // --- State ---
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [criteria, setCriteria] = useState<string[]>(['Приветствие', 'Выявление проблемы', 'Обработка возражений']);
  const [newCriterion, setNewCriterion] = useState('');
  
  const [status, setStatus] = useState<AppStatus>('idle');
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [errorHeader, setErrorHeader] = useState<string | null>(null);
  
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // --- Helpers ---

  const isVideoFile = (f: File | null) => {
    if (!f) return false;
    if (f.type.startsWith('video/')) return true;
    return VIDEO_EXT.some(ext => f.name.toLowerCase().endsWith(ext));
  };

  const getAccentColor = () => {
    if (isVideoFile(file)) return 'blue';
    if (text || (file && !isVideoFile(file))) return 'green';
    return 'blue'; // default
  };

  const accentColor = getAccentColor();

  const addLog = (type: LogEntry['type'], content: any) => {
    let logContent = content;
    if (content instanceof Error) {
      logContent = {
        message: content.message,
        name: content.name,
        stack: content.stack?.split('\n').slice(0, 2).join('\n')
      };
    }
    setLogs(prev => [...prev, { timestamp: formatTimestamp(), type, content: logContent }]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    const fileName = selectedFile.name.toLowerCase();
    const hasAllowedExt = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
    
    if (hasAllowedExt) {
      setFile(selectedFile);
      setText(''); // Reset text when file selected
      setStatus('received');
      setErrorHeader(null);
      addLog('request', { action: 'file_selected', name: selectedFile.name, size: selectedFile.size });
    } else {
      setErrorHeader('Неверный формат, загрузите аудио или видео');
    }
  };

  const handleTextPaste = (e: React.ClipboardEvent<HTMLDivElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    let content = '';
    if ('clipboardData' in e) {
      content = e.clipboardData.getData('text');
    } else {
      content = e.target.value;
    }

    if (content.trim()) {
      setText(content);
      setFile(null); // Reset file when text pasted
      setStatus('received');
      setErrorHeader(null);
      addLog('request', { action: 'text_pasted', length: content.length });
    }
  };

  const clearInputs = () => {
    setFile(null);
    setText('');
    setStatus('idle');
    setAnalysisResult('');
    setErrorHeader(null);
    addLog('request', { action: 'clear_all' });
  };

  const addObjective = () => {
    if (!newCriterion.trim()) {
      setErrorHeader('Введите название критерия');
      return;
    }
    setCriteria(prev => [...prev, newCriterion.trim()]);
    setNewCriterion('');
    setErrorHeader(null);
  };

  const removeObjective = (index: number) => {
    setCriteria(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (status === 'processing') return;

    if (!file && !text.trim()) {
      setErrorHeader('Добавьте файл или вставьте текст');
      return;
    }

    setStatus('processing');
    setErrorHeader(null);
    
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    } else {
      formData.append('text', text);
    }
    formData.append('criteria', JSON.stringify(criteria));

    addLog('request', { 
      url: BACKEND_URL, 
      type: file ? 'file' : 'text', 
      criteria 
    });

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data: BackendResponse = await response.json();
        addLog('response', data);

        if (data.status === 'ok' && data.analysis) {
          setAnalysisResult(data.analysis);
          setStatus('done');
          setTimeout(() => {
            resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        } else {
          setStatus('received');
          setErrorHeader(data.message || 'Произошла ошибка при анализе');
        }
      } else {
        const textResponse = await response.text();
        const doc = new DOMParser().parseFromString(textResponse, 'text/html');
        const title = doc.querySelector('title')?.textContent || 'Нет заголовка';
        
        addLog('error', { 
          message: 'Сервер вернул HTML вместо данных (возможно, бэкенд просыпается или заблокирован)', 
          status: response.status, 
          htmlTitle: title,
          bodySnippet: textResponse.slice(0, 300) 
        });
        setStatus('received');
        setErrorHeader(`Ошибка сервера: ${title} (${response.status})`);
      }
    } catch (err) {
      addLog('error', err);
      setStatus('received');
      setErrorHeader('Ошибка сети. Проверьте соединение с бэкендом.');
    }
  };

  const downloadPDF = () => {
    if (!analysisResult) {
      setErrorHeader('Сначала получите результат анализа');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxLineWidth = pageWidth - margin * 2;

    doc.setFontSize(16);
    doc.text('Результат анализа звонка', margin, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Дата: ${new Date().toLocaleDateString()}`, margin, 30);
    doc.text(`Тип данных: ${file ? `Файл (${file.name})` : 'Текст'}`, margin, 38);
    
    doc.setDrawColor(200);
    doc.line(margin, 42, pageWidth - margin, 42);

    doc.setFontSize(11);
    doc.setTextColor(0);
    
    const lines = doc.splitTextToSize(analysisResult, maxLineWidth);
    doc.text(lines, margin, 50);

    doc.save('call_analysis.pdf');
    addLog('request', { action: 'pdf_downloaded' });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(analysisResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-6 selection:bg-blue-100 selection:text-blue-900 relative overflow-hidden">
      
      <div className="max-w-7xl mx-auto space-y-5 relative z-10">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${accentColor === 'blue' ? 'bg-blue-600' : 'bg-green-600'} rounded-xl flex items-center justify-center text-white font-bold text-xl transition-colors duration-500`}>AI</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none uppercase">Анализ звонков ИИ</h1>
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mt-1">Интеллектуальная обработка диалогов</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status === 'processing' ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></span>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                {status === 'processing' ? 'Обработка' : 'Готово'}
              </span>
            </div>
            <button 
              onClick={clearInputs}
              className="px-4 py-2 bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-white uppercase tracking-tight transition-colors shadow-sm"
            >
              Сброс панели
            </button>
          </div>
        </header>

        {/* Top Section - Bento Layout */}
        <div className="grid grid-cols-12 gap-5">
          
          {/* Column 1 - Input Data */}
          <section className="col-span-12 lg:col-span-4">
            <div className={`bg-white/75 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[400px] relative transition-all duration-300 outline-none
                ${dragActive ? `border-${accentColor}-400 bg-${accentColor}-50/20` : ''}
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onPaste={handleTextPaste}
              tabIndex={0}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ввод данных</h3>
                <AnimatePresence>
                  {errorHeader && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="text-red-500 text-[10px] font-bold uppercase"
                    >
                      {errorHeader}
                    </motion.div>
                  )}
                </AnimatePresence>
                {!errorHeader && <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded text-slate-500 tracking-tight uppercase">Аудио и Видео</span>}
              </div>

              <div className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-300 group cursor-pointer overflow-hidden
                ${(file || text) ? 'border-solid border-slate-100 bg-slate-50/50' : `border-slate-200 bg-slate-50 hover:border-${accentColor}-300`}
              `}>
                {/* Upload UI */}
                {!file && !text && (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6 text-blue-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">Перетащите файл</p>
                    <p className="text-[10px] text-slate-400 mt-1 px-4">или нажмите (Ctrl+V)</p>
                    
                    <input 
                      type="file" 
                      id="file-input"
                      className="hidden" 
                      onChange={(e) => e.target.files && handleFileSelection(e.target.files[0])}
                      accept=".mp3,.wav,.m4a,.ogg,.mp4,.mov,.avi,.webm,.mkv"
                    />
                    <label 
                      htmlFor="file-input"
                      className={`mt-4 inline-block cursor-pointer bg-white border border-slate-200 px-4 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all select-none`}
                    >
                      ФАЙЛ
                    </label>
                  </div>
                )}

                {/* Status Display - File */}
                {file && (
                  <div className="text-center animate-in fade-in zoom-in duration-300 px-4">
                    <div className={`w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100 transition-colors duration-500`}>
                      {isVideoFile(file) ? (
                        <Video className="w-7 h-7 text-blue-500" />
                      ) : (
                        <FileAudio className="w-7 h-7 text-green-500" />
                      )}
                    </div>
                    <p className="text-xs font-bold truncate max-w-[200px] text-slate-800 mx-auto">{file.name}</p>
                    <p className={`text-[9px] uppercase font-black ${isVideoFile(file) ? 'text-blue-500' : 'text-green-500'} mt-1 tracking-widest transition-colors`}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB • ГОТОВО
                    </p>
                  </div>
                )}

                {/* Status Display - Text */}
                {text && (
                  <div className="text-center w-full animate-in fade-in zoom-in duration-300 px-6">
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm border border-slate-100">
                      <FileText className="w-7 h-7 text-green-500" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-800 uppercase">ТЕКСТ ГОТОВ</p>
                    <textarea 
                       className="mt-2 w-full bg-white/50 rounded-lg p-2 text-[9px] text-slate-500 italic border border-slate-100 h-12 resize-none focus:outline-none"
                       value={text}
                       readOnly
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button 
                  onClick={handleAnalyze}
                  disabled={status === 'processing'}
                  className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 transition-all font-black text-sm uppercase tracking-widest shadow-lg
                    ${status === 'processing' 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                      : accentColor === 'blue' 
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
                        : 'bg-green-600 text-white hover:bg-green-700 shadow-green-100'
                    }
                  `}
                >
                  {status === 'processing' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  {status === 'processing' ? 'В ПРОЦЕССЕ...' : 'СТАРТ'}
                </button>
              </div>
            </div>
          </section>

          {/* Column 2 - Criteria */}
          <section className="col-span-12 lg:col-span-4 text-left">
            <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[400px]">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 text-left">Критерии анализа</h3>
              
              <div className="flex flex-col items-start gap-2 mb-auto overflow-y-auto max-h-[220px] scrollbar-hide py-1">
                <AnimatePresence mode="popLayout">
                  {criteria.map((item, idx) => (
                    <motion.div 
                      layout
                      key={`${item}-${idx}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`flex items-center gap-2 bg-${accentColor}-50/50 border border-${accentColor}-100 px-3 py-1.5 rounded-lg group hover:border-${accentColor}-200 transition-all duration-500 w-full md:w-auto`}
                    >
                      <span className={`text-[11px] font-bold text-${accentColor}-700 transition-colors truncate`}>{item}</span>
                      <button 
                        onClick={() => removeObjective(idx)}
                        disabled={status === 'processing'}
                        className={`ml-auto text-${accentColor}-400 hover:text-${accentColor}-600 transition-colors disabled:opacity-50`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {criteria.length === 0 && (
                  <p className="text-slate-300 text-[11px] font-bold italic uppercase tracking-wider text-left">Список пуст</p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-left">Добавить критерий</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addObjective()}
                    disabled={status === 'processing'}
                    placeholder="Новый критерий"
                    className={`flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-${accentColor}-500/10 placeholder:text-slate-300 transition-all outline-none`}
                  />
                  <button 
                    onClick={addObjective}
                    disabled={status === 'processing'}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-black transition-all active:scale-95 disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Column 3 - Specialist Figure */}
          <section className="col-span-12 lg:col-span-4">
            <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px] relative overflow-hidden items-center justify-center group transition-all duration-500 hover:bg-white/80">
               <h3 className="absolute top-6 left-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">Визуальный помощник</h3>
               <div className="relative group-hover:scale-110 transition-transform duration-700 ease-out">
                  <svg width="240" height="240" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.15" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500 animate-pulse-slow">
                    <path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z" strokeDasharray="1 1"/>
                    <path d="M18 10a8 8 0 0 1-12 0" strokeDasharray="1 1"/>
                    <path d="M12 10v10" strokeDasharray="1 1"/>
                    <path d="M8 20h8" strokeDasharray="1 1"/>
                    <path d="M4 12V4" strokeDasharray="1 1"/>
                    <path d="M20 12V4" strokeDasharray="1 1"/>
                    <circle cx="12" cy="7" r="3" strokeDasharray="1 1"/>
                    <path d="M15 14h.01" strokeDasharray="1 1"/>
                    <path d="M12 18V12" strokeDasharray="1 1"/>
                    <rect x="7" y="12" width="10" height="8" rx="2" strokeDasharray="1 1"/>
                  </svg>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-orange-400/5 rounded-full blur-3xl group-hover:bg-orange-400/10 transition-colors" />
               </div>
               <div className="mt-8 text-center px-8">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Голосовой ассистент</p>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-1 h-1 bg-orange-500 rounded-full animate-bounce delay-0" />
                    <span className="w-1 h-1 bg-orange-500 rounded-full animate-bounce delay-75" />
                    <span className="w-1 h-1 bg-orange-500 rounded-full animate-bounce delay-150" />
                  </div>
               </div>
            </div>
          </section>

          {/* Results Bento Box */}
          <section ref={resultRef} className="col-span-12">
            <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[380px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Результаты анализа</h3>
                <div className="flex gap-2">
                  {analysisResult && (
                    <button 
                      onClick={copyToClipboard}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 hover:bg-white transition-all active:scale-95"
                    >
                      {copied ? 'СКОПИРОВАНО' : 'КОПИРОВАТЬ'}
                    </button>
                  )}
                  <button 
                    onClick={downloadPDF}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm
                      ${analysisResult 
                        ? 'bg-slate-900 text-white hover:bg-black' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }
                    `}
                  >
                    <Download className="w-3 h-3" />
                    СКАЧАТЬ PDF
                  </button>
                </div>
              </div>

              <div className={`flex-1 rounded-xl p-6 border relative transition-all duration-500 overflow-hidden
                ${!analysisResult ? 'bg-slate-50 border-slate-100 flex items-center justify-center text-center' : 'bg-slate-50/50 border-slate-200'}
              `}>
                 {!analysisResult ? (
                   <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                     Ожидание входных данных для анализа...
                   </p>
                 ) : (
                   <motion.div 
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className="prose prose-slate max-w-none"
                   >
                     <div className="whitespace-pre-wrap leading-relaxed text-slate-700 text-sm font-medium text-left">
                       {analysisResult}
                     </div>
                   </motion.div>
                 )}
              </div>
            </div>
          </section>

          {/* Log Bento Box */}
          <section className="col-span-12">
             <div className="bg-slate-900 rounded-2xl p-4 flex flex-col border border-slate-800 shadow-2xl relative overflow-hidden group">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800/50">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-blue-500">
                        <Terminal className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-200 uppercase tracking-[0.2em]">Логи отладки</span>
                        <span className="text-[8px] font-bold text-slate-600 uppercase">Прямая трансляция активна</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setLogs([])}
                        className="text-[8px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest px-2 py-1 bg-slate-800/50 rounded transition-all"
                      >
                        Очистить
                      </button>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={showLogs}
                          onChange={(e) => setShowLogs(e.target.checked)}
                          className="w-3 h-3 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0"
                        />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Переключить</span>
                      </label>
                   </div>
                </div>

                <AnimatePresence>
                  {showLogs && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="max-h-[200px] overflow-y-auto scrollbar-hide space-y-3 font-mono text-[9px]"
                    >
                      {logs.length === 0 && <p className="text-slate-700 italic">Активность не зарегистрирована.</p>}
                      {logs.map((log, i) => (
                        <div key={i} className="flex gap-4 border-l border-slate-800 pl-4 py-1">
                          <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                          <span className={`${
                            log.type === 'request' ? 'text-blue-400' :
                            log.type === 'response' ? 'text-green-400' : 'text-red-400'
                          } font-bold uppercase`}>
                            {log.type}
                          </span>
                          <span className="text-slate-400 truncate max-w-2xl">{JSON.stringify(log.content)}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {!showLogs && (
                  <div className="flex items-center gap-4 text-green-500/50 font-mono text-[9px] font-bold">
                    <span>{logs.length > 0 ? `[Последнее: ${logs[logs.length-1].timestamp}]` : '[Система готова]'}</span>
                    <span className="text-slate-700">|</span>
                    <span className="animate-pulse">_</span>
                  </div>
                )}
             </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="pt-8 pb-12 flex items-center justify-between border-t border-slate-200 opacity-50">
           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">
             © 2026 На базе систем ИИ корпоративного уровня
           </p>
           <div className="flex gap-4">
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-tight">Задержка: 2ms</span>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-tight">Статус: Глобальное API</span>
           </div>
        </footer>

      </div>
    </div>
  );
}
