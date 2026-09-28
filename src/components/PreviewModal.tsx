import { useEffect, useRef, useState } from 'react';
import { ChatCard } from '../types';

interface PreviewModalProps {
  card: ChatCard | null;
  onClose: () => void;
}

// Full-size viewer for a Drive/YouTube attachment, opened from a tapped
// preview card in the chat. Deliberately NOT an inline expansion inside the
// chat bubble -- Drive's own `/preview` embed draws its own player toolbar
// inside the iframe (a black bar with its own small "open externally" icon)
// that can't be reached or restyled from here (cross-origin) -- true for
// video, PDF and PowerPoint previews alike, since they all go through this
// same Drive embed. The expand button in THIS header is a separate,
// reliable full-screen action we do control, rather than trying to remove
// Drive's icon.
//
// That icon only actually shows briefly while Drive's own internal player
// is still settling in -- covering the iframe with the card's thumbnail
// (plus a small minimum delay, since the iframe's onLoad fires before
// Drive's own JS chrome has finished its transition) hides that flash
// without needing to touch the iframe's contents at all.
export default function PreviewModal({ card, onClose }: PreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    setIframeLoaded(false);
    setMinTimePassed(false);
    if (!card) return;
    const t = setTimeout(() => setMinTimePassed(true), 700);
    return () => clearTimeout(t);
  }, [card]);

  if (!card) return null;

  const isReady = iframeLoaded && minTimePassed;

  const handleExpand = () => {
    const el = iframeRef.current as (HTMLIFrameElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center pointer-events-auto px-4 transition-all duration-300">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-[#F2F2F7] dark:bg-zinc-900 w-full max-w-[420px] rounded-[1.5rem] shadow-2xl overflow-hidden relative z-10 border border-white/60 dark:border-zinc-700 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-black/10 dark:border-white/10">
          <span className="flex-1 min-w-0 text-[13px] font-semibold text-black dark:text-white truncate">
            {card.title}
          </span>
          {card.embedUrl && (
            <button
              onClick={handleExpand}
              title="Expand to full screen"
              aria-label="Expand to full screen"
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[#007AFF] active:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="shrink-0 text-[13px] font-bold text-[#007AFF] active:opacity-50 cursor-pointer"
          >
            Close
          </button>
        </div>
        <div className="w-full aspect-video bg-black relative">
          {card.embedUrl && (
            <iframe
              ref={iframeRef}
              src={card.embedUrl}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              onLoad={() => setIframeLoaded(true)}
            />
          )}
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              {card.thumbnailUrl && (
                <img src={card.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
              )}
              <div className="relative w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
