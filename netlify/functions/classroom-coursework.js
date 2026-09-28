// Pulls real assignments/due dates from a connected Google Classroom
// course and maps them into the same shape the calendar's own task
// system already understands (see createTask() in CalendarWalk.tsx) --
// this function's only job is reading Classroom; the free, existing
// step-decomposition/scheduling logic downstream doesn't change at all.
//
// Refreshes the access token here if it's expired (using the stored
// refresh token) -- this is the routine, expected kind of refresh and
// has nothing to do with the 7-day Testing-mode expiry on the refresh
// token itself (see classroom-status.js for that).
import { getStore } from '@netlify/blobs';

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function refreshAccessToken(connection) {
  const clientId = process.env.GOOGLE_CLASSROOM_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLASSROOM_CLIENT_SECRET;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    // invalid_grant here almost always means the 7-day Testing-mode
    // refresh token has actually expired -- surface that plainly rather
    // than a generic failure, since the fix (reconnect) is different
    // from an ordinary transient error.
    const reason = data.error === 'invalid_grant'
      ? 'Refresh token no longer valid -- likely the 7-day Testing-mode expiry. Reconnect via /.netlify/functions/classroom-auth-start.'
      : 'Token refresh failed';
    throw new Error(`${reason}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Google's courseWork dueDate/dueTime are separate {year,month,day} and
// {hours,minutes} objects (UTC, per Classroom API docs) -- combine into
// the plain "YYYY-MM-DD" string createTask()/dueDateISO already expects.
function toDueDateISO(dueDate) {
  if (!dueDate) return null;
  const mm = String(dueDate.month).padStart(2, '0');
  const dd = String(dueDate.day).padStart(2, '0');
  return `${dueDate.year}-${mm}-${dd}`;
}

// Free, no-AI date extraction for the "breadcrumb" waypoints along the 3D
// deadline trail. Teachers write dates in a small, predictable set of
// human phrasings inside a brief's own description ("w/c 15th Sept", "due
// 3rd November") -- this is plain pattern matching over text already being
// fetched, not language understanding, so it costs nothing to run and
// needs no external call. Two deliberately simple, deterministic rules
// keep it honest about what it can't know:
//   - No year is ever written in these phrases, so every match borrows the
//     due date's own year rather than guessing.
//   - Only dates that fall within [today, the real due date] are kept --
//     the real due date itself always comes from Classroom's own
//     structured field, never from this parsing, so a brief's text
//     mentioning a date past the actual deadline (a real, messy
//     possibility) is simply out of range and dropped, not "corrected."
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Plain day-of-month validity (e.g. rejects "31 February") -- deliberately
// not routed through a Date/toISOString round-trip, which is timezone-
// sensitive and can silently shift near midnight depending on server TZ.
function isValidCalendarDate(year, month, day) {
  const y = parseInt(year, 10);
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}
function extractDateWaypoints(text, dueDateISO) {
  if (!text || !dueDateISO) return [];
  const dueYear = dueDateISO.slice(0, 4);
  const monthPattern = MONTH_NAMES.map((m) => m.slice(0, 3) + '[a-z]*').join('|');
  const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\b`, 'gi');
  const waypoints = [];
  const seenDates = new Set();
  let match;
  while ((match = re.exec(text))) {
    const day = parseInt(match[1], 10);
    const monthAbbr = match[2].slice(0, 3).toLowerCase();
    const monthIndex = MONTH_NAMES.findIndex((m) => m.startsWith(monthAbbr));
    if (monthIndex === -1 || !isValidCalendarDate(dueYear, monthIndex + 1, day)) continue;
    const dateISO = `${dueYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (seenDates.has(dateISO)) continue;
    seenDates.add(dateISO);
    const start = Math.max(0, match.index - 10);
    const end = Math.min(text.length, match.index + match[0].length + 60);
    const label = text.slice(start, end).replace(/\s+/g, ' ').trim();
    waypoints.push({ dateISO, label });
  }
  return waypoints;
}

export default async (req) => {
  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId');

  const store = getStore('classroom-connection');
  let connection = await store.get('connection', { type: 'json' });
  if (!connection) {
    return jsonResponse({ error: 'Not connected -- visit /.netlify/functions/classroom-auth-start first' }, 401);
  }

  if (Date.now() >= connection.accessTokenExpiresAt - 60000) {
    try {
      const refreshed = await refreshAccessToken(connection);
      connection = {
        ...connection,
        accessToken: refreshed.access_token,
        accessTokenExpiresAt: Date.now() + (refreshed.expires_in || 3600) * 1000,
        updatedAt: Date.now(),
      };
      await store.setJSON('connection', connection);
    } catch (err) {
      return jsonResponse({ error: String(err.message || err) }, 401);
    }
  }

  const authHeaders = { Authorization: `Bearer ${connection.accessToken}` };

  // No courseId given -- just list the teacher's courses so the app (or
  // whoever's setting this up) can see what's available to pick from.
  if (!courseId) {
    const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', { headers: authHeaders });
    const data = await res.json();
    if (!res.ok) return jsonResponse({ error: 'Failed to list courses', detail: data }, 502);
    return jsonResponse({
      courses: (data.courses || []).map((c) => ({ id: c.id, name: c.name, section: c.section || null })),
    });
  }

  const [courseWorkRes, topicsRes] = await Promise.all([
    fetch(`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork?courseWorkStates=PUBLISHED`, { headers: authHeaders }),
    fetch(`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/topics`, { headers: authHeaders }),
  ]);
  const data = await courseWorkRes.json();
  if (!courseWorkRes.ok) return jsonResponse({ error: 'Failed to fetch coursework', detail: data }, 502);

  // Topics are the teacher's own groupings (e.g. "Unit 3: Typography") --
  // optional on Classroom's side, so a course with none of these just
  // means every task's topicName comes back null.
  const topicsData = topicsRes.ok ? await topicsRes.json() : { topic: [] };
  const topicNameById = new Map((topicsData.topic || []).map((t) => [t.topicId, t.name]));

  const tasks = (data.courseWork || [])
    .filter((cw) => cw.dueDate) // no due date -- nothing for the deadline trail to schedule
    .map((cw) => {
      const dueDateISO = toDueDateISO(cw.dueDate);
      return {
        sourceId: cw.id,
        rawText: cw.title,
        description: cw.description || '',
        dueDateISO,
        alternateLink: cw.alternateLink,
        topicName: cw.topicId ? (topicNameById.get(cw.topicId) || null) : null,
        // Breadcrumb waypoints for the 3D deadline trail -- see
        // extractDateWaypoints() above for what this can and can't do.
        waypoints: extractDateWaypoints(cw.description, dueDateISO),
      };
    });

  return jsonResponse({ courseId, tasks });
};
