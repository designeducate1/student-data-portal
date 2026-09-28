// Pulls standalone course materials/resources (handouts, links, videos --
// anything a teacher posts that isn't attached to a graded assignment) from
// a connected Google Classroom course. These never show up in
// classroom-coursework.js's output since Classroom treats them as a
// separate resource type (courseWorkMaterials, not courseWork).
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

// Pulls out whatever's actually attached -- a link, a Drive file, or a
// YouTube video -- as a flat {title, url, kind, embedUrl, thumbnailUrl} the
// frontend can render as an inline preview card. `kind`/`embedUrl` use the
// file/video ID Classroom's own API already gives us -- no URL-guessing
// regex needed. Drive's own `/preview` embed renders PDFs, PowerPoint/
// Slides, images and video natively, but it draws its own player chrome
// (a toolbar) inside that iframe that can't be restyled from outside it
// (cross-origin) -- so the frontend shows `thumbnailUrl` as a static
// poster first and only mounts the iframe in a properly-sized viewer once
// tapped, rather than fighting that chrome inside a tiny inline space. A
// plain web link or Form has no free inline preview at all, so both stay
// null and the frontend just links out to it instead.
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

  const res = await fetch(
    `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWorkMaterials?courseWorkMaterialStates=PUBLISHED`,
    { headers: authHeaders }
  );
  const data = await res.json();
  if (!res.ok) return jsonResponse({ error: 'Failed to fetch materials', detail: data }, 502);

  const resources = (data.courseWorkMaterial || []).map((item) => ({
    sourceId: item.id,
    title: item.title,
    description: item.description || '',
    links: flattenMaterials(item.materials),
    alternateLink: item.alternateLink,
  }));

  return jsonResponse({ courseId, resources });
};
