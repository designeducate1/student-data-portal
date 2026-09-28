// Recreates Google Classroom's own "Stream" page -- announcements,
// assignments and materials all merged into one chronological feed --
// but as plain, decluttered data instead of Classroom's own dense UI.
// This is the app's actual point: same underlying activity, calmer view.
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

// See classroom-materials.js for the fuller explanation -- kind/embedUrl
// use the file/video ID Classroom's API already gives us, and thumbnailUrl
// lets the frontend show a static poster instead of mounting Drive's own
// iframe (with its own non-restylable player chrome) until actually tapped.
function flattenMaterials(materials) {
  return (materials || []).map((m) => {
    if (m.link) return { title: m.link.title || m.link.url, url: m.link.url, kind: 'link', embedUrl: null, thumbnailUrl: null };
    if (m.driveFile && m.driveFile.driveFile) {
      const f = m.driveFile.driveFile;
      return { title: f.title, url: f.alternateLink, kind: 'drive', embedUrl: `https://drive.google.com/file/d/${f.id}/preview`, thumbnailUrl: f.thumbnailUrl || null };
    }
    if (m.youTubeVideo) {
      return { title: m.youTubeVideo.title, url: m.youTubeVideo.alternateLink, kind: 'youtube', embedUrl: `https://www.youtube.com/embed/${m.youTubeVideo.id}`, thumbnailUrl: m.youTubeVideo.thumbnailUrl || null };
    }
    if (m.form) return { title: m.form.title, url: m.form.formUrl, kind: 'link', embedUrl: null, thumbnailUrl: null };
    return null;
  }).filter(Boolean);
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
  const base = `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}`;

  const [announcementsRes, courseWorkRes, materialsRes] = await Promise.all([
    fetch(`${base}/announcements?announcementStates=PUBLISHED`, { headers: authHeaders }),
    fetch(`${base}/courseWork?courseWorkStates=PUBLISHED`, { headers: authHeaders }),
    fetch(`${base}/courseWorkMaterials?courseWorkMaterialStates=PUBLISHED`, { headers: authHeaders }),
  ]);

  const [announcementsData, courseWorkData, materialsData] = await Promise.all([
    announcementsRes.ok ? announcementsRes.json() : { announcements: [] },
    courseWorkRes.ok ? courseWorkRes.json() : { courseWork: [] },
    materialsRes.ok ? materialsRes.json() : { courseWorkMaterial: [] },
  ]);

  const items = [
    ...(announcementsData.announcements || []).map((a) => ({
      type: 'announcement',
      sourceId: a.id,
      title: null,
      text: a.text || '',
      postedAt: a.creationTime,
      alternateLink: a.alternateLink,
    })),
    ...(courseWorkData.courseWork || []).map((cw) => ({
      type: 'assignment',
      sourceId: cw.id,
      title: cw.title,
      text: cw.description || '',
      postedAt: cw.creationTime,
      dueDateISO: cw.dueDate ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2, '0')}-${String(cw.dueDate.day).padStart(2, '0')}` : null,
      links: flattenMaterials(cw.materials),
      alternateLink: cw.alternateLink,
    })),
    ...(materialsData.courseWorkMaterial || []).map((m) => ({
      type: 'material',
      sourceId: m.id,
      title: m.title,
      text: m.description || '',
      postedAt: m.creationTime,
      links: flattenMaterials(m.materials),
      alternateLink: m.alternateLink,
    })),
  ];

  items.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  return jsonResponse({ courseId, stream: items });
};
