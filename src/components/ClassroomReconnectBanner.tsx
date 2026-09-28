import React from 'react';

interface ClassroomStatus {
  connected: boolean;
  daysRemaining?: number;
  needsReconnectSoon?: boolean;
  expired?: boolean;
}

// Polls classroom-status.js on an interval and surfaces a plain, low-key
// warning before Google's 7-day Testing-mode refresh-token expiry can
// turn into a silent "deadlines stopped updating" failure -- reconnecting
// is a few seconds of clicking through Google's consent screen, so the
// only real risk is nobody noticing until after it's already expired.
const POLL_INTERVAL_MS = 60 * 60 * 1000; // hourly -- this only ever changes day to day

export function ClassroomReconnectBanner() {
  const [status, setStatus] = React.useState<ClassroomStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch('/.netlify/functions/classroom-status')
        .then((res) => res.json())
        .then((data: ClassroomStatus) => { if (!cancelled) setStatus(data); })
        .catch(() => { /* offline or not deployed yet -- fail quiet, not another thing to worry about */ });
    };
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!status || !status.connected || !status.needsReconnectSoon) return null;

  const message = status.expired
    ? 'Google Classroom connection has expired -- deadlines have stopped updating.'
    : `Google Classroom connection needs reconnecting in ${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'}.`;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 text-sm shadow-lg"
    >
      <span>{message}</span>
      <a
        href="/.netlify/functions/classroom-auth-start"
        className="font-semibold underline underline-offset-2 hover:text-amber-950"
      >
        Reconnect
      </a>
    </div>
  );
}
