import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, ChatCard, StudentData } from './types';
import BackgroundEffects from './components/BackgroundEffects';
import Character3D from './components/Character3D';
import EnquiryModal from './components/EnquiryModal';
import PreviewModal from './components/PreviewModal';
import CalendarWalk from './components/CalendarWalk';
import { Calendar2D } from './components/Calendar2D';
import { loadCalendarNotes, saveCalendarNotes, loadCalendarTasks, saveCalendarTasks } from './lib/localStudent';
import { ClassroomReconnectBanner } from './components/ClassroomReconnectBanner';
import { IntroSoundToggle, WOODLAND_TRACKS, EYE_TRACKS, CAVE_TRACKS } from './components/IntroSoundToggle';

const SCENE_BG = '/backgrounds/intro-scene.jpg';
const SCENE_THUMB = '/backgrounds/intro-scene-thumb.jpg';
const WOODED_BG = '/backgrounds/wooded-cover-concept.png';
const EYE_BG = '/backgrounds/intro-eye.jpg';
// The eye theme's picture once logged in (the intro eye is login-screen only)
const EYE_HOME_BG = '/backgrounds/hillside-house.png';
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dyslexiaMode, setDyslexiaMode] = useState(false);
  const [currentBgUrl, setCurrentBgUrl] = useState(SCENE_BG);
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
  // When true, the enquiry input box below temporarily doubles as a
  // Classroom/sheet search box (see the "Search" pill in handleQuery) --
  // reuses the one existing text field rather than adding a second one.
  const [isSearchMode, setIsSearchMode] = useState(false);
  // The attachment card currently open in the full-size PreviewModal, or
  // null when none is open.
  const [previewCard, setPreviewCard] = useState<ChatCard | null>(null);
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

    // TEST/DRAFT: "Deadlines" answers from the real connected Google
    // Classroom instead of the sheet column of the same name below, so
    // the two sources can be compared. Only this one query is
    // intercepted, case-insensitively -- every other pill (Attendance,
    // Student notes, etc.) still reads the sheet exactly as before.
    if (query.trim().toLowerCase() === 'deadlines') {
      fetch('/.netlify/functions/classroom-coursework?courseId=12148525194')
        .then((res) => res.json())
        .then((data) => {
          const first = data.tasks && data.tasks[0];
          const text = first
            ? `**Deadlines (Google Classroom):**\n${first.rawText} -- due ${first.dueDateISO}`
            : '**Deadlines (Google Classroom):**\nNo published assignment with a due date found yet.';
          setChatHistory((prev) => [...prev, { text, type: 'received' }]);
        })
        .catch(() => {
          setChatHistory((prev) => [...prev, { text: 'Could not reach Google Classroom.', type: 'received' }]);
        })
        .finally(() => setIsBotLoading(false));
      return;
    }

    // TEST/DRAFT: "Project Assignments" -- same pattern as Deadlines above,
    // but replies with the assignment's real description verbatim (no AI
    // involved at all, this is just displaying text Classroom already
    // stores) instead of just its title/due date.
    if (query.trim().toLowerCase() === 'project assignments') {
      fetch('/.netlify/functions/classroom-coursework?courseId=12148525194')
        .then((res) => res.json())
        .then((data) => {
          const first = data.tasks && data.tasks[0];
          const topicLine = first && first.topicName ? `\n(Topic: ${first.topicName})` : '';
          const text = first
            ? `**${first.rawText} (Google Classroom):**\n${first.description || '(No description set on this assignment.)'}${topicLine}`
            : '**Project Assignments (Google Classroom):**\nNo published assignment found yet.';
          setChatHistory((prev) => [...prev, { text, type: 'received' }]);
        })
        .catch(() => {
          setChatHistory((prev) => [...prev, { text: 'Could not reach Google Classroom.', type: 'received' }]);
        })
        .finally(() => setIsBotLoading(false));
      return;
    }

    // TEST/DRAFT: "Resources" -- standalone materials/handouts a teacher
    // has posted (not attached to any graded assignment), which never show
    // up under Deadlines or Project Assignments since Classroom treats
    // them as a separate resource type.
    if (query.trim().toLowerCase() === 'resources') {
      fetch('/.netlify/functions/classroom-materials?courseId=12148525194')
        .then((res) => res.json())
        .then((data) => {
          const items = data.resources || [];
          const text = items.length
            ? `**Resources (Google Classroom):**\n${items
                .map((r) => `${r.title}${r.links.length ? ` -- ${r.links.map((l) => l.title).join(', ')}` : ''}`)
                .join('\n')}`
            : '**Resources (Google Classroom):**\nNo posted materials found yet.';
          const cards = items.flatMap((r) => r.links || []);
          setChatHistory((prev) => [...prev, { text, type: 'received', cards: cards.length ? cards : undefined }]);
        })
        .catch(() => {
          setChatHistory((prev) => [...prev, { text: 'Could not reach Google Classroom.', type: 'received' }]);
        })
        .finally(() => setIsBotLoading(false));
      return;
    }

    // TEST/DRAFT: "Announcements" -- the class stream's posts, re-shown as
    // a short plain list instead of Classroom's own dense chronological
    // feed. Only the post text itself -- Classroom's API doesn't expose
    // the comments underneath a post either way.
    if (query.trim().toLowerCase() === 'announcements') {
      fetch('/.netlify/functions/classroom-announcements?courseId=12148525194')
        .then((res) => res.json())
        .then((data) => {
          const items = data.announcements || [];
          const text = items.length
            ? `**Announcements (Google Classroom):**\n${items.slice(0, 5).map((a) => a.text).join('\n\n')}`
            : '**Announcements (Google Classroom):**\nNo announcements posted yet.';
          setChatHistory((prev) => [...prev, { text, type: 'received' }]);
        })
        .catch(() => {
          setChatHistory((prev) => [...prev, { text: 'Could not reach Google Classroom.', type: 'received' }]);
        })
        .finally(() => setIsBotLoading(false));
      return;
    }

    // TEST/DRAFT: "Search" -- doesn't fetch anything itself. Switches the
    // enquiry input below into search mode (see its placeholder/submit
    // logic further down) so the next thing typed there is searched
    // against the Classroom Stream instead of sent as an enquiry.
    if (query.trim().toLowerCase() === 'search') {
      setIsSearchMode(true);
      setChatHistory((prev) => [
        ...prev,
        { text: 'What would you like to search for? Type it in the box below.', type: 'received' },
      ]);
      setIsBotLoading(false);
      return;
    }

    // TEST/DRAFT: "Stream" -- announcements, assignments and materials
    // merged into one chronological feed, the same activity Classroom's
    // own Stream page shows, just decluttered into a short plain list.
    if (query.trim().toLowerCase() === 'stream') {
      fetch('/.netlify/functions/classroom-stream?courseId=12148525194')
        .then((res) => res.json())
        .then((data) => {
          const items = data.stream || [];
          const shown = items.slice(0, 6);
          const label = { announcement: 'Announcement', assignment: 'Assignment', material: 'Resource' };
          const lines = shown.map((item) => {
            const tag = `[${label[item.type] || item.type}]`;
            if (item.type === 'assignment') {
              return `${tag} ${item.title}${item.dueDateISO ? ` -- due ${item.dueDateISO}` : ''}`;
            }
            if (item.type === 'material') {
              return `${tag} ${item.title}`;
            }
            return `${tag} ${item.text}`;
          });
          const text = lines.length
            ? `**Stream (Google Classroom):**\n${lines.join('\n\n')}`
            : '**Stream (Google Classroom):**\nNothing posted yet.';
          const cards = shown.flatMap((item) => item.links || []);
          setChatHistory((prev) => [...prev, { text, type: 'received', cards: cards.length ? cards : undefined }]);
        })
        .catch(() => {
          setChatHistory((prev) => [...prev, { text: 'Could not reach Google Classroom.', type: 'received' }]);
        })
        .finally(() => setIsBotLoading(false));
      return;
    }

    setTimeout(() => {
      if (!studentData) {
        setChatHistory((prev) => [...prev, { text: 'System not connected yet.', type: 'received' }]);
        setIsBotLoading(false);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const keys = Object.keys(studentData);
      let foundKey = keys.find((k) => k.toLowerCase() === lowerQuery);
      if (!foundKey) foundKey = keys.find((k) => k.toLowerCase().includes(lowerQuery));

      if (foundKey) {
        const val = studentData[foundKey] || 'N/A';
        setChatHistory((prev) => [...prev, { text: `**${foundKey}:**\n${val}`, type: 'received' }]);
        setIsBotLoading(false);
        return;
      }

      const notFoundReply = () => {
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
      };

      // Nothing in the sheet data matched -- before giving up, search the
      // live Classroom Stream (assignments/announcements/resources) for
      // anything mentioning the query, same free-text box, no separate
      // search UI needed.
      //
      // This is deliberately NOT an AI call -- no API, no cost. It's a
      // small, free keyword-overlap scorer (strip filler words, count how
      // many meaningful words each Stream item contains, title matches
      // weighted above body matches) plus a handful of hard-coded intent
      // rules for the phrasings students actually type ("when is X due",
      // "is there a video for Y"). That's enough to answer something like
      // "when is the deadline for the manifesto project" correctly, even
      // though that exact phrase never appears anywhere verbatim -- a
      // plain substring match (what this used to be) never could.
      fetch('/.netlify/functions/classroom-stream?courseId=12148525194')
        .then((res) => res.json())
        .then((data) => {
          const items = data.stream || [];

          const STOPWORDS = new Set([
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'for', 'of', 'on', 'in', 'at',
            'and', 'or', 'what', 'when', 'where', 'which', 'who', 'whom', 'does', 'do', 'did', 'can', 'could',
            'should', 'would', 'will', 'it', 'its', 'this', 'that', 'with', 'about', 'me', 'my', 'please',
            'tell', 'show', 'find', 'there', 'has', 'have',
          ]);
          const tokenize = (text) => (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
          const keywords = tokenize(query).filter((w) => w.length > 2 && !STOPWORDS.has(w));

          if (keywords.length === 0) {
            notFoundReply();
            return;
          }

          const scored = items
            .map((item) => {
              const titleLower = (item.title || '').toLowerCase();
              const bodyLower = `${item.text || ''} ${item.topicName || ''}`.toLowerCase();
              let score = 0;
              keywords.forEach((kw) => {
                if (titleLower.includes(kw)) score += 2;
                if (bodyLower.includes(kw)) score += 1;
              });
              return { item, score };
            })
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

          if (scored.length === 0) {
            notFoundReply();
            return;
          }

          const wantsDeadline = /\b(deadline|due)\b/.test(lowerQuery);
          const wantsResource = /\b(video|resource|resources|material|materials|link|watch)\b/.test(lowerQuery);
          const wantsAnnouncement = /\b(announcement|announcements|news|posted)\b/.test(lowerQuery);

          let ranked = scored;
          if (wantsResource) {
            const materials = scored.filter((s) => s.item.type === 'material');
            if (materials.length) ranked = materials;
          } else if (wantsAnnouncement) {
            const anns = scored.filter((s) => s.item.type === 'announcement');
            if (anns.length) ranked = anns;
          }

          const top = ranked[0].item;
          const label = { announcement: 'Announcement', assignment: 'Assignment', material: 'Resource' };

          let text;
          if (wantsDeadline && top.type === 'assignment' && top.dueDateISO) {
            text = `**${top.title} (Google Classroom):**\n${top.title} is due on ${top.dueDateISO}.`;
          } else {
            const lines = ranked.slice(0, 5).map((s) => {
              const item = s.item;
              const tag = `[${label[item.type] || item.type}]`;
              if (item.type === 'assignment') {
                return `${tag} ${item.title}${item.dueDateISO ? ` -- due ${item.dueDateISO}` : ''}`;
              }
              if (item.type === 'material') return `${tag} ${item.title}`;
              return `${tag} ${item.text}`;
            });
            text = `**Search results for "${query}" (Google Classroom):**\n${lines.join('\n\n')}`;
          }

          const cards = ranked.slice(0, 5).flatMap((s) => s.item.links || []);
          setChatHistory((prev) => [...prev, { text, type: 'received', cards: cards.length ? cards : undefined }]);
        })
        .catch(notFoundReply)
        .finally(() => setIsBotLoading(false));
    }, 600 + Math.random() * 400);
  };

  const handleInputSubmit = () => {
    if (isSearchMode) {
      const text = enquiryText.trim();
      if (!text) return;
      setEnquiryText('');
      setIsSearchMode(false);
      handleQuery(text);
      return;
    }
    handleEnquirySubmit();
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

  // The header's "Back" button reads as "go back one level" everywhere else
  // in the app, but inside the 3D/2D calendar it was wired to full logout --
  // stepping back all the way to the login screen instead of just closing
  // the calendar view. Only fall through to a real logout when there is no
  // view left to close.
  const handleBackButton = () => {
    if (isCalendarWalkOpen || isCalendar2DOpen) {
      setIsCalendarWalkOpen(false);
      setIsCalendar2DOpen(false);
      return;
    }
    handleLogout();
  };

  const validOptionKeys = studentData
    ? [
        ...Object.keys(studentData).filter(
          (k) => k && k.trim() !== '' && k.toLowerCase() !== 'name' && !k.includes('*') && k.toLowerCase() !== 'password' && k.toLowerCase() !== 'column m'
        ),
        // TEST/DRAFT: not real sheet columns -- added purely so the
        // Google Classroom-sourced views (see handleQuery) have pills to
        // trigger them from, same styling as every other one.
        'Project Assignments',
        'Resources',
        'Announcements',
        'Stream',
        'Search',
      ]
    : [];

  return (
    <div
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onTouchMove={(e) => e.touches.length > 0 && handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
      onMouseLeave={handlePointerLeave}
      onTouchEnd={handlePointerLeave}
      className="bg-gray-100 dark:bg-zinc-950 min-h-screen flex items-center justify-center font-sans text-black dark:text-white transition-all duration-300 overflow-hidden"
    >
      <ClassroomReconnectBanner />
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
        <div
          id="persistentBackground"
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 z-0 pointer-events-none"
          style={{
            // Before login the woodland scene draws its own picture
            // (BackgroundEffects), so don't download a second copy here.
            backgroundImage: !isAuthenticated && currentBgUrl === SCENE_BG ? 'none' : `url('${
              !isAuthenticated
                ? currentBgUrl
                : currentBgUrl === SCENE_BG
                ? WOODED_BG
                : currentBgUrl === EYE_BG
                ? EYE_HOME_BG
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
            {/* keyed by theme so switching themes stops one sound and resets the toggle to off */}
            <div key={currentBgUrl} className="absolute top-4 right-4 z-20">
              {currentBgUrl === SCENE_BG ? (
                <IntroSoundToggle tracks={WOODLAND_TRACKS} label="Woodland sounds" />
              ) : currentBgUrl === EYE_BG ? (
                <IntroSoundToggle tracks={EYE_TRACKS} label="Music" />
              ) : (
                <IntroSoundToggle tracks={CAVE_TRACKS} label="Music" />
              )}
            </div>
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
                <div className="dock-item" style={{ backgroundImage: `url('${SCENE_THUMB}')` }} onClick={() => setCurrentBgUrl(SCENE_BG)} />
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
                  onClick={handleBackButton}
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
                {/* Quick-action pill catalog: anchored right under the header
                    (top of chatSheet) rather than pushed down near the input,
                    so it scrolls downward from a fixed point instead of
                    drifting toward the avatar as the list grows. max-h-[40vh]
                    caps it well above where the avatar stands (roughly the
                    lower ~35% of the frame across all three themes) so even a
                    long options list can't scroll down far enough to cover
                    the character. min-h-0 on the scrollable child is required
                    for a flex item to actually shrink/scroll instead of just
                    growing to fit its content. */}
                <div id="actionOverlay" className="w-full px-2 pb-2 z-40 pointer-events-none flex flex-col gap-2 items-end shrink-0 max-h-[40vh]">
                  {showOptions ? (
                    <div
                      data-scrollable="true"
                      className="flex-1 min-h-0 flex flex-col gap-2 items-end w-full overflow-y-auto no-scrollbar pointer-events-auto"
                    >
                      {validOptionKeys.map((key, i) => (
                        <button
                          key={key}
                          onClick={() => handleQuery(key)}
                          className="bg-[#007AFF] text-white px-4 py-2 rounded-[20px] rounded-br-[4px] text-[14px] shadow-md active:scale-95 transition-transform text-left max-w-[100%] leading-snug cursor-pointer"
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
                        {msg.cards && msg.cards.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.cards.map((card, cardIdx) => {
                              const canPreview = card.kind === 'youtube' || card.kind === 'drive';
                              return (
                                <div
                                  key={cardIdx}
                                  onClick={() => canPreview && setPreviewCard(card)}
                                  className={`rounded-2xl overflow-hidden border border-white/30 dark:border-white/10 bg-white/30 dark:bg-black/30 ${canPreview ? 'cursor-pointer' : ''}`}
                                >
                                  {canPreview && (
                                    <div className="relative w-full aspect-video bg-black/80 flex items-center justify-center">
                                      {card.thumbnailUrl && (
                                        <img src={card.thumbnailUrl} alt={card.title} className="absolute inset-0 w-full h-full object-cover opacity-90" />
                                      )}
                                      <div className="relative w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                                    <span className="text-[12.5px] font-semibold truncate">{card.title}</span>
                                    {canPreview ? (
                                      <span className="text-[11px] font-bold text-[#007AFF] shrink-0 whitespace-nowrap">
                                        Preview
                                      </span>
                                    ) : (
                                      <a
                                        href={card.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[11px] font-bold text-[#007AFF] shrink-0 whitespace-nowrap"
                                      >
                                        Open ↗
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
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
                    placeholder={isSearchMode ? 'Search deadlines, resources...' : 'Send us a further enquiry...'}
                    value={enquiryText}
                    onChange={(e) => setEnquiryText(e.target.value)}
                    className="flex-1 bg-white/20 dark:bg-black/20 backdrop-blur-md dark:text-white text-[17px] text-black rounded-full py-2.5 pl-4 pr-12 border border-white/30 dark:border-white/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/50 transition-all placeholder-gray-600 dark:placeholder-gray-400"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleInputSubmit();
                      }
                    }}
                  />
                  <button
                    onClick={handleInputSubmit}
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

            <PreviewModal card={previewCard} onClose={() => setPreviewCard(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
