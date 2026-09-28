// Kicks off the Google OAuth flow for a teacher connecting one of their
// own Google Classroom classes to this app -- e.g. hit
// /.netlify/functions/classroom-auth-start from a "Connect Classroom"
// button. Redirects to Google's consent screen; Google then redirects
// back to classroom-auth-callback.js with an authorization code.
//
// access_type=offline + prompt=consent together are what make Google
// actually issue a refresh token every time (without prompt=consent,
// re-authorizing an already-authorized app can silently skip re-issuing
// one) -- and a fresh refresh token is exactly what resets the 7-day
// clock while this app's OAuth consent screen is still in Google's
// "Testing" publishing status (see the reconnect-reminder in
// classroom-status.js for the other half of that).
//
// Scopes are read-only and deliberately narrow: just enough to list a
// teacher's own courses, read that course's assignments/due dates, and
// (as of the enquiry-routing feature) see the teaching team's names and
// email addresses for a course -- still no student roster/grades/Drive/
// Gmail access. classroom.profile.emails is new here: an existing
// connection made before this line was added won't have granted it, and
// needs to go through /.netlify/functions/classroom-auth-start again
// (prompt=consent below forces the re-grant) before teacher emails will
// actually come back from the API.
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
].join(' ');

export default async (req) => {
  const clientId = process.env.GOOGLE_CLASSROOM_CLIENT_ID;
  if (!clientId) {
    return new Response('Missing GOOGLE_CLASSROOM_CLIENT_ID -- set this in Netlify env vars once you have a Google Cloud OAuth client.', { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/.netlify/functions/classroom-auth-callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
};
