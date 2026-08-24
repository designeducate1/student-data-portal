import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  NoteItem,
  WeekNotesMap,
  MONTH_NAMES,
  WEEKDAYS,
  getTodayDate,
  getWeekStartDate,
  dateForCell,
  isSameDate,
  isoKey,
  getWeekRangeLabel,
  getSampleEvents,
  parseNotesToMap,
  serializeNotesToSentences,
} from '../utils/calendarNotes';

interface Calendar2DProps {
  isOpen: boolean;
  studentId: string;
  initialNotes: string;
  onNotesChange: (notesFormatted: string) => void;
  onClose: () => void;
}

export const Calendar2D: React.FC<Calendar2DProps> = ({
  isOpen,
  studentId,
  initialNotes,
  onNotesChange,
  onClose,
}) => {
  const today = useMemo(() => getTodayDate(), []);
  const weekStart = useMemo(() => getWeekStartDate(today), [today]);
  const sampleEvents = useMemo(() => getSampleEvents(today), [today]);

  const storageKey = `calendar_walk_notes_${studentId || 'guest'}`;

  // State
  const [weekNotes, setWeekNotes] = useState<WeekNotesMap>({});
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [activeWeekModalRow, setActiveWeekModalRow] = useState<number | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [visibleRange, setVisibleRange] = useState<{ startRow: number; endRow: number }>({
    startRow: -4,
    endRow: 12,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const todayRowRef = useRef<HTMLDivElement>(null);

  // Initialize and sync notes
  useEffect(() => {
    if (initialNotes && initialNotes.trim()) {
      setWeekNotes(parseNotesToMap(initialNotes, weekStart));
    } else {
      const local = localStorage.getItem(storageKey);
      if (local && local.trim()) {
        setWeekNotes(parseNotesToMap(local, weekStart));
      } else {
        setWeekNotes({});
      }
    }
  }, [initialNotes, storageKey, weekStart]);

  // Scroll to today's row when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (todayRowRef.current) {
          todayRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [isOpen]);

  const rows = useMemo(() => {
    const list: number[] = [];
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      list.push(r);
    }
    return list;
  }, [visibleRange]);

  const selectedKey = isoKey(selectedDate);
  const selectedEvent = sampleEvents[selectedKey] || 'No events scheduled for this day.';
  const isSelectedToday = isSameDate(selectedDate, today);

  // Notes synchronization
  const handleSaveNotes = (updated: WeekNotesMap) => {
    setWeekNotes(updated);
    const sentences = serializeNotesToSentences(updated, weekStart);
    if (sentences && sentences.trim()) {
      try {
        localStorage.setItem(storageKey, sentences);
      } catch {}
    } else {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
    onNotesChange(sentences);
  };

  const handleAddNote = () => {
    if (activeWeekModalRow === null || !newNoteText.trim()) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const currentList = weekNotes[activeWeekModalRow] || [];
    const updated = {
      ...weekNotes,
      [activeWeekModalRow]: [...currentList, { text: newNoteText.trim(), time: timeStr }],
    };

    setNewNoteText('');
    handleSaveNotes(updated);
  };

  const handleDeleteNote = (row: number, index: number) => {
    const currentList = weekNotes[row] || [];
    const newList = [...currentList];
    newList.splice(index, 1);

    const updated = { ...weekNotes };
    if (newList.length === 0) {
      delete updated[row];
    } else {
      updated[row] = newList;
    }
    handleSaveNotes(updated);
  };

  const handleJumpToToday = () => {
    setSelectedDate(today);
    if (todayRowRef.current) {
      todayRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="calendar2DView"
      className="absolute inset-0 z-40 flex flex-col bg-slate-900/40 backdrop-blur-xl transition-all duration-300 pointer-events-auto select-none pt-14 pb-4 px-3"
      style={{ animation: 'fade-in 0.25s ease-out both' }}
    >
      {/* Top Bar Header & Selected Day Focus HUD */}
      <div className="shrink-0 mb-3 flex flex-col gap-2">
        {/* Navigation & Controls Bar */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-black text-white drop-shadow-md flex items-center gap-1.5">
              <span>📅</span> 2D Calendar
            </span>
            <button
              onClick={handleJumpToToday}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1"
            >
              <span>📍</span> Today
            </button>
          </div>

          <button
            onClick={onClose}
            className="text-[11px] font-bold px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/25 active:scale-95 transition-all cursor-pointer"
          >
            ✕ Close 2D
          </button>
        </div>

        {/* Translucent Focus Billboard (Same as 3D HUD) */}
        <div className="bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/40 dark:border-white/10 flex flex-col gap-1.5 transition-all">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-[15px] sm:text-[16px] text-slate-900 dark:text-white">
              <span>🗓️</span>
              <span>
                {WEEKDAYS[selectedDate.getDay()]}, {MONTH_NAMES[selectedDate.getMonth()].slice(0, 3)}{' '}
                {selectedDate.getDate()}, {selectedDate.getFullYear()}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isSelectedToday
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              {isSelectedToday ? 'Today' : `Day ${selectedDate.getDate()}`}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-700 dark:text-zinc-200 bg-slate-100/80 dark:bg-zinc-800/80 rounded-xl px-2.5 py-1.5 border border-slate-200/60 dark:border-zinc-700/60">
            <span className="shrink-0">📋</span>
            <span className="truncate">{selectedEvent}</span>
          </div>
        </div>
      </div>

      {/* Weekday Column Headers */}
      <div className="grid grid-cols-7 gap-1 px-1 mb-1 text-center font-bold text-[10px] sm:text-[11px] text-white/90 uppercase tracking-wider shrink-0">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => (
          <div key={idx} className="py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable Calendar Weeks Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2.5 pr-0.5"
      >
        {/* Load More Past Weeks */}
        <button
          onClick={() =>
            setVisibleRange((prev) => ({ ...prev, startRow: prev.startRow - 6 }))
          }
          className="w-full py-1 text-[11px] font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-all text-center cursor-pointer border border-white/10"
        >
          ↑ Load Earlier Weeks
        </button>

        {rows.map((row) => {
          const weekRangeStr = getWeekRangeLabel(row, weekStart);
          const notesCount = (weekNotes[row] || []).length;
          const isCurrentWeekRow = row === 0;

          return (
            <div
              key={row}
              ref={isCurrentWeekRow ? todayRowRef : undefined}
              className={`flex flex-col gap-1 rounded-2xl p-2 transition-all ${
                isCurrentWeekRow
                  ? 'bg-blue-600/20 border border-blue-400/40 shadow-md backdrop-blur-md'
                  : 'bg-white/15 dark:bg-black/25 border border-white/15 backdrop-blur-md'
              }`}
            >
              {/* Week Header & Notes Action Bar (Transitional Barrier) */}
              <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-white/90">
                <span className="flex items-center gap-1.5">
                  <span className="opacity-75">Week:</span>
                  <span className="font-bold text-white">{weekRangeStr}</span>
                  {isCurrentWeekRow && (
                    <span className="text-[9px] bg-blue-500 text-white font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                      Current
                    </span>
                  )}
                </span>

                <button
                  onClick={() => setActiveWeekModalRow(row)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer ${
                    notesCount > 0
                      ? 'bg-amber-400 text-slate-950 font-extrabold shadow-sm'
                      : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                  title="Click to write/view notes for this week"
                >
                  <span>📝</span>
                  <span>{notesCount > 0 ? `${notesCount} ${notesCount === 1 ? 'Note' : 'Notes'}` : '+ Note'}</span>
                </button>
              </div>

              {/* Day Cells (7-column grid) */}
              <div className="grid grid-cols-7 gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((col) => {
                  const cellDate = dateForCell(row, col, weekStart);
                  const cellKey = isoKey(cellDate);
                  const isDayToday = isSameDate(cellDate, today);
                  const isSelected = isSameDate(cellDate, selectedDate);
                  const hasEvent = Boolean(sampleEvents[cellKey]);

                  return (
                    <button
                      key={col}
                      onClick={() => setSelectedDate(cellDate)}
                      className={`relative flex flex-col items-center justify-between py-2 px-0.5 rounded-xl transition-all cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-blue-400 bg-white/90 text-slate-900 shadow-md scale-[1.02]'
                          : isDayToday
                          ? 'bg-blue-600 text-white font-extrabold shadow-md'
                          : 'bg-white/25 dark:bg-white/10 hover:bg-white/35 text-white'
                      }`}
                    >
                      <span
                        className={`text-[13px] font-bold leading-none ${
                          isSelected
                            ? 'text-blue-700'
                            : isDayToday
                            ? 'text-white font-black'
                            : 'text-white'
                        }`}
                      >
                        {cellDate.getDate()}
                      </span>

                      <div className="h-1.5 flex items-center justify-center mt-1">
                        {hasEvent && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected
                                ? 'bg-blue-600'
                                : isDayToday
                                ? 'bg-amber-300'
                                : 'bg-emerald-400'
                            }`}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Load More Future Weeks */}
        <button
          onClick={() =>
            setVisibleRange((prev) => ({ ...prev, endRow: prev.endRow + 6 }))
          }
          className="w-full py-1 text-[11px] font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-all text-center cursor-pointer border border-white/10 mt-1 mb-2"
        >
          ↓ Load Later Weeks
        </button>
      </div>

      {/* Week Notes Interactive Drawer / Modal */}
      {activeWeekModalRow !== null && (
        <div
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          style={{ animation: 'fade-in 0.2s ease-out both' }}
        >
          <div
            className="w-full max-w-sm bg-white/90 dark:bg-zinc-900/95 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-3xl p-4 shadow-2xl flex flex-col max-h-[85%]"
            style={{ animation: 'slide-in-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <h3 className="font-extrabold text-[15px] text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>📝</span> Week Notes
                </h3>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                  Week of {getWeekRangeLabel(activeWeekModalRow, weekStart)}
                </p>
              </div>
              <button
                onClick={() => setActiveWeekModalRow(null)}
                className="w-7 h-7 rounded-full bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold text-[13px] flex items-center justify-center hover:opacity-80 active:scale-95 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto no-scrollbar my-3 flex flex-col gap-2 pr-0.5">
              {(weekNotes[activeWeekModalRow] || []).length === 0 ? (
                <div className="text-center text-slate-400 dark:text-zinc-500 py-6 text-[12px] italic">
                  No notes recorded for this week yet. Type below to add one!
                </div>
              ) : (
                (weekNotes[activeWeekModalRow] || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/60 shadow-sm"
                  >
                    <div className="flex-1 text-[13px] leading-snug text-slate-900 dark:text-white">
                      <p>{item.text}</p>
                      {item.time && (
                        <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-1">
                          at {item.time}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteNote(activeWeekModalRow, idx)}
                      className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-950 dark:text-red-400 text-[11px] font-bold flex items-center justify-center cursor-pointer shrink-0 active:scale-90"
                      title="Delete note"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Note Input Box */}
            <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
              <input
                type="text"
                placeholder="Write a note for this week..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNote();
                }}
                className="flex-1 bg-slate-100 dark:bg-zinc-800 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 rounded-xl px-3 py-2 border border-slate-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddNote}
                disabled={!newNoteText.trim()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[12px] font-bold rounded-xl active:scale-95 transition-all cursor-pointer shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
