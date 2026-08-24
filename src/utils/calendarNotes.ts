export interface NoteItem {
  text: string;
  time: string;
}

export type WeekNotesMap = Record<number, NoteItem[]>;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export const DAYS_COUNT = 7;

export function getTodayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekStartDate(today: Date = getTodayDate()): Date {
  const d = new Date(today);
  d.setDate(today.getDate() - today.getDay());
  return d;
}

export function dateForCell(row: number, col: number, weekStart: Date = getWeekStartDate()): Date {
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + row * DAYS_COUNT + col);
  return d;
}

export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isoKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function getWeekRangeLabel(row: number, weekStart: Date = getWeekStartDate()): string {
  const start = dateForCell(row, 0, weekStart);
  const end = dateForCell(row, 6, weekStart);
  return `${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getDate()} - ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
}

export function getSampleEvents(today: Date = getTodayDate()): Record<string, string> {
  const events: Record<string, string> = {};
  const sampleList: [number, string][] = [
    [0, 'Chemistry homework due'],
    [3, 'Field trip: Science Museum'],
    [7, 'Essay draft due'],
    [11, 'Half day — early dismissal'],
    [16, 'Maths quiz'],
    [-5, 'Permission slip due'],
    [-9, 'Parent-teacher conferences'],
  ];

  sampleList.forEach(([offset, text]) => {
    events[isoKey(addDays(today, offset))] = text;
  });

  return events;
}

export function serializeNotesToSentences(weekNotes: WeekNotesMap, weekStart: Date = getWeekStartDate()): string {
  const rows = Object.keys(weekNotes)
    .map(Number)
    .sort((a, b) => a - b);
  const sections: string[] = [];

  for (const row of rows) {
    const notes = (weekNotes[row] || []).filter((n) => n && n.text && n.text.trim());
    if (notes.length === 0) continue;

    const rangeLabel = getWeekRangeLabel(row, weekStart);
    const sentenceList = notes.map((n) => {
      let clean = n.text.replace(/[{}[\]\\"]/g, '').trim();
      if (clean && !clean.endsWith('.') && !clean.endsWith('!') && !clean.endsWith('?')) {
        clean += '.';
      }
      const timePart = n.time ? ` (at ${n.time})` : '';
      return clean + timePart;
    });

    sections.push(`Week of ${rangeLabel}: ${sentenceList.join(' ')}`);
  }

  return sections.join('\n');
}

export function parseNotesToMap(rawInput: string, weekStart: Date = getWeekStartDate()): WeekNotesMap {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    return {};
  }
  const str = rawInput.trim();

  // 1. JSON Support
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      const res: WeekNotesMap = {};
      for (const k in parsed) {
        const rowNum = parseInt(k.replace(/\D/g, ''), 10);
        const validRowNum = isNaN(rowNum) ? 0 : rowNum;
        const v = parsed[k];
        if (Array.isArray(v)) {
          res[validRowNum] = v
            .map((item) => {
              if (typeof item === 'string') {
                return { text: item.replace(/[{}[\]\\"]/g, '').trim(), time: '' };
              }
              return {
                text: String(item.text || '').replace(/[{}[\]\\"]/g, '').trim(),
                time: String(item.time || ''),
              };
            })
            .filter((item) => item.text);
        }
      }
      return res;
    } catch {
      // fallback
    }
  }

  // 2. Grammatical sentence / Multi-line parser
  const map: WeekNotesMap = {};
  const lines = str
    .split(/\r?\n|(?=Week\s+of\s+)|(?=Week\s+\d+:?)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const fallbackRow = 0;

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    if (!line) continue;

    let targetRow = fallbackRow;
    let content = line;

    const weekOfMatch = line.match(/^Week\s+of\s+([A-Za-z]{3}\s+\d+\s*-\s*[A-Za-z]{3}\s+\d+)[:\s-]*(.*)/i);
    const weekNumMatch = line.match(/^Week\s*(\d+)[:\s-]*(.*)/i);

    if (weekOfMatch) {
      const dateRangeStr = weekOfMatch[1].trim().toLowerCase();
      content = weekOfMatch[2];
      let foundRow: number | null = null;
      for (let r = -10; r <= 30; r++) {
        if (getWeekRangeLabel(r, weekStart).toLowerCase() === dateRangeStr) {
          foundRow = r;
          break;
        }
      }
      if (foundRow !== null) {
        targetRow = foundRow;
      }
    } else if (weekNumMatch) {
      targetRow = parseInt(weekNumMatch[1], 10);
      content = weekNumMatch[2];
    }

    if (!content) continue;

    content = content.replace(/[{}[\]\\"]/g, '').trim();
    const rawSentences = content
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (let s = 0; s < rawSentences.length; s++) {
      let text = rawSentences[s];
      if (!text) continue;
      let time = '';

      const timeMatch = text.match(/\((?:at\s+)?(\d{1,2}:\d{2}(?:\s*[ap]m)?)\)/i);
      if (timeMatch) {
        time = timeMatch[1];
        text = text.replace(timeMatch[0], '').trim();
      }

      text = text.replace(/[.]+$/, '').trim();

      if (text) {
        if (!map[targetRow]) map[targetRow] = [];
        map[targetRow].push({ text, time });
      }
    }
  }

  if (Object.keys(map).length === 0 && str) {
    const cleanStr = str.replace(/[{}[\]\\"]/g, '').trim();
    if (cleanStr) {
      map[0] = [{ text: cleanStr, time: '' }];
    }
  }

  return map;
}
