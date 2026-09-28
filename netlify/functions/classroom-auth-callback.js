// Google redirects here after the teacher approves the consent screen,
// with a one-time ?code=... to exchange for real tokens. That exchange
// needs the OAuth client secret, which is exactly why this can't happen
// in the browser -- it only ever runs here, server-side.
//
// obtainedAt is stored specifically so classroom-status.js can warn
// before the 7-day Testing-mode refresh-token expiry (see that file and
// classroom-auth-start.js) -- it's the "issued at" clock for the refresh
// token, reset every time this callback runs, not the shorter-lived
// access token's own expiry.
import { getStore } from '@netlify/blobs';

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) return jsonResponse({ error: `Google returned an error: ${error}` }, 400);
  if (!code) return jsonResponse({ error: 'Missing ?code from Google' }, 400);

  const clientId = process.env.GOOGLE_CLASSROOM_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLASSROOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'Missing GOOGLE_CLASSROOM_CLIENT_ID/SECRET env vars' }, 500);
  }

  const redirectUri = `${url.origin}/.netlify/functions/classroom-auth-callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return jsonResponse({ error: 'Token exchange failed', detail: tokenData }, 502);
  }
  if (!tokenData.refresh_token) {
    // Happens if the teacher had already granted access before without
    // prompt=consent forcing a fresh one -- without a refresh token there's
    // nothing to renew after the access token expires, so treat it as a
    // hard failure rather than silently storing a connection that will
    // stop working within the hour.
    return jsonResponse({
      error: 'No refresh token returned -- revoke this app\'s access at https://myaccount.google.com/permissions and try connecting again.',
    }, 502);
  }

  const now = Date.now();
  const store = getStore('classroom-connection');
  await store.setJSON('connection', {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    accessTokenExpiresAt: now + (tokenData.expires_in || 3600) * 1000,
    obtainedAt: now, // resets the 7-day Testing-mode clock -- see classroom-status.js
    updatedAt: now,
  });

  return new Response(null, { status: 302, headers: { Location: '/?classroom=connected' } });
};
