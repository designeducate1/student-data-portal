import { useEffect, useRef, useState } from 'react';

// Sound for an intro screen theme. Off by default; nothing downloads or
// plays until the student turns it on, and it fades in/out rather than
// starting or stopping abruptly.
export type IntroTrack = { src: string; volume: number };

// Woodland: the same two recordings the 3D calendar world uses (pond water
// + songbirds), mixed a little quieter.
export const WOODLAND_TRACKS: IntroTrack[] = [
  { src: '/audio/pond-waves.mp3', volume: 0.35 },
  { src: '/audio/forest-birds.mp3', volume: 0.25 },
];

// Eye: one instrumental piece. Mastered far louder than the ambience, and
// music draws more attention than nature sounds, so it's set to land at
// roughly the woodland mix's level (measured ~-35 dBFS), never above it.
export const EYE_TRACKS: IntroTrack[] = [{ src: '/audio/intro-eye-journey.m4a', volume: 0.12 }];

// Cave: sparse lo-fi piano. Same target level; set a touch lower than the
// eye music because isolated piano notes after a pause stand out more.
export const CAVE_TRACKS: IntroTrack[] = [{ src: '/audio/intro-cave-theme.m4a', volume: 0.1 }];
const FADE_MS = 1200;

// Latest fade per player, so a quick on/off tap cancels the fade in progress.
const activeFade = new WeakMap<HTMLAudioElement, number>();

function fadeTo(audio: HTMLAudioElement, target: number, done?: () => void) {
  const id = (activeFade.get(audio) ?? 0) + 1;
  activeFade.set(audio, id);
  const start = audio.volume;
  const t0 = performance.now();
  const step = (now: number) => {
    if (activeFade.get(audio) !== id) return;
    // rAF timestamps can be a touch earlier than t0 -- clamp, or the first
    // step goes negative and the browser throws on the volume setter.
    const k = Math.min(Math.max((now - t0) / FADE_MS, 0), 1);
    audio.volume = Math.min(Math.max(start + (target - start) * k, 0), 1);
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

export function IntroSoundToggle({ tracks, label }: { tracks: IntroTrack[]; label: string }) {
  const [on, setOn] = useState(false);
  const audiosRef = useRef<HTMLAudioElement[]>([]);

  // Create the players once; stop and release them when the intro screen
  // goes away (login, or switching to another theme).
  useEffect(() => {
    audiosRef.current = tracks.map(({ src }) => {
      const audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'none';
      audio.volume = 0;
      return audio;
    });
    return () => {
      audiosRef.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audiosRef.current = [];
    };
  }, [tracks]);

  useEffect(() => {
    const audios = audiosRef.current;
    if (on) {
      audios.forEach((audio, i) => {
        audio.play().then(() => fadeTo(audio, tracks[i].volume)).catch(() => setOn(false));
      });
    } else {
      audios.forEach((audio) => fadeTo(audio, 0, () => audio.pause()));
    }
  }, [on]);

  // Silence while the tab is hidden, pick up again on return.
  useEffect(() => {
    const onVisibility = () => {
      if (!on) return;
      audiosRef.current.forEach((audio) => {
        if (document.hidden) audio.pause();
        else audio.play().catch(() => {});
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [on]);

  return (
    <label className="sound-toggle" title={`Turn ${label.toLowerCase()} ${on ? 'off' : 'on'}`}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        aria-label={label}
      />
      <svg viewBox="0 0 576 512" height="1em" xmlns="http://www.w3.org/2000/svg" className="mute" aria-hidden="true">
        <path d="M301.1 34.8C312.6 40 320 51.4 320 64V448c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352H64c-35.3 0-64-28.7-64-64V224c0-35.3 28.7-64 64-64h67.8L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3zM425 167l55 55 55-55c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-55 55 55 55c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-55-55-55 55c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l55-55-55-55c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0z" />
      </svg>
      <svg viewBox="0 0 448 512" height="1em" xmlns="http://www.w3.org/2000/svg" className="voice" aria-hidden="true">
        <path d="M301.1 34.8C312.6 40 320 51.4 320 64V448c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352H64c-35.3 0-64-28.7-64-64V224c0-35.3 28.7-64 64-64h67.8L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3zM412.6 181.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5z" />
      </svg>
    </label>
  );
}
