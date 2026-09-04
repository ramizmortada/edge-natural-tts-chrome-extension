import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  FileText,
  Upload,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Sparkles,
  Settings,
  Trash2,
  Clock,
  Menu,
  PanelLeft,
  X,
  Eye,
  EyeOff,
  Volume2,
  CheckCircle2,
  ArrowDownCircle,
  ChevronDown,
  Check,
  Moon,
  Coffee,
  Scroll,
  Sun
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { state } from './state';
import { dom } from './dom';
import { readerDB } from './db';
import { StoredDoc } from './types';
import { loadDocumentFile, loadStoredDocument, loadDocumentFromBuffer, updateAllPageDurations } from './loaders';
import { jumpToPage, toggleSidebar, updateReaderTypography, showLoading, hideLoading } from './ui';
import { playSentenceAtIndex, pausePlayback, resumePlayback, stopPlayback } from './tts';

interface VoiceOption {
  id: string;
  name: string;
  gender: 'Female' | 'Male';
  region: string;
}

const VOICES: VoiceOption[] = [
  { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', region: 'US' },
  { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', region: 'US' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', gender: 'Female', region: 'UK' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', gender: 'Male', region: 'UK' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha', gender: 'Female', region: 'AU' },
  { id: 'en-AU-WilliamNeural', name: 'William', gender: 'Male', region: 'AU' },
];

interface FontOption {
  id: string;
  name: string;
  desc: string;
  fontClass: string;
}

const FONT_OPTIONS: FontOption[] = [
  { id: 'sans', name: 'Sans-Serif', desc: 'Modern', fontClass: 'font-sans' },
  { id: 'serif', name: 'Serif', desc: 'Book', fontClass: 'font-serif' },
  { id: 'mono', name: 'Monospace', desc: 'Code', fontClass: 'font-mono' },
];

interface SpeedPreset {
  rate: number;
  label: string;
}

const SPEED_PRESETS: SpeedPreset[] = [
  { rate: -50, label: '0.5x' },
  { rate: -25, label: '0.75x' },
  { rate: 0, label: '1.0x (Normal)' },
  { rate: 25, label: '1.25x' },
  { rate: 50, label: '1.5x' },
  { rate: 75, label: '1.75x' },
  { rate: 100, label: '2.0x' },
];

export function formatSpeed(ratePercent: number): string {
  const mult = 1 + ratePercent / 100;
  const rounded = Math.round(mult * 100) / 100;
  const str = (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.001) ? rounded.toFixed(1) : rounded.toFixed(2);
  return `${str}x`;
}

export function App() {
  const [view, setView] = useState<'home' | 'reader'>('home');
  const [recents, setRecents] = useState<StoredDoc[]>([]);
  const [docTitle, setDocTitle] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [rate, setRate] = useState<number>(0);
  const [voice, setVoice] = useState<string>('en-US-AriaNeural');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(true);
  const [currentTheme, setCurrentTheme] = useState<string>('dark');
  const [currentFontSize, setCurrentFontSize] = useState<number>(18);
  const [currentFontFamily, setCurrentFontFamily] = useState<string>('sans');
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isHostModalOpen, setIsHostModalOpen] = useState<boolean>(false);
  const [aiAlert, setAiAlert] = useState<{ isOpen: boolean; message: string; isKeyError: boolean }>({
    isOpen: false,
    message: '',
    isKeyError: false,
  });
  const [fileSchemeAlertOpen, setFileSchemeAlertOpen] = useState<boolean>(false);
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('gemini-3.1-flash-lite');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [sidebarQuery, setSidebarQuery] = useState<string>('');

  const [showVoiceMenu, setShowVoiceMenu] = useState<boolean>(false);
  const [showFontMenu, setShowFontMenu] = useState<boolean>(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const selectedVoiceObj = VOICES.find((v) => v.id === voice) || VOICES[0];
  const selectedFontObj = FONT_OPTIONS.find((f) => f.id === currentFontFamily) || FONT_OPTIONS[0];

  const homeFileInputRef = useRef<HTMLInputElement>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);
  const voiceMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  // Close voice dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(event.target as Node)) {
        setShowVoiceMenu(false);
      }
    }
    if (showVoiceMenu) {
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [showVoiceMenu]);

  // Close font dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fontMenuRef.current && !fontMenuRef.current.contains(event.target as Node)) {
        setShowFontMenu(false);
      }
    }
    if (showFontMenu) {
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [showFontMenu]);

  // Close speed dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setShowSpeedMenu(false);
      }
    }
    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [showSpeedMenu]);

  // Load Initial Settings & Recents
  useEffect(() => {
    loadRecentDocs();

    chrome.storage.local.get(
      ["voice", "rate", "pdfTheme", "pdfFontFamily", "pdfFontSize", "geminiApiKey", "geminiModel", "isAutoScrollEnabled"],
      (result: Record<string, any>) => {
        if (result.voice) {
          state.currentVoice = result.voice;
          setVoice(result.voice);
        }
        if (result.rate && Array.isArray(result.rate)) {
          state.currentRate = result.rate;
          setRate(result.rate[0]);
        }
        if (result.pdfTheme) {
          const t = result.pdfTheme === 'light' || result.pdfTheme === 'sepia' ? 'light' : 'dark';
          state.currentTheme = t;
          setCurrentTheme(t);
        } else {
          state.currentTheme = 'dark';
          setCurrentTheme('dark');
        }
        if (result.pdfFontFamily) {
          state.currentFontFamily = result.pdfFontFamily;
          setCurrentFontFamily(result.pdfFontFamily);
        }
        if (result.pdfFontSize) {
          state.currentFontSize = Number(result.pdfFontSize) || 18;
          setCurrentFontSize(state.currentFontSize);
        }
        if (result.geminiApiKey) {
          state.geminiApiKey = String(result.geminiApiKey);
          setGeminiKey(state.geminiApiKey);
        }
        if (result.geminiModel) {
          state.geminiModel = String(result.geminiModel);
          setGeminiModel(state.geminiModel);
        }
        if (result.isAutoScrollEnabled !== undefined) {
          state.isAutoScrollEnabled = Boolean(result.isAutoScrollEnabled);
          setIsAutoScroll(state.isAutoScrollEnabled);
        }
        updateReaderTypography();
      }
    );

    // Event Listeners for Loader & TTS Bridges
    const handleDocLoaded = (e: any) => {
      setView('reader');
      setDocTitle(e.detail.title || '');
      setTotalPages(e.detail.totalPages || 1);
      setCurrentPage(1);
      setPageInput('1');
      loadRecentDocs();
    };

    const handlePageChange = (e: any) => {
      const p = e.detail.page || 1;
      setCurrentPage(p);
      setPageInput(p.toString());
    };

    const handleTtsState = (e: any) => {
      setIsPlaying(e.detail.isPlaying ?? state.isPlaying);
      setIsPaused(e.detail.isPaused ?? state.isPaused);
    };

    const handleOpenHost = () => setIsHostModalOpen(true);
    const handleOpenAi = () => setIsAiModalOpen(true);
    const handleAiError = (e: any) => {
      setAiAlert({
        isOpen: true,
        message: e.detail?.message || 'Unknown error during AI cleaning.',
        isKeyError: !!e.detail?.isKeyError,
      });
    };

    window.addEventListener('doc-loaded', handleDocLoaded);
    window.addEventListener('page-change', handlePageChange);
    window.addEventListener('tts-state-change', handleTtsState);
    window.addEventListener('open-host-setup', handleOpenHost);
    window.addEventListener('open-ai-modal', handleOpenAi);
    window.addEventListener('ai-error', handleAiError);

    // Check if opened with importUrl parameter
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const importUrl = searchParams.get('importUrl');
      const importName = searchParams.get('name') || 'Document.pdf';

      if (importUrl) {
        window.history.replaceState({}, document.title, window.location.pathname);
        handleImportFromUrl(importUrl, importName);
      }
    } catch (e) {
      console.warn('Could not parse URL import params:', e);
    }

    return () => {
      window.removeEventListener('doc-loaded', handleDocLoaded);
      window.removeEventListener('page-change', handlePageChange);
      window.removeEventListener('tts-state-change', handleTtsState);
      window.removeEventListener('open-host-setup', handleOpenHost);
      window.removeEventListener('open-ai-modal', handleOpenAi);
      window.removeEventListener('ai-error', handleAiError);
    };
  }, []);

  const loadRecentDocs = async () => {
    try {
      const docs = await readerDB.getAllDocs();
      setRecents(docs);
    } catch (err) {
      console.error('Failed to load recent docs:', err);
    }
  };

  const handleOpenFile = (file: File) => {
    setView('reader');
    showLoading(`Loading ${file.name}...`);
    loadDocumentFile(file).then(() => {
      loadRecentDocs();
    });
  };

  const handleOpenStored = (doc: StoredDoc) => {
    setView('reader');
    showLoading(`Reopening ${doc.name}...`);
    loadStoredDocument(doc).then(() => {
      loadRecentDocs();
    });
  };

  const handleImportFromUrl = async (url: string, fileName: string) => {
    setView('reader');
    showLoading(`Importing ${fileName}...`);
    try {
      if (url.startsWith('file:') && (chrome as any).extension?.isAllowedFileSchemeAccess) {
        const isAllowed = await new Promise<boolean>((resolve) => {
          (chrome as any).extension.isAllowedFileSchemeAccess(resolve);
        });
        if (!isAllowed) {
          hideLoading();
          setFileSchemeAlertOpen(true);
          return;
        }
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file (${response.status} ${response.statusText})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';

      const storedDoc: StoredDoc = {
        id: fileName,
        name: fileName,
        type: ext,
        size: arrayBuffer.byteLength,
        arrayBuffer: arrayBuffer.slice(0),
        lastOpened: Date.now(),
        lastScrollTop: 0,
        lastPage: 1,
        lastSentenceIndex: 0,
        aiEdits: {}
      };

      await readerDB.saveDoc(storedDoc);
      chrome.storage.local.set({ last_active_doc_id: fileName });
      loadRecentDocs();

      await loadDocumentFromBuffer(fileName, ext, arrayBuffer.slice(0));
      hideLoading();
    } catch (err: any) {
      console.error('Failed to import file:', err);
      hideLoading();
      if (url.startsWith('file:')) {
        setFileSchemeAlertOpen(true);
      } else {
        alert(`Could not import document: ${err.message || err.toString()}`);
      }
    }
  };

  const handleDeleteRecent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await readerDB.deleteDoc(id);
    loadRecentDocs();
  };

  const handleClearAllRecents = async () => {
    if (confirm('Clear all recent documents history?')) {
      await readerDB.clearAll();
      chrome.storage.local.remove(['last_active_doc_id']);
      setRecents([]);
    }
  };

  const goToHome = () => {
    stopPlayback();
    setView('home');
    loadRecentDocs();
  };

  // Speed Adjustment
  const handleRateChange = (newVal: number) => {
    const clamped = Math.max(-50, Math.min(100, newVal));
    setRate(clamped);
    state.currentRate = [clamped];
    chrome.storage.local.set({ rate: [clamped] });
    updateAllPageDurations(clamped);
  };

  const stepSpeed = (delta: number) => {
    handleRateChange(rate + delta);
  };

  // Page Navigation
  const handlePageInputSubmit = (val: string) => {
    let p = parseInt(val, 10);
    if (isNaN(p) || p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    setCurrentPage(p);
    setPageInput(p.toString());
    jumpToPage(p);
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      handlePageInputSubmit((currentPage + 1).toString());
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      handlePageInputSubmit((currentPage - 1).toString());
    }
  };

  // Playback Handlers
  const handlePlayToggle = () => {
    if (isPlaying) {
      pausePlayback();
      setIsPlaying(false);
      setIsPaused(true);
    } else if (isPaused && state.activeSentenceIndex >= 0) {
      resumePlayback();
      setIsPlaying(true);
      setIsPaused(false);
    } else {
      if (state.activeSentenceIndex >= 0 && state.activeSentenceIndex < state.allSentences.length) {
        playSentenceAtIndex(state.activeSentenceIndex);
      } else {
        const curPage = currentPage;
        let targetSentenceIdx = state.allSentences.findIndex(s => s.pageNumber >= curPage);
        if (targetSentenceIdx === -1 && state.allSentences.length > 0) targetSentenceIdx = 0;
        if (targetSentenceIdx !== -1) {
          playSentenceAtIndex(targetSentenceIdx);
        }
      }
    }
  };

  const handleStop = () => {
    stopPlayback();
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handlePrevSentence = () => {
    if (state.activeSentenceIndex > 0) {
      playSentenceAtIndex(state.activeSentenceIndex - 1);
    }
  };

  const handleNextSentence = () => {
    if (state.activeSentenceIndex + 1 < state.allSentences.length) {
      playSentenceAtIndex(state.activeSentenceIndex + 1);
    }
  };

  const handleVoiceChange = (v: string) => {
    setVoice(v);
    state.currentVoice = v;
    chrome.storage.local.set({ voice: v });
  };

  const handleThemeChange = (t: string) => {
    const validTheme = t === 'light' ? 'light' : 'dark';
    setCurrentTheme(validTheme);
    state.currentTheme = validTheme;
    updateReaderTypography();
    chrome.storage.local.set({ pdfTheme: validTheme });
  };

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(12, Math.min(36, currentFontSize + delta));
    setCurrentFontSize(newSize);
    state.currentFontSize = newSize;
    updateReaderTypography();
    chrome.storage.local.set({ pdfFontSize: newSize });
  };

  const handleFontFamilyChange = (fam: string) => {
    setCurrentFontFamily(fam);
    state.currentFontFamily = fam;
    updateReaderTypography();
    chrome.storage.local.set({ pdfFontFamily: fam });
  };

  const handleSaveAiSettings = () => {
    state.geminiApiKey = geminiKey.trim();
    state.geminiModel = geminiModel.trim() || 'gemini-3.1-flash-lite';
    chrome.storage.local.set({ geminiApiKey: state.geminiApiKey, geminiModel: state.geminiModel });
    setIsAiModalOpen(false);
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleOpenFile(e.dataTransfer.files[0]);
    }
  };

  const formatTimeAgo = (time: number): string => {
    if (!time) return 'recently';
    const diff = Date.now() - time;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const isDarkTheme = currentTheme !== 'light';

  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDarkTheme]);

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden reader-book-container theme-${currentTheme}`}>
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={homeFileInputRef}
        className="hidden"
        accept=".pdf,.docx,.epub,.txt,.md,.markdown,.html,.htm,application/pdf"
        onChange={(e) => e.target.files?.[0] && handleOpenFile(e.target.files[0])}
      />
      <input
        type="file"
        ref={headerFileInputRef}
        className="hidden"
        accept=".pdf,.docx,.epub,.txt,.md,.markdown,.html,.htm,application/pdf"
        onChange={(e) => e.target.files?.[0] && handleOpenFile(e.target.files[0])}
      />

      {/* ========================================================= */}
      {/* TOP HEADER / APP BAR                                      */}
      {/* ========================================================= */}
      <header className="h-14 border-b reader-header-theme px-4 flex items-center justify-between z-40 shrink-0 gap-3 sticky top-0 select-none">
        {/* Left Section: Branding & Navigation */}
        <div className="flex items-center gap-2">
          {view === 'reader' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goToHome}
              className="mr-1 h-8 gap-1.5 px-2.5 rounded-lg opacity-80 hover:opacity-100"
              title="Return to Library Homepage"
            >
              <ArrowLeft className="size-4 text-emerald-500" />
              <span className="font-semibold text-xs">Library</span>
            </Button>
          )}

          <div
            className="flex items-center gap-2 cursor-pointer select-none group"
            onClick={goToHome}
            title="ReadFlow Library"
          >
            <img src="logo.png" alt="ReadFlow" className="size-6 rounded-md object-contain group-hover:scale-105 transition-transform" />
            <span className="font-bold text-sm tracking-tight text-emerald-500 group-hover:text-emerald-400 transition-colors">
              ReadFlow
            </span>
          </div>

          {view === 'reader' && (
            <>
              <div className="h-4 w-px opacity-20 bg-current mx-1" />
              <Button
                variant={isSidebarOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8 opacity-80 hover:opacity-100 rounded-lg"
                onClick={() => {
                  toggleSidebar();
                  setIsSidebarOpen(state.isSidebarOpen);
                }}
                title="Toggle Pages / TOC Sidebar"
              >
                <PanelLeft className="size-4" />
              </Button>

              <div
                className="max-w-[200px] truncate text-xs font-semibold reader-pill-theme border px-2.5 py-1 rounded-md"
                title={docTitle}
              >
                {docTitle || 'Document'}
              </div>
            </>
          )}
        </div>

        {/* Center Section: Page Navigation (Reader view only) */}
        {view === 'reader' && (
          <div className="flex items-center gap-2">
            {/* Pagination Controls Pill - Spacious & Well-Padded */}
            <div className="flex items-center gap-1.5 reader-pill-theme border px-2 py-1 rounded-lg h-9">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-md p-0 opacity-75 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                onClick={prevPage}
                disabled={currentPage <= 1}
                title="Previous Page"
              >
                <ChevronLeft className="size-4" />
              </Button>

              <div className="flex items-center gap-1 px-1">
                <input
                  type="text"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePageInputSubmit(pageInput)}
                  className="w-8 text-center text-xs font-semibold bg-transparent focus:outline-none border-b border-current/30 focus:border-emerald-500 pb-0.5"
                />
                <span className="text-xs opacity-50 font-medium">/</span>
                <span className="text-xs opacity-75 font-medium">{totalPages}</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-md p-0 opacity-75 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                onClick={nextPage}
                disabled={currentPage >= totalPages}
                title="Next Page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Right Section: Speech, Font, Theme & Playback */}
        <div className="flex items-center gap-2">
          {view === 'reader' ? (
            <>
              {/* Theme Toggle Button (1-Click) */}
              <Button
                variant="outline"
                size="icon"
                className="size-9 reader-pill-theme border rounded-lg opacity-80 hover:opacity-100"
                onClick={() => handleThemeChange(currentTheme === 'light' ? 'dark' : 'light')}
                title={currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {currentTheme === 'light' ? <Moon className="size-4 text-emerald-600" /> : <Sun className="size-4 text-emerald-400" />}
              </Button>

              {/* Font Style Dropdown */}
              <div className="relative" ref={fontMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 px-2.5 reader-pill-theme border rounded-lg text-xs font-medium gap-1.5 transition-colors hover:border-emerald-500/50 flex items-center justify-center ${
                    showFontMenu ? 'border-emerald-500 text-emerald-500' : ''
                  }`}
                  onClick={() => setShowFontMenu(!showFontMenu)}
                  title="Select Reading Font Style"
                >
                  <span className={`font-semibold ${selectedFontObj.fontClass}`}>{selectedFontObj.name}</span>
                  <ChevronDown className={`size-3 opacity-60 transition-transform duration-200 shrink-0 ${showFontMenu ? 'rotate-180' : ''}`} />
                </Button>

                {showFontMenu && (
                  <div className="absolute left-0 top-full mt-2 w-44 p-1.5 reader-popover-theme border rounded-xl z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95">
                    {FONT_OPTIONS.map((f) => {
                      const isSelected = currentFontFamily === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/40'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
                          }`}
                          onClick={() => {
                            handleFontFamilyChange(f.id);
                            setShowFontMenu(false);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${f.fontClass}`}>{f.name}</span>
                            <span className="text-[10px] opacity-60">({f.desc})</span>
                          </div>
                          {isSelected && <Check className="size-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Font Size Cluster: [A-] 18px [A+] */}
              <div
                className="flex items-center reader-pill-theme border rounded-lg h-9 p-0.5 select-none"
                title="Reading Font Size"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-75 hover:opacity-100 p-0 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0 font-bold text-xs"
                  onClick={() => handleFontSizeChange(-2)}
                  title="Decrease font size (-2px)"
                >
                  A-
                </Button>
                <span className="w-8 text-center text-xs font-mono font-bold tabular-nums text-emerald-500">
                  {currentFontSize}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-75 hover:opacity-100 p-0 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0 font-bold text-xs"
                  onClick={() => handleFontSizeChange(2)}
                  title="Increase font size (+2px)"
                >
                  A+
                </Button>
              </div>

              {/* Custom Voice Selector Dropdown */}
              <div className="relative" ref={voiceMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 px-3 reader-pill-theme border rounded-lg text-xs font-medium gap-2 transition-colors hover:border-emerald-500/50 flex items-center justify-center ${
                    showVoiceMenu ? 'border-emerald-500 text-emerald-500' : ''
                  }`}
                  onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                  title="Select Edge Neural Voice"
                >
                  <span className="font-semibold leading-none">{selectedVoiceObj.name}</span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 opacity-80 leading-none">
                    {selectedVoiceObj.region}
                  </span>
                  <ChevronDown className={`size-3 opacity-60 transition-transform duration-200 shrink-0 ${showVoiceMenu ? 'rotate-180' : ''}`} />
                </Button>

                {showVoiceMenu && (
                  <div className="absolute left-0 top-full mt-2 w-56 p-1.5 reader-popover-theme border rounded-xl z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95">
                    {VOICES.map((v) => {
                      const isSelected = voice === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/40'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
                          }`}
                          onClick={() => {
                            handleVoiceChange(v.id);
                            setShowVoiceMenu(false);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 border border-current/15 select-none shrink-0">
                              {v.region}
                            </span>
                            <div className="flex flex-col">
                              <span className="font-medium text-xs leading-tight">{v.name}</span>
                              <span className="text-[10px] opacity-60 leading-tight">{v.gender} &bull; {v.region}</span>
                            </div>
                          </div>
                          {isSelected && <Check className="size-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reading Speed Cluster: [-] [ 1.0x ▾ ] [+] with Presets Dropdown */}
              <div
                ref={speedMenuRef}
                className="relative flex items-center reader-pill-theme border rounded-lg h-9 p-0.5 select-none"
                title="Reading Speed"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-75 hover:opacity-100 p-0 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                  onClick={() => stepSpeed(-5)}
                  title="Decrease speed (-0.05x)"
                >
                  <Minus className="size-3.5" />
                </Button>

                {/* Stable, Fixed-Width Speed Selector Button */}
                <button
                  type="button"
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className={`h-7 w-[64px] px-1 mx-0.5 rounded-md flex items-center justify-center gap-1 text-xs font-mono font-bold tabular-nums transition-colors cursor-pointer border ${
                    showSpeedMenu
                      ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                      : 'border-transparent text-emerald-500 hover:bg-black/10 dark:hover:bg-white/10'
                  }`}
                  title="Select Speed Preset"
                >
                  <span>{formatSpeed(rate)}</span>
                  <ChevronDown className={`size-2.5 opacity-60 transition-transform duration-200 shrink-0 ${showSpeedMenu ? 'rotate-180' : ''}`} />
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-75 hover:opacity-100 p-0 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                  onClick={() => stepSpeed(5)}
                  title="Increase speed (+0.05x)"
                >
                  <Plus className="size-3.5" />
                </Button>

                {/* Speed Presets Dropdown Menu */}
                {showSpeedMenu && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-44 p-1.5 reader-popover-theme border rounded-xl z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95">
                    {SPEED_PRESETS.map((p) => {
                      const isSelected = rate === p.rate;
                      return (
                        <button
                          key={p.rate}
                          type="button"
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer font-medium ${
                            isSelected
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/40'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
                          }`}
                          onClick={() => {
                            handleRateChange(p.rate);
                            setShowSpeedMenu(false);
                          }}
                        >
                          <span className="font-mono tabular-nums">{p.label}</span>
                          {isSelected && <Check className="size-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons: Auto-scroll & AI */}
              <Button
                variant={isAutoScroll ? 'secondary' : 'ghost'}
                size="icon"
                className={`size-8 rounded-lg ${isAutoScroll ? 'bg-black/10 dark:bg-white/10 text-emerald-500 border border-black/15 dark:border-white/15' : 'opacity-70 hover:opacity-100'}`}
                onClick={() => {
                  const next = !isAutoScroll;
                  setIsAutoScroll(next);
                  state.isAutoScrollEnabled = next;
                  chrome.storage.local.set({ isAutoScrollEnabled: next });
                }}
                title={isAutoScroll ? "Auto-scroll speech tracking enabled" : "Auto-scroll speech tracking disabled"}
              >
                <ArrowDownCircle className="size-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                className={`h-9 px-2.5 reader-pill-theme border rounded-lg transition-colors flex items-center justify-center ${
                  isAiModalOpen || Boolean(geminiKey)
                    ? 'border-emerald-500 text-emerald-500'
                    : 'opacity-70 hover:opacity-100 hover:text-emerald-500'
                }`}
                onClick={() => setIsAiModalOpen(true)}
                title="Gemini AI OCR Text Cleaner Settings"
              >
                <Sparkles className="size-4" />
              </Button>

              {/* Harmonized TTS Audio Player Controls Pill */}
              <div className="flex items-center gap-1 reader-pill-theme border px-1.5 py-1 rounded-lg h-9">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md opacity-75 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 p-0 shrink-0"
                  onClick={handlePrevSentence}
                  title="Previous Sentence"
                >
                  <SkipBack className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 p-0 active:scale-95 transition-all shrink-0"
                  onClick={handlePlayToggle}
                  title={isPlaying ? "Pause Playback" : "Start Playback"}
                >
                  {isPlaying ? (
                    <Pause className="size-3.5 fill-current" />
                  ) : (
                    <Play className="size-3.5 fill-current ml-0.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md opacity-75 hover:text-red-500 hover:bg-black/10 dark:hover:bg-white/10 p-0 shrink-0"
                  onClick={handleStop}
                  title="Stop Playback"
                >
                  <Square className="size-3 fill-current" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md opacity-75 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 p-0 shrink-0"
                  onClick={handleNextSentence}
                  title="Next Sentence"
                >
                  <SkipForward className="size-3.5" />
                </Button>
              </div>
            </>
          ) : (
            /* Homepage Header Actions */
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8 reader-pill-theme border rounded-lg opacity-80 hover:opacity-100"
                onClick={() => handleThemeChange(currentTheme === 'light' ? 'dark' : 'light')}
                title={currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {currentTheme === 'light' ? <Moon className="size-4 text-emerald-600" /> : <Sun className="size-4 text-emerald-400" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className={`h-8 px-2.5 reader-pill-theme border rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium ${
                  isAiModalOpen || Boolean(geminiKey)
                    ? 'border-emerald-500 text-emerald-500'
                    : 'opacity-80 hover:opacity-100 hover:text-emerald-500'
                }`}
                onClick={() => setIsAiModalOpen(true)}
                title="Gemini AI OCR Text Cleaner Settings"
              >
                <Sparkles className="size-3.5 text-emerald-500" />
                <span>AI Cleaner</span>
              </Button>

              <Button
                variant="default"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 rounded-lg h-8 shadow-sm"
                onClick={() => headerFileInputRef.current?.click()}
              >
                <Upload className="size-4" />
                <span>Open Document</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* ========================================================= */}
      {/* PERSISTENT VIEW CONTAINER                                 */}
      {/* ========================================================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* VIEW A: HOMEPAGE / LIBRARY HUB */}
        <main
          className={`flex-1 overflow-y-auto px-6 py-8 ${view === 'home' ? 'block' : 'hidden'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="max-w-5xl mx-auto flex flex-col gap-8">
            {/* Hero Banner */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-emerald-500/10 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                  ReadFlow Library
                </Badge>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Listen & Read Naturally
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm max-w-2xl leading-relaxed">
                Distraction-free document reader powered by Microsoft Edge Neural HD voices with synchronized
                word highlighting, book layout, and Gemini AI OCR text cleanup.
              </p>
            </div>

            {/* Drag & Drop Upload Zone */}
            <Card
              className={`border-2 border-dashed transition-all cursor-pointer shadow-xs ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/30'
                  : 'border-slate-300 dark:border-slate-800 bg-white/90 dark:bg-slate-900/60 hover:border-emerald-500/50 hover:bg-slate-50/80 dark:hover:border-slate-700 dark:hover:bg-slate-900/90 ring-0'
              }`}
              onClick={() => homeFileInputRef.current?.click()}
            >
              <CardContent className="flex flex-col items-center justify-center text-center p-8 gap-4">
                <div className="size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Upload className="size-7" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Drag & drop your document here
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Supports PDF, Word (.docx), EPUB (.epub), Markdown (.md), Plain Text (.txt), and HTML
                  </p>
                </div>

                <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 mt-1 shadow-sm">
                  <FileText className="size-4" />
                  Browse Computer Files
                </Button>

                {/* Format Badges */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <Badge variant="pdf">PDF</Badge>
                  <Badge variant="docx">DOCX</Badge>
                  <Badge variant="epub">EPUB</Badge>
                  <Badge variant="txt">TXT & MD</Badge>
                  <Badge variant="secondary" className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">HTML</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Recent Documents Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Documents</h2>
                  <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {recents.length}
                  </Badge>
                </div>
                {recents.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 gap-1.5 h-8"
                    onClick={handleClearAllRecents}
                  >
                    <Trash2 className="size-3.5" />
                    Clear History
                  </Button>
                )}
              </div>

              {recents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recents.map((doc) => {
                    const ext = (doc.type || 'pdf').toLowerCase();
                    const badgeVariant =
                      ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'epub' ? 'epub' : 'txt';

                    return (
                      <Card
                        key={doc.id}
                        className="group border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-emerald-500/50 hover:bg-slate-50/80 dark:hover:bg-slate-900/90 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between ring-0"
                        onClick={() => handleOpenStored(doc)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Badge variant={badgeVariant} className="uppercase font-mono text-[10px]">
                              {ext}
                            </Badge>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Clock className="size-3" />
                              {formatTimeAgo(doc.lastOpened)}
                            </span>
                          </div>
                          <CardTitle className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" title={doc.name}>
                            {doc.name}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                            <span>{(doc.size / 1024).toFixed(0)} KB</span>
                            <span>&bull;</span>
                            <span>Page {doc.lastPage || 1}</span>
                          </CardDescription>
                        </CardHeader>

                        <CardFooter className="pt-0 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 p-3 bg-slate-50/70 dark:bg-slate-950/40">
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 group-hover:underline flex items-center gap-1">
                            <BookOpen className="size-3.5" />
                            Resume Reading
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 p-0"
                            onClick={(e) => handleDeleteRecent(doc.id, e)}
                            title="Remove from recents"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                /* Empty Recents State */
                <Card className="border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 text-center py-12 ring-0">
                  <CardContent className="flex flex-col items-center gap-3">
                    <div className="size-12 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400">
                      <BookOpen className="size-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No recent documents</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                      When you open documents, they will appear here so you can easily resume reading right where you left off.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>

        {/* VIEW B: READER VIEW (Document Pages & Audio Playback) */}
        <div id="reader-layout" className={`flex-1 flex overflow-hidden relative ${view === 'reader' ? 'flex' : 'hidden'}`}>
          {/* Collapsible Sidebar */}
          <aside
            id="reader-sidebar"
            className={`w-72 reader-header-theme border-r flex flex-col shrink-0 transition-all duration-200 ${
              isSidebarOpen ? 'ml-0' : '-ml-72'
            }`}
          >
            <div className="p-3 border-b border-current/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                  <BookOpen className="size-3.5" />
                  Document Pages
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-75 hover:opacity-100 p-0"
                  onClick={() => {
                    toggleSidebar(false);
                    setIsSidebarOpen(false);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search pages..."
                  value={sidebarQuery}
                  onChange={(e) => {
                    setSidebarQuery(e.target.value);
                    if (dom.sidebarSearchInput) {
                      dom.sidebarSearchInput.value = e.target.value;
                      dom.sidebarSearchInput.dispatchEvent(new Event('input'));
                    }
                  }}
                  className="h-7 text-xs reader-pill-theme border text-inherit"
                />
              </div>
            </div>

            <div id="sidebar-page-list" className="flex-1 overflow-y-auto p-2 space-y-1" />
          </aside>

          {/* Main Viewport Container */}
          <main id="reader-main" className="flex-1 flex flex-col overflow-hidden relative reader-book-container">
            {/* Loading Indicator */}
            <div
              id="loading-indicator"
              className="absolute inset-0 z-50 bg-background/85 backdrop-blur-md hidden flex-col items-center justify-center gap-3 transition-opacity duration-200"
            >
              <div className="size-9 rounded-full border-2 border-emerald-500/25 border-t-emerald-500 animate-spin" />
              <p id="loading-text" className="text-xs font-semibold text-foreground tracking-wide">
                Loading document...
              </p>
            </div>

            {/* Mode 1: Distraction-free Book Reader View */}
            <div
              id="reader-mode-view"
              className="flex-1 overflow-y-auto flex justify-center p-6 reader-book-container"
            >
              <div className="w-full max-w-3xl flex flex-col">
                <div id="reader-book-header" className="border-b border-current/15 pb-4 mb-6">
                  <h1 id="reader-book-title" className="text-2xl font-bold tracking-tight mb-2">
                    {docTitle}
                  </h1>
                  <div className="text-xs opacity-60 flex items-center gap-2">
                    <span id="reader-page-info">{totalPages} pages</span>
                    <span>&bull;</span>
                    <span id="reader-word-count">Reading with Edge TTS</span>
                  </div>
                </div>

                <div id="reader-content" className={`reader-content font-${currentFontFamily}`} />
              </div>
            </div>

            {/* Mode 2: Original PDF Canvas View */}
            <div
              id="pdf-viewer"
              className="flex-1 overflow-y-auto hidden justify-center p-6 bg-slate-900"
            >
              <div id="pages-container" className="flex flex-col items-center w-full" />
            </div>
          </main>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODALS: GEMINI AI & HOST SETUP                            */}
      {/* ========================================================= */}
      <Dialog open={isAiModalOpen} onOpenChange={setIsAiModalOpen}>
        <DialogContent className="reader-popover-theme border rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <Sparkles className="size-5 text-emerald-500 shrink-0" />
              <span>Gemini AI Text Cleaner</span>
            </DialogTitle>
            <DialogDescription className="opacity-75">
              Cleans OCR scanning artifacts, broken hyphenated words, and abnormal spacing page-by-page without changing your original text.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase opacity-75">Gemini API Key</label>
              <div className="relative flex items-center">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Enter your AI Studio key (AIzaSy...)"
                  className="pr-9 reader-pill-theme border focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <span className="text-[11px] opacity-70">
                Get a free API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-500 underline hover:text-emerald-400">Google AI Studio</a>.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase opacity-75">AI Model</label>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg reader-pill-theme border text-xs select-none">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-emerald-500">{geminiModel || 'gemini-3.1-flash-lite'}</span>
                  <span className="text-[10px] opacity-60 font-mono">v1beta</span>
                </div>
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-1.5 py-0 h-5">
                  Default
                </Badge>
              </div>
              <span className="text-[11px] opacity-70">
                Uses Google Gemini 3.1 Flash Lite for fast, accurate OCR cleanup and formatting repair.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" className="rounded-lg opacity-80 hover:opacity-100" onClick={() => setIsAiModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="default" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg" onClick={handleSaveAiSettings}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Host Setup Modal */}
      <Dialog open={isHostModalOpen} onOpenChange={setIsHostModalOpen}>
        <DialogContent className="reader-popover-theme border rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <Volume2 className="size-5 text-emerald-500 shrink-0" />
              <span>Voice Host Setup Required</span>
            </DialogTitle>
            <DialogDescription className="opacity-75">
              ReadFlow uses a lightweight local native helper to stream high-definition Microsoft Edge voices.
            </DialogDescription>
          </DialogHeader>

          <div className="reader-pill-theme border p-4 rounded-lg text-xs leading-relaxed flex flex-col gap-2 my-2">
            <div><strong>1.</strong> Open your unzipped ReadFlow directory.</div>
            <div><strong>2.</strong> Open the <code>native-host</code> folder.</div>
            <div><strong>3.</strong> Double-click <strong><code>install.bat</code></strong>.</div>
            <div className="opacity-75 mt-1">Requires Node.js from <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-emerald-500 underline hover:text-emerald-400">nodejs.org</a>.</div>
          </div>

          <DialogFooter>
            <Button variant="default" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg" onClick={() => setIsHostModalOpen(false)}>
              Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Cleaning Error Alert Dialog */}
      <AlertDialog
        open={aiAlert.isOpen}
        onOpenChange={(open) => setAiAlert((prev) => ({ ...prev, isOpen: open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5 text-amber-400">
              <Sparkles className="size-5 shrink-0 text-amber-400" />
              <span>AI Cleaning Notice</span>
            </AlertDialogTitle>
            <DialogDescription>
              {aiAlert.message}
            </DialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Dismiss</AlertDialogCancel>
            {aiAlert.isKeyError && (
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => {
                  setAiAlert((prev) => ({ ...prev, isOpen: false }));
                  setIsAiModalOpen(true);
                }}
              >
                Configure API Key
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Local File Scheme Access Alert Dialog */}
      <AlertDialog
        open={fileSchemeAlertOpen}
        onOpenChange={setFileSchemeAlertOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <FileText className="size-5 shrink-0" />
              <span>Permission Needed for Local Files</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <span>
                To import local files from your browser (<code>file:///...</code>), Chrome requires the <strong>"Allow access to file URLs"</strong> permission.
              </span>
              <div className="rounded-lg bg-slate-100 dark:bg-slate-800/80 p-3 border border-slate-200 dark:border-slate-700 space-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                <div>1. Open <strong>chrome://extensions</strong></div>
                <div>2. Click <strong>Details</strong> on ReadFlow</div>
                <div>3. Turn ON <strong>"Allow access to file URLs"</strong></div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setView('home')}>Close</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => {
                chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
              }}
            >
              Open Extension Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
