import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, StudentData } from './types';
import BackgroundEffects from './components/BackgroundEffects';
import Character3D from './components/Character3D';
import EnquiryModal from './components/EnquiryModal';
import CalendarWalk from './components/CalendarWalk';
import { Calendar2D } from './components/Calendar2D';
import { loadCalendarNotes, saveCalendarNotes, loadCalendarTasks, saveCalendarTasks } from './lib/localStudent';

const EEYORE_BG = '/backgrounds/eeyore-cover-concept.png';
const WOODED_BG = '/backgrounds/wooded-cover-concept.png';
const EYE_BG = '/backgrounds/lotr-shire.png';
const MINECRAFT_BG = '/backgrounds/minecraft-scene.png';

const API_URL = 'https://script.google.com/macros/s/AKfycby4OkFc3mZw4fVzQVrsLEtsjSkIZjwEGLmZr7n-QIJpPDH_6Lmp-sfCi4b7uUpS2M8B/exec';
const API_KEY = '1WobiYnZuLTdNrErTvStrw-iVDYy_sIgnw92dhI4TOZuOIXZ-tKxCwRGh';
const EMAIL_API_URL = 'https://script.google.com/macros/s/AKfycby4OkFc3mZw4fVzQVrsLEtsjSkIZjwEGLmZr7n-QIJpPDH_6Lmp-sfCi4b7uUpS2M8B/exec';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The Apps Script exec endpoint has a real cold start: the first request
// after it's been idle regularly comes back slow, or as an HTML interstitial
// instead of JSON (which throws on .json() immediately, not from waiting
// too long) -- then the very next attempt succeeds instantly. A single
// fetch surfaced that as a login failure on essentially every user's first
// try. Retry quietly a couple of times before treating it as a real error.
async function fetchJsonWithRetry(url: string, attempts = 3, delayMs = 1200): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastError;
}

export default function StudentPortalApp() {
  // --- UI & THEME STATE ---
  const [currentTime, setCurrentTime] = useState('9:41');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dyslexiaMode, setDyslexiaMode] = useState(false);
  const [currentBgUrl, setCurrentBgUrl] = useState(EEYORE_BG);
  const [isCalendarWalkOpen, setIsCalendarWalkOpen] = useState(false);
  const [isCalendar2DOpen, setIsCalendar2DOpen] = useState(false);
  const [frameScale, setFrameScale] = useState(1);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const updateScale = () => {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      setIsMobileDevice(isMobileUA);

      if (isMobileUA) {
        setFrameScale(1);
        return;
      }
      if (window.innerWidth < 640) {
        setFrameScale(1);
        return;
      }
      const availableHeight = window.innerHeight;
      const targetHeight = 910;
      if (availableHeight < targetHeight) {
        setFrameScale(Math.max(0.65, availableHeight / targetHeight));
      } else {
        setFrameScale(1);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // --- LOGIN & DATA STATE ---
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [studentData, setStudentData] = useState<StudentData | null>(null);

  // --- CHAT & FLOW STATE ---
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isBotLoading, setIsBotLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [speechBubbleText, setSpeechBubbleText] = useState(
    'Hi! I can help you find your student data. Choose an option from the list below to get started.'
  );
  const [showSpeechBubble, setShowSpeechBubble] = useState(false);

  // --- CALENDAR NOTES STATE ---
  // Kept on this device only -- see lib/localStudent.ts for why. Loaded once
  // the student is logged in, since notes are scoped to their login ID.
  const [studentNotesJson, setStudentNotesJson] = useState<string>('');

  useEffect(() => {
    if (isAuthenticated && loginId) {
      setStudentNotesJson(loadCalendarNotes(loginId));
    }
  }, [isAuthenticated, loginId]);

  const handleNotesChange = (notesFormatted: string) => {
    setStudentNotesJson(notesFormatted);
    if (loginId) saveCalendarNotes(loginId, notesFormatted);
  };

  // --- CALENDAR TASKS STATE ---
  // Tasks the student adds while standing on a date in the 3D calendar --
  // decoded into sub-steps and given a first-pass time estimate on entry.
  // Local-only, same as notes; not yet shown in the 2D calendar view.
  const [studentTasksJson, setStudentTasksJson] = useState<string>('{}');

  useEffect(() => {
    if (isAuthenticated && loginId) {
      const stored = loadCalendarTasks(loginId);
      setStudentTasksJson(stored && stored.trim() ? stored : '{}');
    }
  }, [isAuthenticated, loginId]);

  const handleTasksChange = (tasksJson: string) => {
    setStudentTasksJson(tasksJson);
    if (loginId) saveCalendarTasks(loginId, tasksJson);
  };

  // --- RESIZABLE CHAT SHEET ---
  const [chatSheetHeight, setChatSheetHeight] = useState(450);
  const sheetRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // --- ENQUIRY INPUT & MODAL STATE ---
  const [enquiryText, setEnquiryText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialMessage, setModalInitialMessage] = useState('');

  // --- POINTER POSITION FOR 3D BONE & SHADER ROTATION ---
  const [pointerPos, setPointerPos] = useState({
    tx: 0,
    ty: 0,
    rayTx: 0.5,
    rayTy: 0.5,
  });

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dyslexic-mode', dyslexiaMode);
    document.documentElement.classList.toggle('dyslexic-mode', dyslexiaMode);
  }, [dyslexiaMode]);

  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      let isScrollable = false;

      while (target && target !== document.body && target !== document.documentElement) {
        const isScrollAttr = target.getAttribute('data-scrollable') === 'true' ||
                             target.classList.contains('overflow-y-auto') ||
                             target.classList.contains('overflow-auto') ||
                             target.id === 'chatContainer' ||
                             target.id === 'bubbleContentArea';

        if (isScrollAttr) {
          if (target.scrollHeight > target.clientHeight) {
            isScrollable = true;
            break;
          }
        }
        target = target.parentElement;
      }

      if (!isScrollable) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isBotLoading]);

  const handlePointerMove = (clientX: number, clientY: number) => {
    const appFrame = document.getElementById('appFrame');
    if (!appFrame) return;
    const rect = appFrame.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setPointerPos({
      tx: (x / rect.width) * 2 - 1,
      ty: -(y / rect.height) * 2 + 1,
      rayTx: x / rect.width,
      rayTy: y / rect.height,
    });
  };

  const handlePointerLeave = () => {
    setPointerPos({
      tx: 0,
      ty: 0,
      rayTx: 0.5,
      rayTy: 0.5,
    });
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    startHeightRef.current = chatSheetHeight;
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      if (e.cancelable) {
        e.preventDefault();
      }
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dy = clientY - startYRef.current;
      const newHeight = startHeightRef.current + dy;

      const appFrame = document.getElementById('appFrame');
      const inputArea = document.getElementById('enquiryInputArea');
      if (!appFrame) return;

      const frameHeight = appFrame.clientHeight;
      const inputHeight = inputArea ? inputArea.clientHeight : 100;
      const minHeight = 140;
      const maxHeight = frameHeight - inputHeight;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setChatSheetHeight(newHeight);
      } else if (newHeight > maxHeight) {
        setChatSheetHeight(maxHeight);
      } else if (newHeight < minHeight) {
        setChatSheetHeight(minHeight);
      }
    };

    const handleDragEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [chatSheetHeight]);

  // --- LOGIN LOGIC ---
  // Reads real student data live from the college's existing Google Sheet --
  // this app never keeps its own copy of grades/timetable data.
  const handleLogin = async () => {
    if (isAuthenticating || isAuthenticated) return;
    if (!loginId.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both ID and Password.');
      return;
    }

    setLoginError('');
    setIsAuthenticating(true);

    try {
      const url = `${API_URL}?studentId=${encodeURIComponent(loginId.trim())}&key=${API_KEY}`;
      const data = await fetchJsonWithRetry(url);

      if (data && data.length > 0) {
        const firstRow = data[0];
        const rowValues = Object.values(firstRow);
        let passwordMatched = false;

        const passKey = Object.keys(firstRow).find((k) => k.toLowerCase().includes('password'));
        if (passKey && String(firstRow[passKey]).trim() === loginPassword.trim()) {
          passwordMatched = true;
        } else if (rowValues.length >= 12 && String(rowValues[11]).trim() === loginPassword.trim()) {
          passwordMatched = true;
        }

        if (passwordMatched) {
          setStudentData(firstRow);
          setIsAuthenticated(true);

          const nameKey = Object.keys(firstRow).find((k) => k.toLowerCase().includes('name') && !k.toLowerCase().includes('handbook'));
          const name = (nameKey && firstRow[nameKey]) ? String(firstRow[nameKey]).trim() : (firstRow['Student name'] || firstRow['Name'] || loginId.trim());
          const keys = Object.keys(firstRow);
          const headlineKey = keys.find((k) => k.toLowerCase().includes('headline'));

          let greetingMsg = `Welcome, ${name}. Database connection established.`;
          if (headlineKey && firstRow[headlineKey]) {
            greetingMsg = `Welcome, ${name}.\n\nLatest Headline:\n${firstRow[headlineKey]}`;
          }

          setChatHistory([{ text: greetingMsg, type: 'received' }]);
          setShowOptions(true);
          setShowSpeechBubble(true);
        } else {
          setLoginError('Incorrect password.');
        }
      } else {
        setLoginError('Student not found.');
      }
    } catch (e) {
      setLoginError('Error connecting to server.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleQuery = (query: string) => {
    if (isBotLoading) return;
    setShowOptions(false);
    setShowSpeechBubble(false);

    setChatHistory((prev) => [...prev, { text: query, type: 'sent' }]);
    setIsBotLoading(true);

    setTimeout(() => {
      setIsBotLoading(false);

      if (!studentData) {
        setChatHistory((prev) => [...prev, { text: 'System not connected yet.', type: 'received' }]);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const keys = Object.keys(studentData);
      let foundKey = keys.find((k) => k.toLowerCase() === lowerQuery);
      if (!foundKey) foundKey = keys.find((k) => k.toLowerCase().includes(lowerQuery));

      if (foundKey) {
        const val = studentData[foundKey] || 'N/A';
        setChatHistory((prev) => [...prev, { text: `**${foundKey}:**\n${val}`, type: 'received' }]);
      } else {
        const validKeysForSuggestions = keys.filter(
          (k) => k && k.trim() !== '' && k.toLowerCase() !== 'name' && !k.includes('*')
        );
        const suggestions = validKeysForSuggestions.slice(0, 4).join(', ');
        setChatHistory((prev) => [
          ...prev,
          {
            text: `Could not find "${query}". Try requesting headings like: ${suggestions}...`,
            type: 'received',
          },
        ]);
      }
    }, 600 + Math.random() * 400);
  };

  const handleEnquirySubmit = () => {
    if (isBotLoading || isModalOpen) return;
    const text = enquiryText.trim();
    if (!text) return;

    const emailRegex = /^\S+@\S+\.\S+$/;
    const name = studentData?.['Name'] || loginId;
    const prefilledEmail = '';

    if (name && prefilledEmail && emailRegex.test(prefilledEmail)) {
      submitDirectEnquiry(name, prefilledEmail, text);
    } else {
      setModalInitialMessage(text);
      setIsModalOpen(true);
    }
  };

  const submitDirectEnquiry = async (name: string, email: string, message: string) => {
    setChatHistory((prev) => [...prev, { text: message, type: 'sent' }]);
    setEnquiryText('');
    setIsBotLoading(true);

    try {
      const payload = {
        name,
        email,
        phone: '',
        message,
        source: loginId || 'Student Portal',
        key: 'GEMINI_LEADS_2026_X9Q2',
      };

      await fetch(EMAIL_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      setIsBotLoading(false);
      setChatHistory((prev) => [
        ...prev,
        { text: `**Delivered:**\nYour message has been safely forwarded.`, type: 'received' },
      ]);
    } catch (e) {
      setIsBotLoading(false);
      setChatHistory((prev) => [
        ...prev,
        { text: `Failed to deliver. Please try again.`, type: 'received' },
      ]);
    }
  };

  const exportCSV = () => {
    if (!studentData) return;
    const headers = Object.keys(studentData);
    const csvRow = headers.map((h) => `"${studentData[h] || ''}"`).join(',');
    const csv = [headers.join(','), csvRow].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `student_${loginId}_export.csv`;
    a.click();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setStudentData(null);
    setLoginId('');
    setLoginPassword('');
    setChatHistory([]);
    setShowOptions(false);
    setShowSpeechBubble(false);
    setIsCalendarWalkOpen(false);
    setIsCalendar2DOpen(false);
  };

  const validOptionKeys = studentData
    ? Object.keys(studentData).filter(
        (k) => k && k.trim() !== '' && k.toLowerCase() !== 'name' && !k.includes('*') && k.toLowerCase() !== 'password'
      )
    : [];

  return (
    <div
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onTouchMove={(e) => e.touches.length > 0 && handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
      onMouseLeave={handlePointerLeave}
      onTouchEnd={handlePointerLeave}
      className="bg-gray-100 dark:bg-zinc-950 min-h-screen flex items-center justify-center font-sans text-black dark:text-white transition-all duration-300 overflow-hidden"
    >
      <div
        id="appFrame"
        className={
          isMobileDevice
            ? "w-full h-screen bg-[#F2F2F7] dark:bg-black overflow-hidden relative flex flex-col transition-all duration-300 select-none"
            : "w-full h-screen sm:h-[844px] sm:w-[390px] bg-[#F2F2F7] dark:bg-black sm:rounded-[3rem] sm:border-[12px] sm:border-black dark:sm:border-zinc-800 overflow-hidden relative shadow-2xl flex flex-col transition-all duration-300 select-none"
        }
        style={
          isMobileDevice
            ? { transform: 'none' }
            : { transform: `scale(${frameScale}) translateY(${32 * frameScale}px)`, transformOrigin: 'center center' }
        }
      >
        <div className="h-12 shrink-0 w-full flex justify-between items-center px-6 text-[15px] font-semibold pt-2 z-50 bg-white/10 dark:bg-black/10 backdrop-blur-md absolute top-0 pointer-events-none transition-all duration-300">
          <span className="text-black dark:text-white">{currentTime}</span>
          <div className="flex items-center space-x-2 pointer-events-auto">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1 hover:opacity-70 transition-opacity cursor-pointer text-black dark:text-white"
              aria-label="Toggle Theme"
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div
          id="persistentBackground"
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 z-0 pointer-events-none"
          style={{
            backgroundImage: `url('${
              !isAuthenticated
                ? currentBgUrl
                : currentBgUrl === EEYORE_BG
                ? WOODED_BG
                : currentBgUrl === EYE_BG
                ? EYE_BG
                : MINECRAFT_BG
            }')`,
          }}
        >
          <div className="absolute inset-0 bg-black/15 z-0" />
          <BackgroundEffects currentBgUrl={currentBgUrl} pointerPos={pointerPos} isAuthenticated={isAuthenticated} />
        </div>

        {!isAuthenticated ? (
          <div
            id="introPage"
            className="flex-1 z-10 flex flex-col relative transition-all duration-500 ease-in-out pointer-events-auto bg-transparent"
          >
            <div className="relative z-10 flex flex-col justify-end items-center w-full min-h-full pb-[12vh] sm:pb-[16vh] pt-14 px-6 pointer-events-none">
              <h1
                id="welcomeText"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 sm:mb-6 text-center text-white drop-shadow-lg"
                style={{ textShadow: '0px 2px 12px rgba(0,0,0,0.6)' }}
              >
                Welcome
              </h1>

              <div id="loginContainer" className="w-full max-w-sm relative mb-4 pointer-events-auto flex flex-col gap-3">
                <div className="relative w-full">
                  <svg className="w-5 h-5 absolute left-3.5 top-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <input
                    id="loginId"
                    type="text"
                    placeholder="Student ID or Name"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="w-full bg-black/25 dark:bg-black/45 backdrop-blur-md shadow-lg text-[16px] text-white placeholder-white/60 rounded-xl py-2.5 pl-11 pr-10 border border-white/20 focus:outline-none focus:border-[#007AFF] transition-all"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        document.getElementById('loginPassword')?.focus();
                      }
                    }}
                  />
                  {loginId && (
                    <button
                      onClick={() => setLoginId('')}
                      className="absolute right-3.5 top-3.5 text-white/70 active:text-white cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="relative w-full">
                  <svg className="w-5 h-5 absolute left-3.5 top-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    id="loginPassword"
                    type="password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-black/25 dark:bg-black/45 backdrop-blur-md shadow-lg text-[16px] text-white placeholder-white/60 rounded-xl py-2.5 pl-11 pr-10 border border-white/20 focus:outline-none focus:border-[#007AFF] transition-all"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleLogin();
                      }
                    }}
                  />
                  {loginPassword && (
                    <button
                      onClick={() => setLoginPassword('')}
                      className="absolute right-3.5 top-3.5 text-white/70 active:text-white cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>

                {loginError && (
                  <p
                    id="loginError"
                    className="text-[#FF3B30] text-[13px] font-semibold text-center drop-shadow-md bg-black/40 border border-red-500/20 rounded-lg py-1 px-3 backdrop-blur-sm mx-auto mt-0.5"
                  >
                    {loginError}
                  </p>
                )}
              </div>

              <button
                id="enterPortalBtn"
                onClick={handleLogin}
                disabled={isAuthenticating}
                className="w-full max-w-sm bg-[#007AFF]/90 hover:bg-[#007AFF] text-white rounded-xl py-2.5 font-semibold text-[16px] shadow-lg active:scale-95 transition-all flex items-center justify-center pointer-events-auto cursor-pointer border border-white/10 backdrop-blur-sm"
              >
                {isAuthenticating ? 'Authenticating...' : 'Enter Portal'}
              </button>

              <div className="dock-container pointer-events-auto !mt-4 scale-90 sm:scale-95 origin-center">
                <div className="dock-item" style={{ backgroundImage: `url('${EEYORE_BG}')` }} onClick={() => setCurrentBgUrl(EEYORE_BG)} />
                <div className="dock-item" style={{ backgroundImage: `url('${EYE_BG}')` }} onClick={() => setCurrentBgUrl(EYE_BG)} />
                <div className="dock-item" style={{ backgroundImage: `url('${MINECRAFT_BG}')` }} onClick={() => setCurrentBgUrl(MINECRAFT_BG)} />
              </div>
            </div>
          </div>
        ) : (
          <div
            id="mainDashboard"
            className="flex-1 z-10 min-h-0 flex flex-col relative bg-transparent pointer-events-none transition-all duration-300"
          >
            {!isCalendarWalkOpen && !isCalendar2DOpen && (
              <Character3D currentBgUrl={currentBgUrl} pointerPos={pointerPos} />
            )}

            <div className="absolute top-14 left-0 w-full flex justify-between items-end px-4 shrink-0 z-30 pointer-events-auto">
              <div className="bg-black/20 dark:bg-black/35 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-white/20">
                <button
                  onClick={handleLogout}
                  className="text-white font-bold text-[11px] flex items-center gap-0.5 active:opacity-50 transition-opacity -ml-1 mb-0.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <p className="text-[9px] text-white/70 font-bold uppercase tracking-wider mb-0.5">Student Portal</p>
                <h1 className="text-[18px] sm:text-[20px] font-extrabold tracking-tight leading-none text-white truncate max-w-[150px]" id="userGreeting">
                  {loginId}
                </h1>
              </div>

              <div className="flex gap-1.5 items-center bg-black/20 dark:bg-black/35 backdrop-blur-md p-1.5 rounded-xl shadow-md border border-white/20">
                <button
                  onClick={() => {
                    setIsCalendarWalkOpen(!isCalendarWalkOpen);
                    if (!isCalendarWalkOpen) setIsCalendar2DOpen(false);
                  }}
                  className={`font-bold text-[11px] px-1.5 py-0.5 rounded-md active:opacity-50 transition-colors cursor-pointer whitespace-nowrap ${
                    isCalendarWalkOpen ? 'bg-[#FF3B30] text-white font-extrabold px-2' : 'text-[#007AFF]'
                  }`}
                  title={isCalendarWalkOpen ? 'Click to Exit 3D Calendar Walk' : 'Click to Open 3D Calendar Walk'}
                >
                  {isCalendarWalkOpen ? 'Close 3D' : '3D'}
                </button>
                <button
                  onClick={() => {
                    setIsCalendar2DOpen(!isCalendar2DOpen);
                    if (!isCalendar2DOpen) setIsCalendarWalkOpen(false);
                  }}
                  className={`font-bold text-[11px] px-1.5 py-0.5 rounded-md active:opacity-50 transition-colors cursor-pointer whitespace-nowrap ${
                    isCalendar2DOpen ? 'bg-[#FF3B30] text-white font-extrabold px-2' : 'text-[#007AFF]'
                  }`}
                  title={isCalendar2DOpen ? 'Click to Exit 2D Calendar' : 'Click to Open 2D Flat Calendar'}
                >
                  {isCalendar2DOpen ? 'Close 2D' : '2D'}
                </button>
                <button
                  onClick={() => setDyslexiaMode(!dyslexiaMode)}
                  className={`font-bold text-[11px] px-1.5 py-0.5 rounded-md active:opacity-50 transition-colors cursor-pointer ${
                    dyslexiaMode ? 'bg-[#007AFF] text-white' : 'text-[#007AFF]'
                  }`}
                  title="Toggle Dyslexia Font"
                >
                  Aa
                </button>
                <button
                  onClick={exportCSV}
                  className="text-white/90 hover:text-white font-bold text-[11px] px-1.5 py-0.5 active:opacity-50 cursor-pointer"
                >
                  Export
                </button>
                <button
                  onClick={handleLogout}
                  className="text-[#FF3B30] hover:text-[#ff453a] font-bold text-[11px] px-1.5 py-0.5 active:opacity-50 cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>

            {!isCalendarWalkOpen && !isCalendar2DOpen && (
              <div
                id="chatSheet"
                ref={sheetRef}
                className="absolute top-[136px] bottom-[108px] right-2.5 w-[52%] max-w-[245px] flex flex-col bg-transparent z-20 pointer-events-none"
              >
                <div
                  id="chatContainer"
                  data-scrollable="true"
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3 px-2 pb-3 pointer-events-auto"
                >
                  {chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex w-full ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}
                      style={{ animation: 'slide-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
                    >
                      <div
                        className={
                          msg.type === 'sent'
                            ? 'bg-[#007AFF] text-white px-4 py-2 rounded-[20px] rounded-br-[4px] text-[14px] shadow-sm max-w-[95%] leading-snug text-left'
                            : 'bg-white/40 dark:bg-black/40 backdrop-blur-md border border-white/20 dark:border-white/10 text-black dark:text-white px-4 py-2.5 rounded-[24px] text-[14px] shadow-sm max-w-[95%] leading-snug whitespace-pre-wrap text-left relative avatar-response-fin mb-1 mt-0.5'
                        }
                      >
                        <span
                          dangerouslySetInnerHTML={{
                            __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {isBotLoading && (
                    <div className="flex w-full justify-start" style={{ animation: 'slide-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
                      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-md border border-white/20 dark:border-white/10 text-black dark:text-white px-4 py-2.5 rounded-[24px] shadow-sm max-w-[95%] relative avatar-response-fin mb-1 mt-0.5">
                        <div className="flex items-center space-x-1.5 h-full">
                          <div className="w-1.5 h-1.5 bg-gray-500 rounded-full typing-dot" />
                          <div className="w-1.5 h-1.5 bg-gray-500 rounded-full typing-dot" />
                          <div className="w-1.5 h-1.5 bg-gray-500 rounded-full typing-dot" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div id="actionOverlay" className="w-full px-2 pb-2 z-40 pointer-events-none flex flex-col gap-2 items-end shrink-0">
                  {showOptions ? (
                    <div
                      data-scrollable="true"
                      className="flex flex-col gap-2 items-end w-full max-h-[175px] overflow-y-auto no-scrollbar pointer-events-auto bg-white/40 dark:bg-black/40 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-[24px] p-2.5 shadow-sm"
                    >
                      {validOptionKeys.map((key, i) => (
                        <button
                          key={key}
                          onClick={() => handleQuery(key)}
                          className="bg-[#007AFF] text-white px-4 py-2 rounded-[20px] rounded-br-[4px] text-[14px] shadow-sm active:scale-95 transition-transform text-left max-w-[100%] leading-snug cursor-pointer"
                          style={{ animation: `slide-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s both` }}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setShowOptions(true);
                        setShowSpeechBubble(true);
                      }}
                      className="bg-white/40 dark:bg-black/40 text-[#007AFF] dark:text-[#0a84ff] border border-white/20 dark:border-white/10 backdrop-blur-md px-4 py-2 rounded-[20px] rounded-br-[4px] text-[13px] font-semibold shadow-sm active:scale-95 transition-transform flex items-center gap-2 pointer-events-auto cursor-pointer"
                      style={{ animation: 'slide-in-up 0.3s ease-out both' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      Back to Listing
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isCalendarWalkOpen && !isCalendar2DOpen && (
              <div
                id="enquiryInputArea"
                className="absolute bottom-0 left-0 w-full bg-white/5 dark:bg-black/10 backdrop-blur-sm border-t border-white/20 dark:border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pb-8 pt-4 px-4 z-[60] rounded-b-[3rem] transition-all pointer-events-auto"
              >
                <div className="flex items-center gap-2 relative">
                  <input
                    id="enquiryInput"
                    type="text"
                    placeholder="Send us a further enquiry..."
                    value={enquiryText}
                    onChange={(e) => setEnquiryText(e.target.value)}
                    className="flex-1 bg-white/20 dark:bg-black/20 backdrop-blur-md dark:text-white text-[17px] text-black rounded-full py-2.5 pl-4 pr-12 border border-white/30 dark:border-white/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/50 transition-all placeholder-gray-600 dark:placeholder-gray-400"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleEnquirySubmit();
                      }
                    }}
                  />
                  <button
                    onClick={handleEnquirySubmit}
                    className="absolute right-2 w-8 h-8 bg-[#007AFF] text-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="w-32 h-1.5 bg-black/30 dark:bg-white/30 rounded-full mx-auto mt-5" />
              </div>
            )}

            <CalendarWalk
              key={String(isCalendarWalkOpen) + '_' + (loginId || 'guest')}
              isOpen={isCalendarWalkOpen}
              studentId={loginId}
              initialNotes={studentNotesJson}
              onNotesChange={handleNotesChange}
              initialTasks={studentTasksJson}
              onTasksChange={handleTasksChange}
              currentBgUrl={currentBgUrl}
              isDarkMode={isDarkMode}
            />

            <Calendar2D
              key={String(isCalendar2DOpen) + '_' + (loginId || 'guest')}
              isOpen={isCalendar2DOpen}
              studentId={loginId}
              initialNotes={studentNotesJson}
              onNotesChange={handleNotesChange}
              onClose={() => setIsCalendar2DOpen(false)}
            />

            <EnquiryModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onSubmit={(name, email, msg) => submitDirectEnquiry(name, email, msg)}
              initialName={studentData?.['Name'] || loginId}
              initialMessage={modalInitialMessage}
            />
          </div>
        )}

        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1.5 bg-black dark:bg-white rounded-full opacity-80 pointer-events-none z-50" />
      </div>
    </div>
  );
}
