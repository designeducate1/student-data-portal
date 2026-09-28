// Powers the "reconnect Google Classroom soon" banner. Tracks days since
// the refresh token was last (re-)issued -- via the full consent flow in
// classroom-auth-callback.js, not the routine access-token refreshes in
// classroom-coursework.js -- and warns before Google's 7-day Testing-mode
// expiry can turn into a silent failure. See classroom-auth-start.js for
// why prompt=consent is what makes reconnecting actually reset this.
import { getStore } from '@netlify/blobs';

// Warn a day early rather than exactly at the wire -- gives whoever
// manages the connection a spare day if they don't see it immediately.
const TESTING_MODE_TOKEN_LIFETIME_DAYS = 7;
const WARN_WITHIN_DAYS = 2;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async () => {
  const store = getStore('classroom-connection');
  const connection = await store.get('connection', { type: 'json' });

  if (!connection) {
    return jsonResponse({ connected: false });
  }

  const ageMs = Date.now() - connection.obtainedAt;
  const ageDays = ageMs / 86400000;
  const daysRemaining = Math.max(0, TESTING_MODE_TOKEN_LIFETIME_DAYS - ageDays);

  return jsonResponse({
    connected: true,
    daysRemaining: Math.round(daysRemaining * 10) / 10,
    needsReconnectSoon: daysRemaining <= WARN_WITHIN_DAYS,
    expired: daysRemaining <= 0,
  });
};
