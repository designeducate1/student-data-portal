// Calendar notes are kept on the student's own device only -- never synced
// to the shared Google Sheet the rest of this app reads grades/timetable
// data from. That's a deliberate privacy choice (see the build brief), not
// an oversight: the sheet is staff-visible, and free-text notes a student
// writes about their own day shouldn't be. Everything else in this app
// (login, grades lookup, enquiries) is unchanged from the original project.
//
// Key scheme matches the original project's own `calendar_walk_notes_<id>`
// convention, keyed by the student's real login ID, so the 3D and 2D
// calendar views (which both read/write this key) always agree.

const NOTES_KEY_PREFIX = 'calendar_walk_notes_';
const TASKS_KEY_PREFIX = 'calendar_walk_tasks_';

export function loadCalendarNotes(studentId: string): string {
  try {
    return localStorage.getItem(NOTES_KEY_PREFIX + (studentId || 'guest')) || '';
  } catch {
    return '';
  }
}

export function saveCalendarNotes(studentId: string, notesFormatted: string): void {
  try {
    const key = NOTES_KEY_PREFIX + (studentId || 'guest');
    if (notesFormatted && notesFormatted.trim()) {
      localStorage.setItem(key, notesFormatted);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage full or unavailable -- notes just won't persist this session.
  }
}

// Tasks a student has added to calendar dates (decoder + estimator output
// already baked in). Same local-only key scheme as notes, and matches the
// key CalendarWalk.tsx's own internal fallback uses, so both stay in sync.
export function loadCalendarTasks(studentId: string): string {
  try {
    return localStorage.getItem(TASKS_KEY_PREFIX + (studentId || 'guest')) || '';
  } catch {
    return '';
  }
}

export function saveCalendarTasks(studentId: string, tasksJson: string): void {
  try {
    const key = TASKS_KEY_PREFIX + (studentId || 'guest');
    if (tasksJson && tasksJson.trim() && tasksJson !== '{}') {
      localStorage.setItem(key, tasksJson);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage full or unavailable -- tasks just won't persist this session.
  }
}
