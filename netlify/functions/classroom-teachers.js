// Lists the real teaching team for a connected Classroom course -- name
// and email for each teacher -- so the enquiry panel can let a student
// pick a specific person rather than a single fixed destination.
//
// Needs the classroom.profile.emails scope (added alongside this
// feature in classroom-auth-start.js). A connection made before that
// scope existed won't return emailAddress here -- reconnect via
// /.netlify/functions/classroom-auth-start to grant it.
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
    const reason = data.error === 'invalid_grant'
      ? 'Refresh token no longer valid -- likely the 7-day Testing-mode expiry. Reconnect via /.netlify/functions/classroom-auth-start.'
      : 'Token refresh failed';
    throw new Error(`${reason}: ${JSON.stringify(data)}`);
  }
  return data;
}

export default async (req) => {
  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId');
  if (!courseId) return jsonResponse({ error: 'Missing ?courseId' }, 400);

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

  const res = await fetch(
    `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/teachers`,
    { headers: authHeaders }
  );
  const data = await res.json();
  if (!res.ok) return jsonResponse({ error: 'Failed to fetch teachers', detail: data }, 502);

  const teachers = (data.teachers || []).map((t) => ({
    userId: t.userId,
    name: t.profile && t.profile.name ? t.profile.name.fullName : 'Unknown',
    // Only present if classroom.profile.emails was granted -- see file header.
    email: (t.profile && t.profile.emailAddress) || null,
  }));

  return jsonResponse({ courseId, teachers });
};
