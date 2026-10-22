import React from 'react';

// ---------------------------------------------------------------------------
// CalendarWalk.tsx
//
// A bounded, single-month "flip calendar" diorama, following the same
// pattern already used by MotionFramer.tsx in this codebase: the entire
// scene (HTML + CSS + JS, including its own <script> tags that load Three.js
// from a CDN) is embedded as one string and handed to an <iframe srcDoc=...>.
// The iframe gets its own separate, isolated document and JS context, so
// this vanilla-JS scene runs completely independently of React/Vite/the
// npm-installed `three` package -- no build-time bundling, no version
// conflicts (this scene targets Three.js r128; the installed npm package is
// a much newer, API-incompatible version).
//
// This replaces an earlier "endless scrolling world" design. The character
// now walks freely within one physical month-object (like a desk flip
// calendar/flip-clock), bounded on all sides; reaching the far edge plays a
// two-page flip transition -- the current month rotates up and away around
// a shared binder-ring hinge while the next month rotates into place -- and
// the character continues walking onto day 1 of the new month. Notes are
// now tied directly to the real calendar date the student is standing on
// when they add them (no separate day-picker, no "week gap" tile) --
// walking IS how you pick the date.
// ---------------------------------------------------------------------------

function getCalendarWalkHtml(
  initialNotesJson: string,
  studentId: string,
  currentBgUrl: string,
  isDarkMode: boolean,
  initialTasksJson: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Flip Calendar Walk (vanilla Three.js r128)</title>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Cinzel:wght@600;700&family=EB+Garamond:ital,wght@0,500;1,500&family=Baloo+2:wght@500;700&family=Nunito:wght@400;600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">

  <style>
    * , *::before, *::after { box-sizing: border-box; }
    * { margin: 0; }
    html, body { height: 100%; }

    :root {
      --cal-plinth: #a9bcc9;
      --cal-card: #f4f2ec;
      --cal-card-today: #dff0e4;
      --cal-ring: #8fae9c;
      --cal-accent: #3c5a6b;
      --cal-text: #1f2d33;
      --cal-text-muted: #5c6f77;
      --cal-surface: rgba(255, 255, 255, 0.82);
      --cal-surface-border: rgba(255, 255, 255, 0.9);
      --cal-modal-surface: #ffffff;
      --cal-modal-text: #1f2d33;
      --cal-modal-border: #dfe6ea;
      --cal-shadow: 0 12px 36px rgba(15, 23, 42, 0.14);
      --font-display: 'Quicksand', sans-serif;
      --font-body: 'Nunito', sans-serif;
      --world-bg: #dfe4ea;
    }
    html[data-mode="dark"] {
      --cal-surface: rgba(24, 28, 30, 0.82);
      --cal-surface-border: rgba(255, 255, 255, 0.14);
      --cal-modal-surface: #1b2023;
      --cal-modal-text: #eef2f3;
      --cal-modal-border: rgba(255, 255, 255, 0.12);
      --world-bg: #12171a;
    }
    html[data-theme="minecraft"] {
      --cal-plinth: #5b4636; --cal-card: #d9c9a3; --cal-card-today: #8a5cff; --cal-ring: #9a9a9a;
      --cal-accent: #8a5cff; --font-display: 'Press Start 2P', monospace; --font-body: 'VT323', monospace;
    }
    html[data-theme="hillside"] {
      --cal-plinth: #4a4331; --cal-card: #f3ecd8; --cal-card-today: #cfd8ff; --cal-ring: #c8ccd4;
      --cal-accent: #5578b8; --font-display: 'Cinzel', serif; --font-body: 'EB Garamond', serif;
    }
    html[data-theme="woodland"] {
      --cal-plinth: #c9a875; --cal-card: #fff6e6; --cal-card-today: #ffdca6; --cal-ring: #b98a4a;
      --cal-accent: #d68a1e; --font-display: 'Baloo 2', cursive; --font-body: 'Nunito', sans-serif;
    }

    body {
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      background-color: var(--world-bg);
      font-family: var(--font-body);
      overscroll-behavior: none;
    }

    .canvas-wrapper { width: 100vw; height: 100dvh; user-select: none; position: relative; overflow: hidden; }
    #scene-canvas { display: block; width: 100%; height: 100%; }

    .tutorial-wrapper {
      position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center;
      padding-bottom: 32px; z-index: 10; pointer-events: none;
    }
    .mobile-tutorial {
      text-align: center; background: var(--cal-surface); border-radius: 16px;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--cal-surface-border); padding: 10px 16px; font-size: 14px; color: var(--cal-text);
    }

    #weekNotesModal {
      position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%) translateY(12px);
      width: min(92vw, 420px); background: var(--cal-modal-surface); border: 1px solid var(--cal-modal-border);
      border-radius: 22px; padding: 16px 18px; box-shadow: var(--cal-shadow); z-index: 30;
      opacity: 0; pointer-events: none; transition: opacity 0.22s ease, transform 0.22s ease;
      display: flex; flex-direction: column; gap: 10px; color: var(--cal-modal-text);
    }
    #weekNotesModal.active { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
    .notes-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .notes-title { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 700; font-size: 15px; }
    .notes-tag {
      font-size: 11px; font-weight: 600; background: rgba(60,90,107,0.12); color: var(--cal-accent);
      padding: 2px 7px; border-radius: 9999px;
    }
    .notes-list { flex: 1; overflow-y: auto; max-height: 180px; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
    .notes-list::-webkit-scrollbar { width: 4px; }
    .notes-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 4px; }
    .note-card {
      background: rgba(127,127,127,0.08); border: 1px solid var(--cal-modal-border); border-radius: 10px;
      padding: 8px 12px; font-size: 13px; line-height: 1.4; word-break: break-word;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
    }
    .note-card-content { flex: 1; }
    .note-card .note-time { font-size: 10px; color: var(--cal-text-muted); margin-top: 4px; }
    .note-del-btn {
      background: transparent; border: none; color: var(--cal-text-muted); font-size: 15px; line-height: 1;
      cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: all 0.15s;
    }
    .note-del-btn:hover { color: #ef4444; background: rgba(239,68,68,0.12); }
    .notes-empty { font-size: 12px; color: var(--cal-text-muted); font-style: italic; text-align: center; padding: 12px 0; }
    .notes-input-row { display: flex; gap: 8px; margin-top: 4px; }
    .notes-textarea {
      flex: 1; background: rgba(127,127,127,0.06); border: 1px solid var(--cal-modal-border); border-radius: 12px;
      padding: 8px 12px; font-size: 13px; color: var(--cal-modal-text); resize: none; height: 38px;
      outline: none; font-family: var(--font-body);
    }
    .notes-textarea:focus { border-color: var(--cal-accent); box-shadow: 0 0 0 2px rgba(60,90,107,0.18); }
    .notes-add-btn {
      background: var(--cal-accent); color: white; border: none; border-radius: 12px; padding: 0 14px;
      font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center;
      justify-content: center; transition: opacity 0.15s;
    }
    .notes-add-btn:hover { opacity: 0.9; }
    .notes-add-btn:active { transform: scale(0.96); }
    .notes-close-btn {
      background: transparent; border: none; color: var(--cal-text-muted); font-size: 13px; font-weight: 700;
      cursor: pointer; padding: 2px 6px;
    }
    .notes-collapse-btn {
      background: rgba(127,127,127,0.12); border: none; color: var(--cal-modal-text); font-size: 14px; font-weight: 800;
      cursor: pointer; width: 22px; height: 22px; border-radius: 50%; line-height: 1;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .notes-collapse-btn:hover { background: rgba(127,127,127,0.22); }

    /* Notes/Tasks panels are moveable (drag the header) and collapsible
       (header stays, body hides) rather than fixed in place -- useful for
       keeping them out of the way of the walkable 3D view underneath. */
    .panel-drag-handle { cursor: grab; touch-action: none; }
    .panel-drag-handle:active { cursor: grabbing; }
    .panel-drag-grip { color: var(--cal-text-muted); font-size: 12px; letter-spacing: -2px; margin-right: 2px; }
    .panel-body { display: flex; flex-direction: column; gap: 10px; }
    #weekNotesModal.panel-collapsed .panel-body,
    #dayTasksModal.panel-collapsed .panel-body { display: none; }
    #weekNotesModal.panel-collapsed,
    #dayTasksModal.panel-collapsed { gap: 0; padding-bottom: 10px; }

    /* Task ADHD-support UI: due date, next-step focus, expand-to-see-all,
       study plan entry point. */
    .task-due-row { display: flex; flex-direction: column; gap: 3px; }
    .task-due-row label { font-size: 10.5px; color: var(--cal-text-muted); font-weight: 600; }
    .task-due-input {
      background: rgba(127,127,127,0.06); border: 1px solid var(--cal-modal-border); border-radius: 10px;
      padding: 6px 10px; font-size: 12.5px; color: var(--cal-modal-text); font-family: var(--font-body);
      outline: none; align-self: flex-start;
    }
    .task-due-input:focus { border-color: var(--cal-accent); }
    .task-next-row {
      display: flex; align-items: center; gap: 8px; background: rgba(214,138,30,0.1);
      border: 1px solid var(--cal-modal-border); border-radius: 10px; padding: 7px 10px;
    }
    .task-next-row.task-all-done { justify-content: center; font-size: 12.5px; font-weight: 700; color: var(--cal-accent); background: rgba(60,90,107,0.08); }
    .task-next-label { font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #d68a1e; letter-spacing: 0.04em; flex-shrink: 0; }
    .task-next-text { font-size: 12.5px; flex: 1; line-height: 1.3; }
    .task-focus-btn {
      background: #d68a1e; color: #fff; border: none; border-radius: 8px; padding: 5px 10px;
      font-size: 11px; font-weight: 800; cursor: pointer; flex-shrink: 0; white-space: nowrap;
    }
    .task-focus-btn:hover { opacity: 0.9; }
    .task-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .task-expand-btn, .task-plan-btn {
      background: transparent; border: 1px solid var(--cal-modal-border); color: var(--cal-text-muted);
      border-radius: 8px; padding: 4px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
    }
    .task-expand-btn:hover, .task-plan-btn:hover { color: var(--cal-accent); border-color: var(--cal-accent); }
    .task-step-row.task-step-next { background: rgba(214,138,30,0.08); border-radius: 8px; padding: 3px 6px; margin: -3px -6px; }

    /* Focus session: energy check-in prompt + floating countdown widget +
       a brief reward toast on completion. */
    #focusEnergyPrompt {
      position: absolute; inset: 0; z-index: 70; background: rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
    }
    #focusEnergyPrompt.active { opacity: 1; pointer-events: auto; }
    .focus-energy-card {
      width: min(88vw, 320px); background: var(--cal-modal-surface); border: 1px solid var(--cal-modal-border);
      border-radius: 20px; padding: 20px; box-shadow: var(--cal-shadow); color: var(--cal-modal-text);
      display: flex; flex-direction: column; gap: 10px; text-align: center;
    }
    .focus-energy-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--cal-text-muted); letter-spacing: 0.04em; }
    .focus-energy-task { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
    .focus-energy-question { font-size: 12.5px; color: var(--cal-text-muted); margin-bottom: 4px; }
    .focus-energy-btns { display: flex; flex-direction: column; gap: 8px; }
    .focus-energy-btn {
      border: none; border-radius: 12px; padding: 10px 14px; font-weight: 800; font-size: 13px;
      cursor: pointer; display: flex; align-items: center; justify-content: space-between; color: #fff;
    }
    .focus-energy-btn span { font-size: 11px; font-weight: 700; opacity: 0.85; }
    .focus-energy-btn.full { background: var(--cal-accent); }
    .focus-energy-btn.low { background: #d68a1e; }
    .focus-energy-cancel { background: transparent; border: none; color: var(--cal-text-muted); font-size: 12px; font-weight: 700; cursor: pointer; padding: 4px; margin-top: 2px; }

    #focusTimerWidget {
      position: absolute; left: 14px; bottom: 18px; z-index: 45;
      background: var(--cal-surface); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1.5px solid var(--cal-surface-border); border-radius: 18px; padding: 10px 14px;
      box-shadow: var(--cal-shadow); display: flex; align-items: center; gap: 10px;
      opacity: 0; pointer-events: none; transform: translateY(8px); transition: opacity 0.2s, transform 0.2s;
    }
    #focusTimerWidget.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
    .focus-timer-label { font-size: 11px; font-weight: 700; color: var(--cal-text-muted); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .focus-timer-time { font-size: 18px; font-weight: 800; font-family: var(--font-display); color: var(--cal-accent); font-variant-numeric: tabular-nums; }
    .focus-timer-stop {
      background: rgba(127,127,127,0.15); border: none; color: var(--cal-text); border-radius: 8px;
      padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer;
    }

    #focusRewardToast {
      position: absolute; left: 50%; top: 90px; transform: translateX(-50%) translateY(-10px);
      z-index: 71; background: var(--cal-accent); color: #fff; font-weight: 800; font-size: 13px;
      padding: 10px 20px; border-radius: 9999px; box-shadow: var(--cal-shadow);
      opacity: 0; pointer-events: none; transition: opacity 0.25s ease, transform 0.25s ease;
    }
    #focusRewardToast.active { opacity: 1; transform: translateX(-50%) translateY(0); }

    /* Study plan: a radial timing-only mind map (no task instructions) --
       center node is the submission, branches are day-segments with a
       rough time budget each. */
    #studyPlanOverlay {
      position: absolute; inset: 0; z-index: 65; background: var(--cal-modal-surface);
      opacity: 0; pointer-events: none; transform: translateY(12px);
      transition: opacity 0.22s ease, transform 0.22s ease;
      display: flex; flex-direction: column; color: var(--cal-modal-text);
    }
    #studyPlanOverlay.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
    .study-plan-header-text { display: flex; flex-direction: column; align-items: center; }
    .study-plan-sub { font-size: 11px; color: var(--cal-text-muted); font-weight: 600; }
    /* The mind map used to be the whole screen (flex:1, filling it). Now
       that a written strategies guide sits below it too, the OVERLAY
       scrolls as one column instead -- the map gets a fixed working height
       rather than claiming all remaining space. */
    .study-plan-scroll { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
    #studyPlanCanvas { position: relative; height: 340px; flex-shrink: 0; margin: 20px; }
    .study-plan-lines { position: absolute; inset: 0; width: 100%; height: 100%; }
    .study-plan-center {
      position: absolute; transform: translate(-50%, -50%); width: 132px;
      background: var(--cal-accent); color: #fff; border-radius: 16px; padding: 12px;
      text-align: center; font-weight: 800; font-size: 12.5px; line-height: 1.3; box-shadow: var(--cal-shadow); z-index: 2;
    }
    .study-plan-node {
      position: absolute; transform: translate(-50%, -50%); width: 104px;
      background: var(--cal-modal-surface); border: 1.5px solid var(--cal-modal-border); border-radius: 12px;
      padding: 8px; text-align: center; box-shadow: var(--cal-shadow); z-index: 2;
    }
    .study-plan-node.is-final { border-color: var(--cal-accent); background: rgba(60,90,107,0.1); }
    .study-plan-node-day { font-size: 9.5px; color: var(--cal-text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; }
    .study-plan-node-label { font-size: 11.5px; font-weight: 700; margin: 3px 0; }
    .study-plan-node-minutes { font-size: 11px; color: var(--cal-accent); font-weight: 800; }

    /* Study strategies: short, scannable cards (not paragraphs -- chunked
       info is easier to process) grounding the plan in real teaching-and-
       learning practice: task initiation, timeboxing, stage-matched
       technique, spaced practice, energy-based pacing, chunking/body-
       doubling, and non-punitive framing. */
    .study-plan-strategies { padding: 4px 20px 8px; display: flex; flex-direction: column; gap: 10px; }
    .study-plan-strategies-heading { font-family: var(--font-display); font-weight: 800; font-size: 14px; margin: 4px 0 2px; }
    .strategy-card {
      display: flex; gap: 10px; align-items: flex-start;
      background: var(--cal-surface); border: 1px solid var(--cal-surface-border); border-radius: 14px; padding: 10px 12px;
    }
    .strategy-card-icon { font-size: 19px; line-height: 1.2; flex-shrink: 0; }
    .strategy-card-title { font-weight: 800; font-size: 12.5px; margin-bottom: 2px; }
    .strategy-card-body { font-size: 12px; color: var(--cal-text-muted); line-height: 1.4; }
    .study-plan-back-footer {
      margin: 6px 20px 20px; padding: 12px; border-radius: 14px; border: none;
      background: var(--cal-accent); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer;
    }
    .study-plan-back-footer:hover { opacity: 0.9; }

    #dayTasksModal {
      position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%) translateY(12px);
      width: min(92vw, 420px); background: var(--cal-modal-surface); border: 1px solid var(--cal-modal-border);
      border-radius: 22px; padding: 16px 18px; box-shadow: var(--cal-shadow); z-index: 30;
      opacity: 0; pointer-events: none; transition: opacity 0.22s ease, transform 0.22s ease;
      display: flex; flex-direction: column; gap: 10px; color: var(--cal-modal-text);
    }
    #dayTasksModal.active { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
    #dayTasksModal .notes-list { flex: 1; overflow-y: auto; max-height: 220px; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
    .task-card {
      background: rgba(214, 138, 30, 0.08); border: 1px solid var(--cal-modal-border); border-radius: 12px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
    }
    .task-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .task-card-title { font-size: 13px; font-weight: 700; line-height: 1.35; }
    .task-card-meta { font-size: 11px; color: var(--cal-text-muted); text-transform: capitalize; }
    .task-steps { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
    .task-step-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
    .task-step-row input[type="checkbox"] { accent-color: #d68a1e; width: 15px; height: 15px; cursor: pointer; }
    .task-step-done { text-decoration: line-through; opacity: 0.55; }

    /* Month launcher: one circular button, replacing the always-visible
       month rail, that opens a separate full-window month-grid picker
       (TikTok profile-grid styling) instead of sitting in the 3D view. */
    #monthLauncherBtn {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 28;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 1.5px solid var(--cal-surface-border);
      background: var(--cal-accent);
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      cursor: pointer;
      box-shadow: var(--cal-shadow);
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      user-select: none;
    }
    #monthLauncherBtn:hover { transform: translateY(-50%) scale(1.08); }
    #monthLauncherBtn:active { transform: translateY(-50%) scale(0.94); }
    #monthLauncherBtn .launcher-icon { font-size: 15px; line-height: 1; }
    #monthLauncherBtn .launcher-abbr { font-size: 9px; font-weight: 800; letter-spacing: 0.02em; }

    /* Month grid picker -- a separate full-window overlay, styled after a
       TikTok profile's video grid: bold rounded tiles, a caption chip
       overlaid at the bottom, a small red "pinned"-style badge for the
       month currently showing in the 3D view. */
    #monthGridOverlay {
      position: absolute;
      inset: 0;
      z-index: 60;
      background: var(--cal-modal-surface);
      opacity: 0;
      pointer-events: none;
      transform: translateY(12px);
      transition: opacity 0.22s ease, transform 0.22s ease;
      display: flex;
      flex-direction: column;
      color: var(--cal-modal-text);
    }
    #monthGridOverlay.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
    .month-grid-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 12px 16px;
      border-bottom: 1px solid var(--cal-modal-border);
      flex-shrink: 0;
    }
    .month-grid-back {
      width: 34px; height: 34px; border-radius: 50%;
      border: none; background: rgba(127, 127, 127, 0.12);
      color: var(--cal-modal-text); font-size: 16px; font-weight: 800;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .month-grid-title { font-family: var(--font-display); font-weight: 800; font-size: 16px; letter-spacing: -0.02em; }
    .month-grid-year-row { display: flex; align-items: center; gap: 10px; }
    .month-rail-year-btn {
      background: transparent; border: none; color: var(--cal-text-muted);
      font-size: 13px; cursor: pointer; padding: 4px 6px; border-radius: 6px;
      font-weight: 800; line-height: 1; transition: background 0.15s, color 0.15s;
    }
    .month-rail-year-btn:hover { background: rgba(0, 0, 0, 0.08); color: var(--cal-accent); }
    .month-rail-year-label { font-size: 14px; font-weight: 800; font-family: var(--font-display); color: var(--cal-text); letter-spacing: -0.02em; }
    .month-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
      padding: 3px;
    }
    .month-grid-tile {
      position: relative;
      aspect-ratio: 3 / 4;
      border: none;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: flex-end;
      background: linear-gradient(160deg, var(--tile-a), var(--tile-b));
      transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .month-grid-tile:active { transform: scale(0.96); }
    .month-grid-tile.is-standing-month { outline: 2.5px solid #ffffff; outline-offset: -2.5px; }
    .month-grid-tile-pin {
      position: absolute; top: 6px; left: 6px;
      background: #fe2c55; color: #ffffff; font-size: 9px; font-weight: 800;
      padding: 2px 6px; border-radius: 4px; letter-spacing: 0.02em;
    }
    .month-grid-tile-caption {
      width: 100%; padding: 8px 7px;
      background: linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0));
      display: flex; flex-direction: column; gap: 2px;
    }
    .month-grid-tile-name {
      color: #ffffff; font-family: var(--font-display); font-weight: 800;
      font-size: 13px; letter-spacing: -0.01em; text-shadow: 0 1px 3px rgba(0,0,0,0.4);
    }
    .month-grid-tile-meta {
      color: rgba(255,255,255,0.85); font-size: 10px; font-weight: 600;
      display: flex; align-items: center; gap: 3px;
    }
    @media (max-height: 640px) {
      #monthLauncherBtn { width: 44px; height: 44px; }
    }

  </style>
</head>
<body>

  <div class="canvas-wrapper">
    <canvas id="scene-canvas"></canvas>

    <!-- Month launcher: single button opening a separate month-grid window -->
    <button id="monthLauncherBtn" aria-label="Choose month" type="button">
      <span class="launcher-icon">&#128197;</span>
      <span class="launcher-abbr" id="monthLauncherAbbr">--</span>
    </button>

    <div id="monthGridOverlay" aria-label="Month picker">
      <div class="month-grid-header">
        <button class="month-grid-back" id="monthGridBackBtn" type="button" aria-label="Close">&lt;</button>
        <span class="month-grid-title">Choose a Month</span>
        <div class="month-grid-year-row">
          <button class="month-rail-year-btn" id="prevYearBtn" title="Previous Year" type="button">&lt;</button>
          <span class="month-rail-year-label" id="railYearLabel">2026</span>
          <button class="month-rail-year-btn" id="nextYearBtn" title="Next Year" type="button">&gt;</button>
        </div>
      </div>
      <div class="month-grid" id="monthGrid"></div>
    </div>

    <div id="weekNotesModal">
      <div class="notes-header panel-drag-handle">
        <div class="notes-title"><span class="panel-drag-grip">&#8942;&#8942;</span><span id="notesWeekTitle">Notes</span></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="notes-tag" id="crystalThemeLabel">Amethyst</span>
          <button class="notes-collapse-btn" id="notesCollapseBtn" type="button" aria-label="Collapse">&#8722;</button>
          <button class="notes-close-btn" id="notesCloseBtn" type="button">Close</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="notes-list" id="notesList">
          <div class="notes-empty">No notes for this day yet. Type below to add one.</div>
        </div>
        <div class="notes-input-row">
          <input type="text" id="noteInput" class="notes-textarea" placeholder="Add a note for this day..." autocomplete="off" />
          <button id="addNoteBtn" class="notes-add-btn">Add</button>
        </div>
      </div>
    </div>

    <div id="dayTasksModal">
      <div class="notes-header panel-drag-handle">
        <div class="notes-title"><span class="panel-drag-grip">&#8942;&#8942;</span><span id="tasksDayTitle">Tasks</span></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="notes-collapse-btn" id="tasksCollapseBtn" type="button" aria-label="Collapse">&#8722;</button>
          <button class="notes-close-btn" id="tasksCloseBtn" type="button">Close</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="notes-list" id="tasksList">
          <div class="notes-empty">No tasks for this day yet. Add one below.</div>
        </div>
        <div class="notes-input-row">
          <input type="text" id="taskInput" class="notes-textarea" placeholder="e.g. Essay on the water cycle" autocomplete="off" />
          <button id="addTaskBtn" class="notes-add-btn">Add</button>
        </div>
        <div class="task-due-row">
          <label for="taskDueInput">Due date (optional -- unlocks a study plan)</label>
          <input type="date" id="taskDueInput" class="task-due-input" />
        </div>
      </div>
    </div>

    <!-- Focus session: a short energy check-in before starting a timed chunk -->
    <div id="focusEnergyPrompt">
      <div class="focus-energy-card">
        <div class="focus-energy-title">Focus on:</div>
        <div class="focus-energy-task" id="focusEnergyTaskLabel">--</div>
        <div class="focus-energy-question">How's your energy right now?</div>
        <div class="focus-energy-btns">
          <button id="focusEnergyFullBtn" class="focus-energy-btn full" type="button">Ready to focus<span>20 min</span></button>
          <button id="focusEnergyLowBtn" class="focus-energy-btn low" type="button">Low energy today<span>8 min</span></button>
        </div>
        <button id="focusEnergyCancelBtn" class="focus-energy-cancel" type="button">Cancel</button>
      </div>
    </div>

    <!-- Floating countdown while a focus session is running -->
    <div id="focusTimerWidget">
      <div class="focus-timer-label" id="focusTimerLabel">--</div>
      <div class="focus-timer-time" id="focusTimerTime">0:00</div>
      <button id="focusTimerStopBtn" class="focus-timer-stop" type="button">Stop</button>
    </div>

    <div id="focusRewardToast">
      <span id="focusRewardText">Nice work!</span>
    </div>

    <!-- Study plan: a separate window (opened per-task) mapping WHEN and
         roughly HOW MUCH time to spend across the days before the due
         date -- the mind map itself never says what to actually do, that
         stays in the step list -- plus a general, non-task-specific study
         strategies guide underneath it. -->
    <div id="studyPlanOverlay" aria-label="Study plan">
      <div class="month-grid-header">
        <button class="month-grid-back" id="studyPlanBackBtn" type="button" aria-label="Back to calendar">&lt;</button>
        <div class="study-plan-header-text">
          <span class="month-grid-title" id="studyPlanTitle">Study Plan</span>
          <span class="study-plan-sub" id="studyPlanDue">--</span>
        </div>
        <span style="width:34px;"></span>
      </div>
      <div class="study-plan-scroll">
        <div id="studyPlanCanvas"></div>
        <div class="study-plan-strategies">
          <div class="study-plan-strategies-heading">How to use this plan</div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#128640;</span>
            <div>
              <div class="strategy-card-title">Start tiny, start now</div>
              <div class="strategy-card-body">Commit to just 2 minutes on today's step. Starting is usually the hard part, not finishing -- momentum tends to carry you further once you're actually in it.</div>
            </div>
          </div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#9201;&#65039;</span>
            <div>
              <div class="strategy-card-title">Work in short bursts</div>
              <div class="strategy-card-body">Use the Focus timer for one set stretch, then take a real break -- stand up, stretch, get a drink. Short timed sessions beat trying to power through for hours.</div>
            </div>
          </div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#127919;</span>
            <div>
              <div class="strategy-card-title">Match the effort to the step</div>
              <div class="strategy-card-body">Early steps just need you to begin. Middle steps are the real work -- clear your space, one thing at a time. Final steps are for checking, not creating: read it aloud or explain it to someone.</div>
            </div>
          </div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#128197;</span>
            <div>
              <div class="strategy-card-title">Little and often beats cramming</div>
              <div class="strategy-card-body">Spreading the same work across several days helps it stick better than one long session the night before -- that's why this plan is spread out, not backloaded.</div>
            </div>
          </div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#128267;</span>
            <div>
              <div class="strategy-card-title">Energy changes day to day -- that's normal</div>
              <div class="strategy-card-body">Some days you'll have more focus than others. Use the "low energy" option on the Focus timer instead of skipping the day completely.</div>
            </div>
          </div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#129513;</span>
            <div>
              <div class="strategy-card-title">Stuck? Shrink the step</div>
              <div class="strategy-card-body">If a step feels too big, break it into something you could do in 5 minutes. Studying next to someone else, even on a call, helps a lot too.</div>
            </div>
          </div>
          <div class="strategy-card">
            <span class="strategy-card-icon">&#128156;</span>
            <div>
              <div class="strategy-card-title">Missing a day doesn't break the plan</div>
              <div class="strategy-card-body">If you miss a day, just pick up the next one -- no need to double up or catch up all at once.</div>
            </div>
          </div>
        </div>
        <button class="study-plan-back-footer" id="studyPlanBackFooterBtn" type="button">&lsaquo; Back to Calendar</button>
      </div>
    </div>

    <div id="tutorialWrapper" class="tutorial-wrapper">
      <span class="mobile-tutorial">Up/Down (or W/S) to walk, Left/Right (or A/D) to turn &middot; walk off the far edge to flip the page &middot; double-click character to walk to Today</span>
    </div>
  </div>

  <script>
  (function () {
    'use strict';

    // ------------------------------------------------------------------
    // Constants & date/grid helpers
    // ------------------------------------------------------------------
    const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const CELL = 18;
    const GRID_ROWS = 6;
    const GRID_COLS = 7;
    const GRID_W = GRID_COLS * CELL;
    const GRID_D = GRID_ROWS * CELL;
    const HINGE_Z = GRID_D;
    // CARD_H used to raise date cards 0.35 units above the plinth for visual
    // definition, but that step (plus the near-zero gap between cards) made
    // the avatar's feet visibly clip in and out at every seam while
    // walking a row. Flush with the plinth instead -- flat, not stepped.
    const CARD_W = 16.4, CARD_D_SIZE = 16.4, CARD_H = 0.02;
    const CHARACTER_SPEED = 16;
    const TURN_SPEED = 2.4;
    const TARGET_FPS = 60;
    const EDGE_MARGIN = 3.5;

    const CHARACTER_MODEL_URL = "https://calappv1characters.netlify.app/assets/IdlestanceV1.glb";
    const IDLE_ANIMATION = "Armature|mixamo.com|Layer0.001";
    const WALK_ANIMATION = "Armature|mixamo.com|Layer0";
    const TURN_LEFT_ANIMATION = "mixamo.com";
    const TURN_RIGHT_ANIMATION = "mixamo.com.001";
    const ASSET_BASE = "https://raw.githubusercontent.com/oguzhantufenk/dynamic-terrain-deformation/main/public";

    const STUDENT_ID = ${JSON.stringify(studentId)};
    const STORAGE_KEY = 'calendar_walk_notes_v2_' + (STUDENT_ID || 'guest');
    const TASKS_STORAGE_KEY = 'calendar_walk_tasks_' + (STUDENT_ID || 'guest');
    const TASK_MULTIPLIER_KEY = 'calendar_walk_task_multiplier_' + (STUDENT_ID || 'guest');
    const CURRENT_BG_URL = ${JSON.stringify(currentBgUrl || '')};
    const IS_DARK_MODE = ${JSON.stringify(Boolean(isDarkMode))};

    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);

    function isoKey(d) { return \`\${d.getFullYear()}-\${d.getMonth()}-\${d.getDate()}\`; }
    function isSameDate(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

    // Always a fixed GRID_ROWS x GRID_COLS grid -- exactly like a normal wall
    // calendar pads its first/last week with the adjacent month's days, so
    // every month page is the same physical size and the flip hinge sits at
    // a fixed world position no matter how many real weeks a month spans.
    function buildMonthMatrix(year, month) {
      const first = new Date(year, month, 1);
      const gridStart = addDays(first, -first.getDay());
      const days = [];
      for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) days.push(addDays(gridStart, i));
      return days;
    }

    // The plinth's own color is only ever actually seen as the thin rim
    // beyond the cards (which fully cover the rest of its top face) --
    // now that the lake sits right up against that rim, these read as a
    // damp riverbank ring, not just a seasonal accent. Deep, muddy tones
    // instead of pale pastels so the water's white foam pattern actually
    // shows up against them.
    function seasonTint(monthIndex) {
      if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) return 0x5f7a8c; // wet slate (winter)
      if (monthIndex >= 2 && monthIndex <= 4) return 0x5f8a5f; // mossy bank (spring)
      if (monthIndex >= 5 && monthIndex <= 7) return 0x9c8a4a; // sunbaked mud (summer)
      return 0x8a5f3f; // wet clay (autumn)
    }

    // ------------------------------------------------------------------
    // Per-background theme -- the physical calendar (plinth/card/ring
    // colors, flip style) belongs to whichever world the student picked.
    // ------------------------------------------------------------------
    const MINECRAFT_BG_URL = '/backgrounds/minecraft-scene.png';
    const EYE_BG_URL = '/backgrounds/intro-eye.jpg';
    const SCENE_BG_URL = '/backgrounds/intro-scene.jpg';
    const WOODED_BG_URL = '/backgrounds/wooded-cover-concept.png';

    const CALENDAR_THEMES = {
      minecraft: {
        key: 'minecraft', label: 'Voxel Amethyst',
        plinth: 0x5b4636, card: 0xd9c9a3, cardToday: 0x8a5cff, cardPad: 0xb9a67e, ring: 0x9a9a9a, ringMetal: 0.8, ringRough: 0.5,
        flip: 'snap',
        accent: 0x8a5cff,
      },
      hillside: {
        key: 'hillside', label: 'Silver Bloom',
        plinth: 0x4a4331, card: 0xf3ecd8, cardToday: 0xcfd8ff, cardPad: 0xe1dabf, ring: 0xc8ccd4, ringMetal: 0.9, ringRough: 0.15,
        flip: 'elegant',
        accent: 0xcfd8ff,
      },
      woodland: {
        // Recolored for the woodland intro scene pairing -- a mossy
        // forest-floor palette instead of the previous cream/honey tones,
        // partly so the lake's white foam pattern actually reads against
        // it (pale cream was close enough to white to wash the foam out).
        key: 'woodland', label: 'Misty Woodland',
        // Pre-darkened from the requested #499528 -- the flat top-facing
        // plinth/island surfaces sit under a directional light at ~84%
        // of full strength (close to head-on) plus 0.42 ambient, a
        // combined gain of roughly x1.35 on this material, which was
        // making the raw hex render noticeably lighter on screen than
        // the swatch. This is a computed estimate, not pixel-verified.
        plinth: 0x366e1e, card: 0x9cb87a, cardToday: 0xf0c060, cardPad: 0x7fa05f, ring: 0x6b4f30, ringMetal: 0.2, ringRough: 0.6,
        flip: 'bouncy',
        accent: 0xffb84d,
      },
      default: {
        key: 'default', label: 'Amethyst',
        plinth: 0xa9bcc9, card: 0xf4f2ec, cardToday: 0xbfe0cb, cardPad: 0xdcdfd8, ring: 0x8fae9c, ringMetal: 0.35, ringRough: 0.4,
        flip: 'clean',
        accent: 0x8a5cff,
      },
    };

    function pickThemeKey(bgUrl) {
      if (bgUrl === MINECRAFT_BG_URL) return 'minecraft';
      if (bgUrl === EYE_BG_URL) return 'hillside';
      if (bgUrl === SCENE_BG_URL || bgUrl === WOODED_BG_URL) return 'woodland';
      return 'default';
    }
    const ACTIVE_THEME_KEY = pickThemeKey(CURRENT_BG_URL);
    const ACTIVE_THEME = CALENDAR_THEMES[ACTIVE_THEME_KEY];
    document.documentElement.setAttribute('data-theme', ACTIVE_THEME_KEY);
    document.documentElement.setAttribute('data-mode', IS_DARK_MODE ? 'dark' : 'light');
    const crystalThemeLabelEl = document.getElementById('crystalThemeLabel');
    if (crystalThemeLabelEl) crystalThemeLabelEl.textContent = ACTIVE_THEME.label;

    // ------------------------------------------------------------------
    // Notes storage -- keyed by absolute calendar date (isoKey), not by a
    // scroll-position row. A note belongs to the real date the student was
    // standing on when they wrote it; walking there again from any future
    // month (as a padding day, or the month itself) shows the same note.
    // ------------------------------------------------------------------
    let DAY_NOTES = {};

    function serializeNotesToSentences(dayNotes) {
      const keys = Object.keys(dayNotes).filter((k) => (dayNotes[k] || []).some((n) => n && n.text && n.text.trim()));
      keys.sort();
      const sections = [];
      for (const key of keys) {
        const parts = key.split('-');
        const label = \`\${MONTH_NAMES[Number(parts[1])].slice(0, 3)} \${parts[2]}, \${parts[0]}\`;
        const notes = (dayNotes[key] || []).filter((n) => n && n.text && n.text.trim());
        if (notes.length === 0) continue;
        const sentenceList = notes.map((n) => {
          let clean = n.text.replace(/[{}\\[\\]\\\\"]/g, '').trim();
          clean = clean.replace(/[.!?]+$/, '').trim();
          const timePart = n.time ? ' (at ' + n.time + ')' : '';
          return clean + timePart + '.';
        });
        sections.push('Day of ' + label + ': ' + sentenceList.join(' '));
      }
      return sections.join('\\n');
    }

    // Parses the current per-day format, AND migrates the two older formats
    // this feature has used previously ("Week of A - B: (DAY) text (at t).")
    // so notes saved before this redesign aren't silently lost.
    function parseNotesToMap(rawInput) {
      if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) return {};
      const str = rawInput.trim();

      if (str.startsWith('{') && str.endsWith('}')) {
        try {
          const parsed = JSON.parse(str);
          const res = {};
          for (const k in parsed) {
            const v = parsed[k];
            if (!Array.isArray(v)) continue;
            const key = /^\\d+-\\d+-\\d+$/.test(k) ? k : null;
            if (!key) continue;
            res[key] = v.map((item) => {
              if (typeof item === 'string') return { text: item.trim(), time: '' };
              return { text: String(item.text || '').trim(), time: String(item.time || '') };
            }).filter((item) => item.text);
          }
          return res;
        } catch (e) { /* fall through to text parsing */ }
      }

      const map = {};
      const dayOfMatch = /^Day\\s+of\\s+([A-Za-z]{3})\\s+(\\d+),\\s*(\\d+)[:\\s-]*(.*)/i;
      const weekOfMatch = /^Week\\s+of\\s+([A-Za-z]{3})\\s+(\\d+)\\s*-\\s*[A-Za-z]{3}\\s+\\d+[:\\s-]*(.*)/i;

      const lines = str.split(/\\r?\\n|(?=Day\\s+of\\s+)|(?=Week\\s+of\\s+)/i).map((s) => s.trim()).filter(Boolean);

      for (const line of lines) {
        let content = null;
        let anchorDate = null;

        const dm = line.match(dayOfMatch);
        const wm = line.match(weekOfMatch);
        if (dm) {
          const monthIdx = MONTH_NAMES.findIndex((m) => m.slice(0, 3).toLowerCase() === dm[1].toLowerCase());
          if (monthIdx >= 0) anchorDate = new Date(Number(dm[3]), monthIdx, Number(dm[2]));
          content = dm[4];
        } else if (wm) {
          const monthIdx = MONTH_NAMES.findIndex((m) => m.slice(0, 3).toLowerCase() === wm[1].toLowerCase());
          if (monthIdx >= 0) {
            // Legacy weeks were anchored to "today" at save time, which we
            // no longer know -- approximate using the current year and the
            // nearest occurrence of that month/day to today.
            let guess = new Date(TODAY.getFullYear(), monthIdx, Number(wm[2]));
            if (Math.abs(guess - TODAY) > 200 * 86400000) guess = new Date(TODAY.getFullYear() - 1, monthIdx, Number(wm[2]));
            anchorDate = guess;
          }
          content = wm[3];
        }

        if (!content || !anchorDate) continue;
        content = content.replace(/[{}\\[\\]\\\\"]/g, '').trim();
        const rawSentences = content.split(/(?<=[.!?])\\s+/).map((s) => s.trim()).filter(Boolean);

        let dayOffset = 0;
        for (const raw of rawSentences) {
          let text = raw;
          let time = '';
          let day;

          const dayMatch = text.match(/^\\(([A-Za-z]{3})\\)\\s*/);
          if (dayMatch) {
            const dayIdx = WEEKDAYS.indexOf(dayMatch[1].toUpperCase());
            if (dayIdx >= 0) day = dayIdx;
            text = text.replace(dayMatch[0], '').trim();
          }

          const timeMatch = text.match(/\\((?:at\\s+)?(\\d{1,2}:\\d{2}(?:\\s*[ap]m)?)\\)/i);
          if (timeMatch) {
            time = timeMatch[1];
            text = text.replace(timeMatch[0], '').trim();
          }
          text = text.replace(/[.]+$/, '').trim();
          if (!text) continue;

          const targetDate = (typeof day === 'number')
            ? addDays(addDays(anchorDate, -anchorDate.getDay()), day)
            : anchorDate;
          const key = isoKey(targetDate);
          if (!map[key]) map[key] = [];
          map[key].push({ text, time });
          dayOffset++;
        }
      }
      return map;
    }

    try {
      const initialFromProps = ${JSON.stringify(initialNotesJson)};
      DAY_NOTES = (initialFromProps && initialFromProps.trim() !== '') ? parseNotesToMap(initialFromProps) : {};
      if (!initialFromProps) { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }
    } catch (e) {
      console.warn('Could not parse saved notes', e);
      DAY_NOTES = {};
    }

    const SAMPLE_EVENTS = {};
    [
      [0, 'Chemistry homework due'], [3, 'Field trip: Science Museum'], [7, 'Essay draft due'],
      [11, 'Half day - early dismissal'], [16, 'Maths quiz'], [-5, 'Permission slip due'], [-9, 'Parent-teacher conferences'],
    ].forEach(([offset, text]) => { SAMPLE_EVENTS[isoKey(addDays(TODAY, offset))] = text; });

    // ------------------------------------------------------------------
    // Tasks -- keyed by the same isoKey() dates as notes. A task the
    // student types (rule-based decoder, no AI) gets split into a few
    // sub-steps and a first-pass time estimate, both stored on the task
    // itself so this stays a simple local data structure, not a live
    // computation. Everything here is local-only, same as notes.
    // ------------------------------------------------------------------
    let DAY_TASKS = {};
    try {
      const initialTasksFromProps = ${JSON.stringify(initialTasksJson)};
      DAY_TASKS = (initialTasksFromProps && initialTasksFromProps.trim() !== '') ? JSON.parse(initialTasksFromProps) : {};
    } catch (e) {
      console.warn('Could not parse saved tasks', e);
      DAY_TASKS = {};
    }

    // Rule-based decoder: matches the task text against a small set of
    // task-type keywords and returns that type's standard sub-steps and a
    // base time estimate. Falls back to a generic 3-step breakdown when
    // nothing matches. No AI/model call involved -- plain keyword rules.
    //
    // The FIRST step in every list is deliberately trivial and concrete
    // (open the doc, get the notes out physically in front of you) rather
    // than something like "plan it out", which is itself an executive-
    // function-heavy ask and the exact place task initiation stalls.
    const TASK_CATEGORIES = [
      { key: 'essay', match: /essay|report|coursework|assignment|write.?up/i, baseMinutes: 90,
        steps: ['Open a blank doc and just type the title', 'Write a first draft -- messy is fine', 'Read back through and edit', 'Submit it'] },
      { key: 'revision', match: /revis|exam|test|quiz|mock/i, baseMinutes: 45,
        steps: ['Get your notes out and put them in front of you', 'Make a summary sheet', 'Try a few practice questions', 'Check what you got wrong'] },
      { key: 'reading', match: /read|chapter|book/i, baseMinutes: 30,
        steps: ['Find a quiet spot and open to the right page', 'Read the section', 'Jot down one thing you learned'] },
      { key: 'presentation', match: /presentation|slides|present/i, baseMinutes: 60,
        steps: ['Open a blank slide and write the title', 'Decide the main points', 'Build the slides', 'Practise saying it out loud'] },
      { key: 'project', match: /project|portfolio|build|make\s/i, baseMinutes: 75,
        steps: ['Write down the smallest possible first piece', 'Work on that first piece', "Check progress against what's due", 'Finish and tidy up'] },
      { key: 'general', match: /.*/, baseMinutes: 30,
        steps: ['Open whatever you need and just look at it', 'Work on it', 'Finish and check it over'] },
    ];

    function decodeTask(rawText) {
      const category = TASK_CATEGORIES.find((c) => c.match.test(rawText)) || TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
      return { categoryKey: category.key, baseMinutes: category.baseMinutes, steps: category.steps.slice() };
    }

    // Self-calibrating estimator: rather than one flat global multiplier,
    // track actual logged-vs-estimated minutes PER category (a student
    // might reliably underestimate essays but overestimate reading, so one
    // blended number hides that). Each finished focus session feeds this;
    // future estimates for that category drift toward the student's own
    // real pace instead of staying pinned to the rule-based baseline.
    function loadCategoryStats() {
      try {
        const raw = localStorage.getItem(TASK_MULTIPLIER_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    }
    function saveCategoryStats(stats) {
      try { localStorage.setItem(TASK_MULTIPLIER_KEY, JSON.stringify(stats)); } catch (e) {}
    }
    function getCategoryMultiplier(categoryKey) {
      const stats = loadCategoryStats();
      const s = stats[categoryKey];
      if (s && s.estimatedTotal > 0 && s.loggedTotal > 0) {
        return THREE.MathUtils.clamp(s.loggedTotal / s.estimatedTotal, 0.5, 2.5);
      }
      return 1;
    }
    function recordFocusSessionOutcome(categoryKey, estimatedMinutesForSession, actualMinutes) {
      const stats = loadCategoryStats();
      if (!stats[categoryKey]) stats[categoryKey] = { estimatedTotal: 0, loggedTotal: 0 };
      stats[categoryKey].estimatedTotal += estimatedMinutesForSession;
      stats[categoryKey].loggedTotal += actualMinutes;
      saveCategoryStats(stats);
    }

    function computeTaskStatus(task) {
      const doneCount = task.decodedSteps.filter((s) => s.done).length;
      if (doneCount === 0) return 'not_started';
      if (doneCount === task.decodedSteps.length) return 'done';
      return 'in_progress';
    }

    function createTask(dateKey, rawText, dueDateISO) {
      const decoded = decodeTask(rawText);
      const multiplier = getCategoryMultiplier(decoded.categoryKey);
      const id = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      return {
        id,
        dateISO: dateKey,
        dueDateISO: dueDateISO || null,
        rawText,
        categoryKey: decoded.categoryKey,
        decodedSteps: decoded.steps.map((text, i) => ({ id: id + '_s' + i, text, done: false })),
        estimatedMinutes: Math.round(decoded.baseMinutes * multiplier),
        loggedMinutes: 0,
        status: 'not_started',
      };
    }

    // ------------------------------------------------------------------
    // TEMPORARY TEST INJECTION -- there is no real Classroom-to-DAY_TASKS
    // data pipeline wired up yet (confirmed separately), so this is the
    // only way to actually see the new waypoint pin drop-in animation
    // right now. Delete this whole block once confirmed working; it has
    // nothing to do with the real feature.
    // Note: this task also has a dueDateISO, which means the PRE-EXISTING
    // deadline trail (buildTaskTrails()'s own tube-drawing code, not
    // touched by the pin work) will also glow for it automatically --
    // that's just how the unmodified trail system already behaves for
    // any task with a due date, not something newly added here.
    (function injectTestWaypointTask() {
      const padISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const taskDate = addDays(TODAY, 1);
      const dueDate = addDays(TODAY, 6);
      const testTask = createTask(isoKey(taskDate), 'TEST: sample Classroom brief', padISO(dueDate));
      testTask.waypoints = [
        { dateISO: padISO(addDays(TODAY, 2)), label: 'test waypoint 1' },
        { dateISO: padISO(addDays(TODAY, 4)), label: 'test waypoint 2' },
      ];
      const key = isoKey(taskDate);
      if (!DAY_TASKS[key]) DAY_TASKS[key] = [];
      DAY_TASKS[key].push(testTask);
    })();

    // ------------------------------------------------------------------
    // Renderer / scene / camera / lighting
    // ------------------------------------------------------------------
    const canvas = document.getElementById('scene-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const WORLD_COLOR = IS_DARK_MODE ? '#12171a' : '#dfe4ea';
    scene.background = new THREE.Color(WORLD_COLOR);
    // No fog at all for the woodland theme -- even pushed out
    // further, it was still washing the forest into a pale haze. Other
    // themes keep the original distance fog.
    if (ACTIVE_THEME_KEY !== 'woodland') scene.fog = new THREE.Fog(WORLD_COLOR, 140, 260);

    // Widened FOV and a further-back/higher follow offset than before (was
    // 58deg / (0,34,52)) -- the old framing felt tightly zoomed in on the
    // character, leaving little breathing room around the HUD panels
    // layered on top of the scene.
    // Pulled back further still (was 0,42,66) so more of the calendar is
    // visible around the character, ahead of the GUI redesign.
    const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 500);
    const cameraOffset = new THREE.Vector3(0, 51, 80);
    camera.position.copy(cameraOffset);
    camera.lookAt(0, 6, 40);

    // Zoom in/out (scroll wheel, or pinch on touch) -- scales the camera's
    // distance from the character within clamped bounds. Deliberately
    // just a distance scale, not a free-look orbit: walking still steers
    // where the camera faces, this only pulls it closer or further back.
    let cameraZoom = 1;
    const ZOOM_MIN = 0.55, ZOOM_MAX = 1.8;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cameraZoom = THREE.MathUtils.clamp(cameraZoom + e.deltaY * 0.0012, ZOOM_MIN, ZOOM_MAX);
    }, { passive: false });
    let pinchStartDist = null, pinchStartZoom = 1;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinchStartZoom = cameraZoom;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        cameraZoom = THREE.MathUtils.clamp(pinchStartZoom * (pinchStartDist / dist), ZOOM_MIN, ZOOM_MAX);
      }
    }, { passive: true });
    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinchStartDist = null;
    }, { passive: true });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // The woodland theme runs noticeably dimmer than other themes -- a
    // moodier, more foreboding wood rather than bright daylight.
    const isWoodlandLighting = ACTIVE_THEME_KEY === 'woodland';
    const dirLight = new THREE.DirectionalLight(isWoodlandLighting ? 0xdce8e0 : 0xffffff, isWoodlandLighting ? 1.1 : 2.1);
    dirLight.position.set(24, 46, 18);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, isWoodlandLighting ? 0.42 : 0.75));

    const characterParent = new THREE.Group();
    scene.add(characterParent);

    const DUST_COUNT = 260;
    const DUST_SPREAD = 90;
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * DUST_SPREAD * 2;
      dustPositions[i * 3 + 1] = Math.random() * 22 + 2;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * DUST_SPREAD * 2 + HINGE_Z / 2;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: 0xe7e5e1, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.25, depthWrite: false });
    const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dustPoints);

    // ------------------------------------------------------------------
    // Shared geometry (built once, reused by every month page)
    // ------------------------------------------------------------------
    function roundedRectShape(w, h, r) {
      const shape = new THREE.Shape();
      const x = -w / 2, y = -h / 2;
      shape.moveTo(x + r, y);
      shape.lineTo(x + w - r, y);
      shape.quadraticCurveTo(x + w, y, x + w, y + r);
      shape.lineTo(x + w, y + h - r);
      shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      shape.lineTo(x + r, y + h);
      shape.quadraticCurveTo(x, y + h, x, y + h - r);
      shape.lineTo(x, y + r);
      shape.quadraticCurveTo(x, y, x + r, y);
      return shape;
    }

    let plinthGeoCache = null;
    let PLINTH_TOP_Y = 0;
    function getPlinthGeometry() {
      if (plinthGeoCache) return plinthGeoCache;
      // Was 7 -- that's how wide the dry, unsubmerged rim reads between
      // the tiles and the lake, regardless of how close the water's own
      // waterline gets. Narrower margin, narrower rim, closer-reading
      // shoreline. Keep in sync with getSurfaceHeightAt()'s own margin
      // below, which defines the same footprint for walking.
      const margin = 3;
      const w = GRID_W + margin * 2;
      const d = GRID_D + margin * 2;
      const shape = roundedRectShape(w, d, 6);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 3, curveSegments: 8 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, GRID_D / 2 - CELL / 2);
      geo.computeBoundingBox();
      PLINTH_TOP_Y = geo.boundingBox.max.y;
      plinthGeoCache = geo;
      return geo;
    }
    getPlinthGeometry(); // eager -- PLINTH_TOP_Y must be known before any card/ring is placed

    // Cards sit flat ON TOP of the plinth's actual top surface
    let cardBoxGeoCache = null;
    let CARD_TOP_Y = 0;
    function getCardBoxGeometry() {
      if (cardBoxGeoCache) return cardBoxGeoCache;
      const shape = roundedRectShape(CARD_W, CARD_D_SIZE, 1.6);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: CARD_H, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, PLINTH_TOP_Y, 0);
      geo.computeBoundingBox();
      CARD_TOP_Y = geo.boundingBox.max.y;
      cardBoxGeoCache = geo;
      return geo;
    }
    getCardBoxGeometry(); // eager -- CARD_TOP_Y must be known before tile face meshes

    function getSurfaceHeightAt(x, z) {
      const halfW = CARD_W / 2;
      const halfD = CARD_D_SIZE / 2;
      for (let r = 0; r < GRID_ROWS; r++) {
        const centerZ = r * CELL;
        if (Math.abs(z - centerZ) <= halfD) {
          for (let c = 0; c < GRID_COLS; c++) {
            const centerX = -GRID_W / 2 + (c + 0.5) * CELL;
            if (Math.abs(x - centerX) <= halfW) {
              return CARD_TOP_Y + 0.04;
            }
          }
        }
      }
      const margin = 3; // must match getPlinthGeometry()'s own margin
      const plinthMinX = -GRID_W / 2 - margin;
      const plinthMaxX = GRID_W / 2 + margin;
      const plinthMinZ = -CELL / 2 - margin;
      const plinthMaxZ = HINGE_Z - CELL / 2 + margin;
      if (x >= plinthMinX && x <= plinthMaxX && z >= plinthMinZ && z <= plinthMaxZ) {
        return PLINTH_TOP_Y;
      }
      return 0;
    }

    let ringGeoCache = null;
    function getRingGeometry() {
      if (ringGeoCache) return ringGeoCache;
      ringGeoCache = new THREE.TorusGeometry(2.6, 0.55, 10, 20);
      return ringGeoCache;
    }

    function roundRectCanvas(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawCardFace(ctx, date, isToday, isPadding) {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);

      const monthAbbr = MONTH_NAMES[date.getMonth()].slice(0, 3).toUpperCase();
      const weekdayStr = WEEKDAYS[date.getDay()];
      const dayNum = date.getDate();
      const key = isoKey(date);
      const hasEvent = Boolean(SAMPLE_EVENTS[key]);
      const hasNotes = Boolean((DAY_NOTES[key] || []).length > 0);
      const hasTasks = Boolean((DAY_TASKS[key] || []).length > 0);

      // 1. Draw solid rounded card background for high contrast & crisp visibility
      roundRectCanvas(ctx, 8, 8, w - 16, h - 16, 36);

      if (isToday) {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Top blue banner
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, 0, w, 78);
        ctx.restore();

        // Top banner text
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(weekdayStr, 28, 40);

        ctx.textAlign = 'right';
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.fillText(monthAbbr, w - 28, 40);

        // Huge centered date number
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 148px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#1e3a8a';
        ctx.fillText(String(dayNum), w / 2, h / 2 + 14);

        // Bottom "TODAY" pill
        roundRectCanvas(ctx, w / 2 - 96, h - 80, 192, 48, 24);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TODAY', w / 2, h - 56);

      } else if (!isPadding) {
        // Active month date
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 5;
        ctx.stroke();

        // Top header strip
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, 76);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 76);
        ctx.lineTo(w, 76);
        ctx.stroke();
        ctx.restore();

        // Top header text
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1e293b';
        ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(weekdayStr, 28, 38);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#64748b';
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(monthAbbr, w - 28, 38);

        // Huge centered date number
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 144px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(String(dayNum), w / 2, h / 2 + 14);

        // Bottom date pill e.g. "AUG 15"
        roundRectCanvas(ctx, w / 2 - 90, h - 78, 180, 46, 23);
        ctx.fillStyle = '#f1f5f9';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#334155';
        ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(monthAbbr + ' ' + dayNum, w / 2, h - 55);

      } else {
        // Padding month date (prev or next month)
        ctx.fillStyle = '#f1f5f9';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Top row text
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(weekdayStr, 28, 38);

        ctx.textAlign = 'right';
        ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(monthAbbr, w - 28, 38);

        // Date number
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 134px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(String(dayNum), w / 2, h / 2 + 14);

        // Bottom date pill
        roundRectCanvas(ctx, w / 2 - 86, h - 76, 172, 44, 22);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '800 23px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(monthAbbr + ' ' + dayNum, w / 2, h - 54);
      }

      // Event or notes indicator dot at bottom right
      if (hasEvent || hasNotes) {
        ctx.beginPath();
        ctx.arc(w - 36, h - 55, 12, 0, Math.PI * 2);
        ctx.fillStyle = hasEvent ? '#f59e0b' : '#8b5cf6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }

      // Task indicator dot, bottom-left -- separate from the event/notes
      // dot above so a day with both is still legible at a glance.
      if (hasTasks) {
        ctx.beginPath();
        ctx.arc(36, h - 55, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#d68a1e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
    }

    // ------------------------------------------------------------------
    // Lake -- a stylized, animated water plane surrounding the calendar
    // island. Adapted from thaslle/stylized-water (MIT): a flat plane
    // whose vertex shader bobs it with one sine wave, and whose fragment
    // shader layers two animated simplex-noise fields through smoothstep
    // thresholds to fake toon-style wave lines and foam, plus a radial
    // vignette fading toward a paler "far" color at the shoreline. No
    // textures, no reflection/refraction render pass -- cheap enough for
    // mobile, same reasoning as the crystal materials' pre-baked env map.
    // Built once and added directly to the scene (not per-page): the
    // pages flip above it like a desk calendar, the lake is the still
    // ground underneath and doesn't move with them.
    // ------------------------------------------------------------------
    const WATER_VERTEX_SHADER = \`
      varying vec2 vLocalPos;
      uniform float uTime;
      uniform float uWaveSpeed;
      uniform float uWaveAmplitude;
      uniform float uIslandHalfW;
      uniform float uIslandHalfD;
      uniform float uIslandWobble;
      uniform float uTideSpeed;
      uniform float uShoreSurge;

      // Superellipse core (rounded corners, see the JS islandRadiusAt
      // for the full reasoning) plus one gentle wobble harmonic -- must
      // stay byte-for-byte in sync with the JS version and the other
      // copy of this function below, or the water's shoreline silently
      // drifts from the real island edge again.
      float islandRadiusAt(float theta, float halfW, float halfD) {
        float c = cos(theta), s = sin(theta);
        float n = 2.5;
        float toRounded = 1.0 / pow(pow(abs(c) / halfW, n) + pow(abs(s) / halfD, n), 1.0 / n);
        float wobble = uIslandWobble * 0.6 * (0.5 + 0.5 * cos(3.0 * theta + 0.6));
        return toRounded + wobble;
      }

      void main() {
        // Local (pre-rotation) XY doubles as the water's own flat-plane
        // world offset from the island's center, in real world units --
        // used below so the detail/fade bands stay anchored to the actual
        // shoreline no matter how large this plane is, rather than to an
        // arbitrary 0..1 UV span across the whole thing.
        vLocalPos = position.xy;
        float sineOffset = sin(uTime * uWaveSpeed) * uWaveAmplitude;

        // A real height surge right at the shore, on top of the whole
        // plane's gentle bob -- without this the water's "rise and fall"
        // was only ever a color/pattern effect (the shoreT blend in the
        // fragment shader), never an actual change in the water's own
        // surface height, so it could never visibly wash up over the
        // island's rim the way a real tide does. Peaks at the island's
        // true (wobbly) edge and fades out over the next ~8 units into
        // the lake (was 18 -- on this small an island that was nearly as
        // wide as the whole grass margin, which read as flooding rather
        // than a thin lapping edge), oscillating so it periodically rises
        // high enough to cover the rim (which sits only +0.06 above the
        // still waterline) and recedes again.
        float theta = atan(position.y, position.x);
        float islandR = islandRadiusAt(theta, uIslandHalfW, uIslandHalfD);
        float distPastEdge = length(position.xy) - islandR;
        // abs(), not max(distPastEdge, 0.0) -- the old clamp collapsed
        // every point UNDER the island (distPastEdge negative, which is
        // the entire interior, not just the rim) to shoreProximity 1.0,
        // so the full surge applied across the whole island, not a thin
        // band at the true edge -- periodically flooding most of the
        // island's surface since its grass top sits only +0.35 above
        // resting water level. abs() confines the surge to a band
        // straddling BOTH sides of the real edge.
        float shoreProximity = 1.0 - smoothstep(0.0, 8.0, abs(distPastEdge));
        float surge = shoreProximity * uShoreSurge * (0.5 + 0.5 * sin(uTime * uTideSpeed));

        vec3 modifiedPosition = position;
        modifiedPosition.z += sineOffset + surge;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(modifiedPosition, 1.0);
      }
    \`;
    const WATER_FRAGMENT_SHADER = \`
      varying vec2 vLocalPos;
      uniform float uTime;
      uniform vec3 uColorNear;
      uniform vec3 uColorFar;
      uniform float uRippleScale;
      uniform float uNearRadius;
      uniform float uFarRadius;
      uniform float uTideSpeed;
      uniform float uTideRange;
      uniform float uIslandHalfW;
      uniform float uIslandHalfD;
      uniform float uIslandWobble;

      // Mirrors the JS islandRadiusAt() exactly (uIslandWobble is the
      // same ISLAND_WOBBLE value, passed in rather than duplicated as a
      // literal, so the two can never silently drift out of sync) so the
      // shore the water laps against is the island's true, irregular
      // edge at every angle, not a circle approximating it -- that
      // mismatch was both leaving gaps where the lapping never reached
      // the island's bulges, and overlapping into the meadow elsewhere
      // (which is what the z-fighting "streaking" actually was).
      // Superellipse core (rounded corners, see the JS islandRadiusAt
      // for the full reasoning) plus one gentle wobble harmonic -- must
      // stay byte-for-byte in sync with the JS version and the other
      // copy of this function below, or the water's shoreline silently
      // drifts from the real island edge again.
      float islandRadiusAt(float theta, float halfW, float halfD) {
        float c = cos(theta), s = sin(theta);
        float n = 2.5;
        float toRounded = 1.0 / pow(pow(abs(c) / halfW, n) + pow(abs(s) / halfD, n), 1.0 / n);
        float wobble = uIslandWobble * 0.6 * (0.5 + 0.5 * cos(3.0 * theta + 0.6));
        return toRounded + wobble;
      }

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
        m = m * m; m = m * m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec3 finalColor = uColorNear;
        vec2 p = vLocalPos * uRippleScale;

        float noiseBase = snoise(p * 2.8 + sin(uTime * 0.35));
        noiseBase = noiseBase * 0.5 + 0.5;
        vec3 foam = smoothstep(0.08, 0.001, vec3(noiseBase));
        foam = step(0.5, foam);

        float noiseWaves = snoise(p + sin(uTime * -0.25));
        noiseWaves = noiseWaves * 0.5 + 0.5;
        vec3 colorWaves = vec3(noiseWaves);

        float threshold = 0.6 + 0.01 * sin(uTime * 0.8);
        vec3 waveEffect = 1.0 - (smoothstep(threshold + 0.03, threshold + 0.032, colorWaves) +
                                  smoothstep(threshold, threshold - 0.01, colorWaves));
        waveEffect = step(0.5, waveEffect);

        vec3 combinedEffect = min(waveEffect + foam, 1.0);

        // Detail near the shore, smoothing out toward a calm, pale open
        // stretch further out -- measured as distance PAST the island's
        // own true (wobbly) edge at this exact angle, not a plain radius
        // from center, so it correctly hugs every bulge and cove.
        // uTidePulse rocks that boundary in and out over time, so the
        // detailed/foamy band visibly ebbs and flows against the real
        // island edge rather than just sitting there while its texture
        // drifts.
        float theta = atan(vLocalPos.y, vLocalPos.x);
        float islandR = islandRadiusAt(theta, uIslandHalfW, uIslandHalfD);
        float dist = length(vLocalPos) - islandR;
        float tidePulse = sin(uTime * uTideSpeed) * uTideRange;
        float shoreT = smoothstep(uNearRadius + tidePulse, uFarRadius + tidePulse, dist);
        // combinedEffect/foam are already clean 0-or-1 values (every step
        // above them was a binary step/smoothstep-then-step). Blending
        // them down toward 0.0 by shoreT (a previous version) produced
        // in-between, muddy values right in the near-shore transition --
        // exactly the "mix of colours" instead of a clean white foam
        // line. Left as pure binary and only the base water color (not
        // the foam pattern itself) varies between the near and far tint.
        vec3 baseEffect = vec3(shoreT);
        vec3 baseColor = mix(finalColor, uColorFar, baseEffect);

        finalColor = (1.0 - combinedEffect) * baseColor + combinedEffect;

        vec3 alpha = mix(vec3(0.35), vec3(1.0), foam);
        alpha = mix(alpha, vec3(1.0), shoreT * 0.5 + 0.4);

        // Foam edge line -- replaces the old separate white rim mesh,
        // which was a static approximation of the island's edge (72
        // sampled points, built once) animated afterward with a
        // hand-tuned formula that had to independently guess at matching
        // this shader's own tide math. Any drift between those two
        // separate approximations is exactly what read as "not attached
        // to the actual flowing water". This instead reuses dist (the
        // same true-edge distance already driving shoreT above) and
        // crawls the line onto the island as the tide rises, using the
        // same uTideSpeed phase as the real shore surge -- it cannot
        // visually detach because it's computed from the identical field
        // that positions the real water, not a second approximation of it.
        float edgeTideT = 0.5 + 0.5 * sin(uTime * uTideSpeed);
        float edgeDist = dist + edgeTideT * 6.0;
        float edgeLine = 1.0 - smoothstep(1.2, 2.8, abs(edgeDist));
        finalColor = mix(finalColor, vec3(1.0), edgeLine);
        alpha = mix(alpha, vec3(1.0), edgeLine);

        gl_FragColor = vec4(finalColor, alpha.r);
      }
    \`;

    // ------------------------------------------------------------------
    // Shore rim -- Woodland theme only. The reed/bank/
    // lily-pad system this replaced leaned on the water shader's own
    // noise-based color fade to *imply* a shoreline, which turned out
    // fragile (washed out, hard to read). This is a small, deliberate,
    // always-visible bright ring sitting right at the island's edge --
    // a guaranteed "this is where the water meets the land" cue that
    // doesn't depend on shader tuning, plus a few simple rocks for a bit
    // of the island's character. Cheap: two static meshes.
    // ------------------------------------------------------------------
    // How far the grassy island extends beyond the calendar's own plinth,
    // at minimum, on every side -- the actual edge then wobbles out
    // further than this by up to ISLAND_WOBBLE more (see islandRadiusAt),
    // for an irregular, hand-drawn-looking coastline instead of a plain
    // rounded rectangle, the same way the reference island isn't a clean
    // circle. The wobble only ever adds area, never subtracts, so the
    // calendar grid is always safely inside it at every angle.
    // Tightened (was 22) so the water's edge sits noticeably closer to
    // the calendar itself -- still enough room for the shore rim (3.5
    // thick) plus the shore-surge band (8 units, see WATER_VERTEX_SHADER)
    // to wash in from the true edge without reaching the calendar grid.
    const ISLAND_BASE_MARGIN = 12;
    const ISLAND_WOBBLE = 15;
    // Width of the lake ring between the island's edge and the flat
    // grass skirt. Shared by the water plane and the terrain shading so
    // they agree on where the lake actually ends. Widened twice now (was
    // 42, then 80) so the animated water pushes almost all the way back
    // to the painted backdrop -- a thin rising bank, not a wide flat
    // margin of static grass, between the real water and the image.
    const LAKE_WIDTH = 130;

    // Distance from the island's center to its own (gently rounded) edge
    // at a given angle. The core shape is a superellipse ("squircle")
    // rather than a plain rectangle -- exponent 2.5 sits between a full
    // ellipse (2, no corner feel at all) and a sharp rectangle (infinity),
    // which smoothly rounds the corners while still safely containing
    // the calendar's own rounded-rect footprint (plus ISLAND_BASE_MARGIN)
    // at every angle: a superellipse of any exponent >= 2 only ever
    // bulges outward from that rectangle, touching it exactly at the
    // four axis-aligned points and never dipping inside it elsewhere.
    // A single gentle wobble harmonic (was two, amplitude also reduced)
    // keeps a touch of hand-drawn irregularity without reading as a
    // jagged, busy coastline -- a calmer silhouette better suited to the
    // the woodland theme's gentle, low-sensory-intensity feel.
    function islandRadiusAt(theta, halfW, halfD) {
      const c = Math.cos(theta), s = Math.sin(theta);
      const n = 2.5;
      const toRounded = 1 / Math.pow(Math.pow(Math.abs(c) / halfW, n) + Math.pow(Math.abs(s) / halfD, n), 1 / n);
      const wobble = ISLAND_WOBBLE * 0.6 * (0.5 + 0.5 * Math.cos(3 * theta + 0.6));
      return toRounded + wobble;
    }

    // A 2D outline tracing islandRadiusAt() all the way around -- used
    // for both the island base's own shape and the shore rim's inner
    // edge, so they always match exactly.
    function buildIslandOutline(halfW, halfD, extraRadius) {
      const shape = new THREE.Shape();
      const steps = 72;
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const r = islandRadiusAt(theta, halfW, halfD) + (extraRadius || 0);
        const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
        if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
      }
      return shape;
    }

    // A low, flat grass base wider than the calendar plinth on every
    // side -- sits a little below the plinth's own top, so the plinth
    // visibly rests on top of it rather than the two blending into one
    // shape. Same color as the calendar's own tiles/plinth so the whole
    // island reads as one continuous piece of ground.
    function buildIslandBase(centerZ, plinthColor, waterY, halfW, halfD) {
      const shape = buildIslandOutline(halfW, halfD, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 3, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, centerZ);
      geo.computeBoundingBox();
      const topY = geo.boundingBox.max.y; // the geometry's own baked-in top height, before any mesh offset
      const mat = new THREE.MeshStandardMaterial({ color: plinthColor, roughness: 0.92, metalness: 0.02 });
      const mesh = new THREE.Mesh(geo, mat);
      // Anchored to the water level, not PLINTH_TOP_Y with a guessed
      // offset -- an earlier version landed the island's top *below* the
      // water surface (submerged, so invisible). Lowered from +1.0 to
      // +0.35 -- the gap was too big for the shore surge to ever visibly
      // reach the island's own grass, only the thin rim above it.
      mesh.position.y = waterY + 0.35 - topY;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
    }

    // A static, vertex-colored ring sitting just outside the island's
    // true edge, fading from the island's own grass tone to a sandy
    // beige right at the water -- a believable embankment instead of
    // grass cutting straight to water. Purely a color/geometry addition:
    // no new uniforms, no render-loop hookup, doesn't touch the water
    // shaders or their timing at all. Sloped slightly down toward the
    // water so it reads as a real bank, not a flat painted stripe.
    function buildSandyEmbankment(centerZ, waterY, halfW, halfD) {
      const bandWidth = 6;
      const shape = buildIslandOutline(halfW, halfD, bandWidth);
      shape.holes.push(buildIslandOutline(halfW, halfD, 0));
      // ShapeGeometry (flat), not ExtrudeGeometry -- height is overridden
      // per-vertex below for the slope anyway, so there's no use for an
      // extrusion's top/bottom/side-wall vertices here, just one clean
      // vertex per outline point.
      const geo = new THREE.ShapeGeometry(shape, 1);
      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position;
      const count = pos.count;
      const colors = new Float32Array(count * 3);
      const cGrassEdge = new THREE.Color(0x366e1e); // matches the island base's own (compensated) grass color
      const cSand = new THREE.Color(0xcdab6e);
      const tmp = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const zLocal = pos.getZ(i); // centerZ not yet translated in -- local to island center, same as x
        const theta = Math.atan2(zLocal, x);
        const r = Math.sqrt(x * x + zLocal * zLocal);
        const d = r - islandRadiusAt(theta, halfW, halfD);
        const t = THREE.MathUtils.clamp(d / bandWidth, 0, 1);
        tmp.copy(cGrassEdge).lerp(cSand, t);
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
        // Slight downward slope from near the island's grass height
        // toward the water -- a believable bank rather than a flat shelf.
        pos.setY(i, waterY + 0.32 - 0.24 * t);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geo.translate(0, 0, centerZ);

      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.01 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    function buildShoreRocks(centerZ, waterY, halfW, halfD) {
      // The white "foam edge" ring used to be a separate static mesh
      // here, approximating the island's outline at build time and then
      // animated afterward with a hand-tuned formula that had to
      // independently guess at matching the water shader's own tide
      // math -- any drift between those two separate approximations was
      // exactly what read as "not attached to the actual flowing water".
      // That line is now rendered inside WATER_FRAGMENT_SHADER itself
      // (the edgeLine term), computed from the identical dist/tide field
      // that positions the real water, so it can't detach from it. Only
      // the rocks remain here.
      const rockMat = new THREE.MeshStandardMaterial({ color: 0xb9c2c4, roughness: 0.9, metalness: 0.03 });
      // Several scattered clusters of boulders poking out of the lake,
      // spread around the island at varied angles and distances (some
      // close to shore, some out in open water) rather than the single
      // fixed cluster this used to be -- reads as a natural, rocky lake
      // bed rather than one deliberate landscaping feature.
      const clusterAngles = [0.78 * Math.PI, 0.15 * Math.PI, 1.35 * Math.PI, 1.85 * Math.PI, 1.05 * Math.PI];
      clusterAngles.forEach((angle, ci) => {
        // Alternates near-shore and further-out distances past the
        // island's true edge so clusters don't all line up in one ring.
        const outReach = 6 + (ci % 2 === 0 ? 0 : 22) + Math.random() * 10;
        const baseR = islandRadiusAt(angle, halfW, halfD) + outReach;
        const baseX = Math.cos(angle) * baseR, baseZ = centerZ + Math.sin(angle) * baseR;
        const rockCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < rockCount; i++) {
          const r = 1.6 + Math.random() * 1.8;
          const dx = (Math.random() - 0.5) * 7;
          const dz = (Math.random() - 0.5) * 7;
          const geo = new THREE.IcosahedronGeometry(r, 0);
          const rock = new THREE.Mesh(geo, rockMat);
          rock.position.set(baseX + dx, waterY + r * 0.55, baseZ + dz);
          rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          rock.scale.set(1, 0.75 + Math.random() * 0.2, 1);
          rock.castShadow = true;
          rock.receiveShadow = true;
          scene.add(rock);
        }
      });
    }

    // Simple, cheap low-poly trees (cone + cylinder trunk) forming a
    // ring just beyond the meadow -- not the source scene's full
    // hand-placed forest, but close and dense enough to actually read as
    // "surrounded by woods" from the walking camera, which a sparse ring
    // scattered hundreds of units out (an earlier version) never did.
    // ------------------------------------------------------------------
    // Surrounding terrain -- Woodland theme only. Just
    // the lake basin plus a short flat grass skirt: the avatar never
    // leaves the island, so the old procedural meadow/forest-ridge/600
    // trees it never got near are now a single painted panorama
    // (buildPanoramaBackdrop, below) instead of real geometry. The lake
    // basin itself stays real 3D -- the water shader's shoreline/surge/
    // z-fighting fixes all depend on it.
    // ------------------------------------------------------------------
    function buildSurroundingTerrain(centerZ, waterY, islandHalfW, islandHalfD) {
      const maxWobble = ISLAND_WOBBLE * 0.6; // headroom for the wobble's own max reach (single gentle harmonic now, see islandRadiusAt)
      // How far past the (now much wider) lake the grass skirt reaches
      // before the painted backdrop takes over -- just enough distance
      // to rise as a real embankment (below) and hide the seam behind
      // the backdrop cylinder's wall, not a wide dead zone of flat grass
      // between the animated water and the image.
      const skirtWidth = 16;
      const half = islandHalfW + maxWobble + LAKE_WIDTH + skirtWidth;
      const segments = 110;
      const geo = new THREE.PlaneGeometry(half * 2, half * 2, segments, segments);
      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position;
      const count = pos.count;
      const colors = new Float32Array(count * 3);
      const cUnderwater = new THREE.Color(0x173d2a);
      // Matched to the panorama backdrop's own foreground grass tone, so
      // the real geometry hands off to the painted image without a
      // visible color seam.
      const cSkirt = new THREE.Color(0x6f9c57);
      const tmp = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        // geo.translate(0, 0, centerZ) below hasn't run yet at this point
        // in the loop, so pos.getZ(i) is still geometry-local (centered
        // on the island already, same as x) -- no centerZ offset needed.
        const zLocal = pos.getZ(i);
        const theta = Math.atan2(zLocal, x);
        const r = Math.sqrt(x * x + zLocal * zLocal);
        // Same wobbly boundary as the island base/shore rim -- d is
        // "distance past the island's own irregular edge", not a plain
        // rectangle test, so the lake band actually hugs the coastline's
        // bulges and coves instead of a straight edge.
        const d = r - islandRadiusAt(theta, islandHalfW, islandHalfD);

        let y = waterY;
        if (d < 0) {
          // Under the island base -- hidden, value is irrelevant.
          y = waterY - 1;
          tmp.copy(cUnderwater);
        } else if (d < LAKE_WIDTH) {
          // Lake: dips down right at the shore, rises back up to meet
          // the grass skirt at the lake's outer edge. The -0.2 constant
          // keeps this permanently below the flat water plane even at
          // the two ends of the sine dip (t=0 and t=1, where sin()=0) --
          // without it the lakebed exactly touched the water plane's own
          // height right at those seams, and two coincident surfaces at
          // the same depth is a textbook z-fighting setup -- it's what
          // was actually producing that flickering, wrong-color streak.
          const t = d / LAKE_WIDTH;
          y = waterY - 0.2 - 2.6 * Math.sin(t * Math.PI);
          tmp.copy(cUnderwater);
        } else {
          // Rising embankment out to the backdrop -- a real grassy bank
          // climbing up from the water's edge (was a near-flat 0.15-unit
          // shelf, which read as an abrupt, man-made cutoff rather than
          // land rising naturally out of the lake into the painted hills).
          const t = Math.min(1, (d - LAKE_WIDTH) / skirtWidth);
          y = waterY + 0.85 + 3.5 * Math.sin(t * (Math.PI / 2));
          tmp.copy(cSkirt);
        }

        pos.setY(i, y);
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geo.translate(0, 0, centerZ);

      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03 });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waterMaterial.uniforms.uTime;
        shader.uniforms.uWaterLevel = { value: waterY };
        shader.uniforms.uWaveSpeed = waterMaterial.uniforms.uWaveSpeed;
        shader.uniforms.uWaveAmplitude = waterMaterial.uniforms.uWaveAmplitude;
        shader.uniforms.uFoamDepth = { value: 0.18 };
        // Anchored to begin_vertex (defines the transformed position var,
        // unconditionally present in every material) rather than worldpos_vertex, which
        // is only compiled in when fog/envmap are in play -- this mesh
        // uses neither, so that chunk wouldn't actually be present and
        // the injection would silently do nothing.
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\\nvarying vec3 vTerrainWorldPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', \`#include <common>
            varying vec3 vTerrainWorldPos;
            uniform float uTime, uWaterLevel, uWaveSpeed, uWaveAmplitude, uFoamDepth;
          \`)
          .replace('#include <color_fragment>', \`#include <color_fragment>
            float wetFactor = smoothstep(uWaterLevel + 0.4, uWaterLevel, vTerrainWorldPos.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.75, wetFactor * 0.5);
            float sineOffset = sin(uTime * uWaveSpeed) * uWaveAmplitude;
            float currentWaterHeight = uWaterLevel + sineOffset;
            float stripe = smoothstep(currentWaterHeight + 0.03, currentWaterHeight - 0.03, vTerrainWorldPos.y)
                         - smoothstep(currentWaterHeight + uFoamDepth + 0.03, currentWaterHeight + uFoamDepth - 0.03, vTerrainWorldPos.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), stripe);
          \`);
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.position.y = 0;
      scene.add(mesh);

      return half;
    }

    // ------------------------------------------------------------------
    // Panorama backdrop -- Woodland theme only. A single
    // painted watercolour landscape (public/backgrounds/woodland-panorama.jpg)
    // wrapped around a large open cylinder standing just past the grass
    // skirt, replacing the old procedural meadow/forest/trees entirely --
    // the avatar never leaves the island, so this never needed to be
    // real 3D, just scenery that reads correctly as the camera turns to
    // follow it. BackSide so it renders from inside the cylinder;
    // repeated with mirrored wrapping (rather than stretched once across
    // the full 360 degrees) since one copy of a landscape photo spread
    // that thin would smear into an unreadable band, and mirroring keeps
    // each repeat's seam matched in colour rather than a hard cut.
    // ------------------------------------------------------------------
    function buildPanoramaBackdrop(centerZ, waterY, radius) {
      const height = 170;
      const bottomY = waterY - 6;

      const texture = new THREE.TextureLoader().load('/backgrounds/woodland-panorama.jpg');
      texture.encoding = THREE.sRGBEncoding;
      texture.wrapS = THREE.MirroredRepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(5, 1);

      const wallGeo = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
      const wallMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(0, bottomY + height / 2, centerZ);
      scene.add(wall);

      // Caps the cylinder's open top with the painting's own pale sky
      // tone, so the elevated chase camera never catches a void gap
      // above the backdrop when looking down over its rim.
      const skyGeo = new THREE.CircleGeometry(radius * 1.3, 48);
      const skyMat = new THREE.MeshBasicMaterial({ color: 0xe9eee0, side: THREE.DoubleSide });
      const sky = new THREE.Mesh(skyGeo, skyMat);
      sky.rotation.x = Math.PI / 2;
      sky.position.set(0, bottomY + height - 1, centerZ);
      scene.add(sky);
    }

    let waterMaterial = null;
    let waterBaseY = 0;
    function buildLake() {
      const isWoodland = ACTIVE_THEME_KEY === 'woodland';
      // The island base's own center-to-corner distance (not just the
      // plinth's) now that the island is deliberately bigger than the
      // calendar, so the ripple detail -- and the shore rim, and the
      // terrain's lake dip -- all start right at the island's real edge
      // rather than the plinth's. Padded by the wobble's own max reach
      // so the water's near/far split (radial, angle-blind) never starts
      // inside one of the island's irregular bulges.
      const islandHalfW = isWoodland ? GRID_W / 2 + ISLAND_BASE_MARGIN : GRID_W / 2 + 3;
      const islandHalfD = isWoodland ? GRID_D / 2 + ISLAND_BASE_MARGIN : GRID_D / 2 + 3;
      const islandWobble = isWoodland ? ISLAND_WOBBLE : 0;
      const islandMaxRadius = Math.sqrt(islandHalfW ** 2 + islandHalfD ** 2) + islandWobble * 0.6;
      // uNearRadius/uFarRadius now mean "distance PAST the island's true
      // (per-angle, wobbly) edge" -- the shader itself computes that true
      // edge at every pixel's own angle (islandRadiusAt), rather than
      // this being a plain radius from center. That per-angle awareness
      // is what makes the lapping actually reach the island's bulges
      // (a flat circular radius undershot them) and stops the water
      // plane from overlapping into the meadow past narrower points
      // (which was the real source of the z-fighting streak).
      const nearRadius = -2;
      // Was LAKE_WIDTH-6 (~36 units) -- much wider than the vertex-level
      // surge's own 8-unit reach (below), so the color pattern and the
      // actual physical rise were never showing the same zone at the
      // same time. Tightened to match.
      const farRadius = isWoodland ? 16 : 130;
      // Sized from the island's own max reach, not an arbitrary radius,
      // so it reliably covers the lake at every angle with a little
      // buffer; doesn't need to reach the meadow/forest since the
      // terrain's own rise occludes it there.
      // Smaller buffer than before (was +30) -- since this is a plain
      // square plane but the true lake edge is irregular, any buffer
      // here is how far past the lake the water plane needlessly
      // overlaps the meadow's rising ground at the island's narrower
      // angles, which is real z-fighting risk. The meadow's own raised
      // baseline (above) is the more robust fix; this just minimizes
      // how much overlap remains.
      const size = isWoodland ? (islandMaxRadius + LAKE_WIDTH + 4) * 2 : Math.max(GRID_W, GRID_D) + 900;
      // Woodland needs real vertex density -- the shore surge below is an
      // actual per-vertex height bump that has to trace the island's
      // wobbly coastline smoothly, not the flat 4x4 grid that was fine
      // when the water's only job was a uniform whole-plane bob.
      const waterSegments = isWoodland ? 110 : 4;
      const geo = new THREE.PlaneGeometry(size, size, waterSegments, waterSegments);
      waterMaterial = new THREE.ShaderMaterial({
        vertexShader: WATER_VERTEX_SHADER,
        fragmentShader: WATER_FRAGMENT_SHADER,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          // A mossy, green-leaning river palette rather than a tropical
          // sea blue -- fits a pond in the woodland.
          // Matched to the reference image's soft teal-mint pond, not
          // the earlier muted sage-green.
          uColorNear: { value: new THREE.Color(0x8cd2c3) },
          uColorFar: { value: new THREE.Color(0xb8e8da) },
          uWaveSpeed: { value: 0.5 },
          uWaveAmplitude: { value: 0.18 },
          uRippleScale: { value: 0.05 },
          uNearRadius: { value: nearRadius },
          uFarRadius: { value: farRadius },
          uIslandHalfW: { value: islandHalfW },
          uIslandHalfD: { value: islandHalfD },
          uIslandWobble: { value: islandWobble },
          // How fast (uTideSpeed) and how far (uTideRange, world units)
          // the detailed-water boundary breathes in and out against the
          // island -- the actual "ebb and flow", not just drifting noise.
          // Slowed down considerably (was 1.1) and the range tightened
          // (was 26, comparable to the whole island's own grass margin --
          // far too wide, hence "flows over too much"); now sized to
          // match the vertex surge's own tightened falloff below.
          uTideSpeed: { value: 0.45 },
          uTideRange: { value: 14 },
          // Real vertex-level height surge at the shore (see the vertex
          // shader) -- how far above the still waterline it can rise,
          // enough to clearly exceed the shore rim's own +0.06 height so
          // it's visibly washing up over the island's edge, not just a
          // color change.
          uShoreSurge: { value: isWoodland ? 0.65 : 0 },
        },
      });
      const mesh = new THREE.Mesh(geo, waterMaterial);
      mesh.rotation.x = -Math.PI / 2;
      // Non-woodland themes: close to the plinth's own top surface (still
      // clear of the wave bob's own +-0.12 amplitude) so the water reads
      // as touching the tiles rather than leaving a dry rim visible --
      // there's no island base there, so water sits right at the plinth.
      // Woodland theme: lowered the whole island+calendar relative to the
      // water (was -2.0) -- that much clearance meant the water's rise
      // could never visibly submerge anything at the perimeter, only
      // wash over the thin shore rim far below the island's actual
      // grass. Still clearance for the island base to sit in between,
      // just compressed.
      waterBaseY = isWoodland ? PLINTH_TOP_Y - 1.2 : PLINTH_TOP_Y - 0.2;
      const centerZ = GRID_D / 2 - CELL / 2;
      mesh.position.set(0, waterBaseY, centerZ);
      scene.add(mesh);

      if (isWoodland) {
        // Pre-darkened from the requested #499528 to compensate for the
        // flat top-facing surface's light gain (see the matching comment
        // on CALENDAR_THEMES.woodland.plinth, same reasoning applies here).
        buildIslandBase(centerZ, 0x366e1e, waterBaseY, islandHalfW, islandHalfD);
        buildSandyEmbankment(centerZ, waterBaseY, islandHalfW, islandHalfD);
        buildShoreRocks(centerZ, waterBaseY, islandHalfW, islandHalfD);
        const skirtRadius = buildSurroundingTerrain(centerZ, waterBaseY, islandHalfW, islandHalfD);
        buildPanoramaBackdrop(centerZ, waterBaseY, skirtRadius);
      }
    }
    buildLake();

    // ------------------------------------------------------------------
    // Month pages -- two live at once (current + next/prev, prebuilt just
    // before a flip), both children of "stage".
    // ------------------------------------------------------------------
    const stage = new THREE.Group();
    scene.add(stage);

    function buildMonthPage(year, month) {
      const days = buildMonthMatrix(year, month);
      const group = new THREE.Group();

      // The woodland theme keeps a fixed forest-floor plinth color
      // year-round instead of the seasonal tint -- a consistent Hundred
      // Acre Wood identity (and reliable foam contrast at the shoreline)
      // matters more here than month-to-month variation.
      const plinthColor = ACTIVE_THEME_KEY === 'woodland' ? ACTIVE_THEME.plinth : seasonTint(month);
      const plinthMat = new THREE.MeshStandardMaterial({ color: plinthColor, roughness: 0.9, metalness: 0.03 });
      const plinth = new THREE.Mesh(getPlinthGeometry(), plinthMat);
      plinth.receiveShadow = true;
      group.add(plinth);

      // Binder rings -- removed for the woodland theme (they
      // read as "gold hoops" on the island's calendar, out of place in
      // the scene); other themes keep them.
      if (ACTIVE_THEME_KEY !== 'woodland') {
        const ringMat = new THREE.MeshStandardMaterial({ color: ACTIVE_THEME.ring, roughness: ACTIVE_THEME.ringRough, metalness: ACTIVE_THEME.ringMetal });
        const ringGeo = getRingGeometry();
        const ringCount = 4;
        for (let i = 0; i < ringCount; i++) {
          const ring = new THREE.Mesh(ringGeo, ringMat);
          const x = -GRID_W / 2 + (i + 0.5) * (GRID_W / ringCount);
          ring.position.set(x, CARD_TOP_Y + 1.4, HINGE_Z - CELL / 2 + 1.5);
          ring.rotation.x = Math.PI / 2;
          ring.castShadow = true;
          group.add(ring);
        }
      }

      const cardGeo = getCardBoxGeometry();
      const dayEntries = new Map();

      for (let i = 0; i < days.length; i++) {
        const date = days[i];
        const row = Math.floor(i / GRID_COLS);
        const col = i % GRID_COLS;
        const isPadding = date.getMonth() !== month;
        const key = isoKey(date);
        const isToday = isSameDate(date, TODAY);

        const cardMat = new THREE.MeshStandardMaterial({
          color: isToday ? ACTIVE_THEME.cardToday : (isPadding ? ACTIVE_THEME.cardPad : ACTIVE_THEME.card),
          roughness: 0.55, metalness: 0.02,
        });
        const cardMesh = new THREE.Mesh(cardGeo, cardMat);
        const x = -GRID_W / 2 + (col + 0.5) * CELL;
        const z = row * CELL;
        cardMesh.position.set(x, 0, z);
        cardMesh.castShadow = true;
        cardMesh.receiveShadow = true;
        group.add(cardMesh);

        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = 512; faceCanvas.height = 512;
        const faceCtx = faceCanvas.getContext('2d');
        drawCardFace(faceCtx, date, isToday, isPadding);
        const faceTex = new THREE.CanvasTexture(faceCanvas);
        faceTex.encoding = THREE.sRGBEncoding;
        if (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
          faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true });
        const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 0.96, CARD_D_SIZE * 0.96), faceMat);
        faceMesh.rotation.x = -Math.PI / 2;
        // Was CARD_TOP_Y + 1.08, tuned back when CARD_H made cards ~0.35
        // units tall. Cards are flush with the plinth now, so that fixed
        // offset left the visible day-number face floating well above the
        // ground -- drop it to just clear the card's own surface.
        faceMesh.position.set(x, CARD_TOP_Y + 0.06, z);
        group.add(faceMesh);

        // Holds this tile's Classroom-brief breadcrumb marker, if any --
        // see buildTaskTrails()'s waypoint block below.
        const studyMarkerGroup = new THREE.Group();
        studyMarkerGroup.position.set(x, CARD_TOP_Y + 0.05, z);
        group.add(studyMarkerGroup);

        dayEntries.set(key, { date, row, col, isPadding, studyMarkerGroup });
      }

      return { group, year, month, dayEntries };
    }

    // ------------------------------------------------------------------
    // Breadcrumb waypoints -- dates parsed out of a Classroom brief's own
    // text (see extractDateWaypoints() in classroom-coursework.js), placed
    // on the tile they fall on. Deliberately one plain, generic marker
    // shape reused everywhere: there's no free way to know what a given
    // date in a brief actually represents (a task, a check-in, a
    // presentation), so this doesn't pretend to -- it just turns "there is
    // something at this point in the wall of text" into a visible, walkable
    // stepping stone, breaking one long undifferentiated brief into a
    // sequence of small, already-sized landmarks along the trail.
    // Pin shape + drop-in animation styled after the reference repo's own
    // map-pin markers (codrops/Interactive3DMallMap): a teardrop pin --
    // round head tapering to a point -- that animates in rather than just
    // appearing, mirroring that repo's own .pin__icon transition (starts
    // offset above and invisible, eases in with a slight overshoot-settle,
    // staggered ~0.05s per pin via their :nth-child delays). That repo's
    // actual code is plain CSS/DOM though (no 3D engine at all -- checked
    // its real source directly), so this is a from-scratch Three.js
    // re-creation of the same visual language, not a port of their code.
    // (Their pins also color-code by category -- #7cbf7f/#6584c7/#dc4b7c/
    // #8d65e0 -- deliberately not used yet; that's the "engagement levels"
    // colour work saved for later.)
    let waypointHeadGeoCache = null;
    let waypointTipGeoCache = null;
    function getWaypointHeadGeometry() {
      if (!waypointHeadGeoCache) waypointHeadGeoCache = new THREE.SphereGeometry(0.42, 14, 10);
      return waypointHeadGeoCache;
    }
    function getWaypointTipGeometry() {
      if (!waypointTipGeoCache) waypointTipGeoCache = new THREE.ConeGeometry(0.42, 0.65, 14);
      return waypointTipGeoCache;
    }
    const waypointMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2b705, emissive: 0xf2b705, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.05,
    });

    function buildWaypointPin() {
      const pin = new THREE.Group();
      const head = new THREE.Mesh(getWaypointHeadGeometry(), waypointMaterial);
      head.position.y = 0.65;
      head.castShadow = true;
      pin.add(head);
      // Cone points down by default already (apex at +y, base at -y from
      // its own center) -- rotated 180deg so the point faces the tile,
      // like a map pin's tip.
      const tip = new THREE.Mesh(getWaypointTipGeometry(), waypointMaterial);
      tip.position.y = 0.33;
      tip.rotation.x = Math.PI;
      tip.castShadow = true;
      pin.add(tip);
      return pin;
    }

    // This Group's own fixed design height: tip (y=0) to the top of the
    // head sphere (0.65 + 0.42 radius) = 1.07. Used below to scale the
    // whole pin up to the real avatar's measured leg height rather than a
    // guessed constant -- was reading as near-invisible at this native
    // size against the rest of the scene.
    const PIN_DESIGN_HEIGHT = 1.07;
    // Updated to a real measurement once the character model finishes
    // loading (see the GLTFLoader callback below, which sets this from
    // the actual rig's hip-to-ground distance). This fallback only
    // matters for pins built before that load completes.
    let AVATAR_LEG_HEIGHT = 9;
    function getWaypointPinScale() {
      return AVATAR_LEG_HEIGHT / PIN_DESIGN_HEIGHT;
    }

    // Active drop-in animations, advanced each frame by
    // updateWaypointDropAnimations() (called from the render loop below).
    // Runs on its own performance.now() clock rather than the render
    // loop's elapsedTime variable -- buildTaskTrails() is also called
    // once synchronously at startup, before elapsedTime exists yet (it's
    // declared further down, only meaningful once the render loop is
    // running), so reading it here would throw.
    const WAYPOINT_DROP_DURATION = 0.45; // seconds -- a touch slower than the reference's 0.3s CSS fade, since this is a physical fall, not a flat transition
    const WAYPOINT_DROP_STAGGER = 0.05; // seconds between each pin in the same build pass -- same increment the reference repo's nth-child delays use
    let waypointDropAnimations = [];
    // Fall distance scales with the pin's own (now avatar-matched) size --
    // a fixed fall height read as wrong once the pin itself got much
    // taller, since it'd be falling a shorter distance than its own height.
    function getWaypointDropHeight() {
      return AVATAR_LEG_HEIGHT * 1.5;
    }

    // Mirrors the reference repo's cubic-bezier(0.2,1,0.3,1) -- a fast
    // start that slightly overshoots past rest before settling, reading
    // as a soft "drop and land" rather than a straight fall or hard
    // bounce. Standard ease-out-back formula.
    function easeOutBackWaypoint(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function updateWaypointDropAnimations() {
      if (!waypointDropAnimations.length) return;
      const now = performance.now() / 1000;
      waypointDropAnimations = waypointDropAnimations.filter((anim) => {
        const t = (now - anim.startTime) / WAYPOINT_DROP_DURATION;
        if (t < 0) return true; // still waiting out its stagger delay -- stays hidden (scale 0, set at creation)
        anim.pin.visible = true;
        const eased = easeOutBackWaypoint(Math.min(t, 1));
        const sizeScale = getWaypointPinScale();
        anim.pin.position.y = anim.restY + getWaypointDropHeight() * (1 - eased);
        anim.pin.scale.setScalar(Math.max(0, eased) * sizeScale);
        if (t >= 1) {
          anim.pin.position.y = anim.restY;
          anim.pin.scale.setScalar(sizeScale);
          return false; // done -- drop from the active list
        }
        return true;
      });
    }

    function buildTaskTrails(page) {
      if (!page || !page.dayEntries) return;
      page.dayEntries.forEach((entry) => {
        while (entry.studyMarkerGroup.children.length) {
          const old = entry.studyMarkerGroup.children[0];
          entry.studyMarkerGroup.remove(old);
          // Drop any in-flight drop-in animation still tracking this pin --
          // it's gone from the scene now, nothing left to animate.
          waypointDropAnimations = waypointDropAnimations.filter((a) => a.pin !== old);
        }
      });
      const todayDate = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      const msPerDay = 86400000;
      // Global stagger index across this whole build pass (every task's
      // waypoints together, not reset per-task) -- same as the reference
      // repo's nth-child delay applying across all visible pins at once.
      let waypointBatchIndex = 0;

      Object.keys(DAY_TASKS).forEach((dayKey) => {
        (DAY_TASKS[dayKey] || []).forEach((task) => {
          if (!task.dueDateISO) return;
          const due = new Date(task.dueDateISO + 'T00:00:00');
          const totalDays = Math.round((due - todayDate) / msPerDay);
          if (totalDays < 1) return; // due today or already past -- no forward-looking waypoints to place

          (task.waypoints || []).forEach((wp) => {
            const wpDate = new Date(wp.dateISO + 'T00:00:00');
            // Only ever within [today, the real due date] -- the due date
            // itself is always Classroom's own structured field, never
            // this parsing, so a brief's text mentioning a date past it
            // (a real, messy possibility) just falls out of range here.
            if (wpDate < todayDate || wpDate > due) return;
            // dayEntries is keyed by isoKey()'s own loose "Y-M-D" format
            // (unpadded, 0-indexed month) -- not the zero-padded "YYYY-MM-DD"
            // wp.dateISO comes in as, so look it up via the same helper
            // every other lookup on this map uses, not the raw string.
            const entry = page.dayEntries.get(isoKey(wpDate));
            if (!entry) return;
            const pin = buildWaypointPin();
            pin.position.set(0, 0, 0); // studyMarkerGroup itself already sits at the tile's surface height
            pin.scale.setScalar(0); // starts invisible-small; updateWaypointDropAnimations() animates it in
            pin.visible = false;
            entry.studyMarkerGroup.add(pin);
            waypointDropAnimations.push({
              pin,
              restY: 0,
              startTime: performance.now() / 1000 + waypointBatchIndex * WAYPOINT_DROP_STAGGER,
            });
            waypointBatchIndex++;
          });
        });
      });
    }

    function refreshTaskTrails() {
      buildTaskTrails(currentPage);
      buildTaskTrails(nextPage);
    }

    let currentPage = buildMonthPage(TODAY.getFullYear(), TODAY.getMonth());
    currentPage.group.position.set(0, 0, 0);
    stage.add(currentPage.group);
    buildTaskTrails(currentPage);

    // Land the character on today's actual tile as soon as the 3D view
    // opens, rather than always starting at the grid's fixed origin --
    // "where am I right now" should be true the instant this loads, not
    // something the student has to walk to find (see the double-click-to-
    // walk-to-Today gesture below, which uses this same row/col lookup).
    {
      const todayIdx = buildMonthMatrix(currentPage.year, currentPage.month)
        .findIndex((d) => isSameDate(d, TODAY));
      const todayRow = todayIdx >= 0 ? Math.floor(todayIdx / GRID_COLS) : 0;
      characterParent.position.x = -GRID_W / 2 + (TODAY.getDay() + 0.5) * CELL;
      characterParent.position.z = todayRow * CELL;
    }

    let nextPage = null;
    let flipState = null; // { direction, t, outgoing, incoming }
    const FLIP_DURATION = { snap: 0.55, elegant: 1.05, bouncy: 0.85, clean: 0.7 };
    const FLIP_EASE = {
      snap: (t) => t < 0.7 ? t / 0.7 : 1,
      elegant: (t) => 1 - Math.pow(1 - t, 3),
      bouncy: (t) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
      clean: (t) => t * t * (3 - 2 * t),
    };

    function addMonths(year, month, delta) {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    }

    function jumpToMonth(targetYear, targetMonth, customDirection) {
      if (flipState) return;
      if (currentPage.year === targetYear && currentPage.month === targetMonth) return;

      const currTotal = currentPage.year * 12 + currentPage.month;
      const targetTotal = targetYear * 12 + targetMonth;
      const direction = customDirection !== undefined ? customDirection : (targetTotal > currTotal ? 1 : -1);

      nextPage = buildMonthPage(targetYear, targetMonth);
      buildTaskTrails(nextPage);
      nextPage.group.position.set(0, 0, 0);
      stage.add(nextPage.group);

      const dur = FLIP_DURATION[ACTIVE_THEME.flip] || 0.7;
      flipState = { direction, t: 0, duration: dur };
      spawnFlipFlourish();
      updateMonthLauncher(targetYear, targetMonth);
    }

    function startFlip(direction) {
      if (flipState) return;
      const target = addMonths(currentPage.year, currentPage.month, direction);
      jumpToMonth(target.year, target.month, direction);
    }

    function updateFlip(dt) {
      if (!flipState) return;
      flipState.t = Math.min(1, flipState.t + dt / flipState.duration);
      const ease = FLIP_EASE[ACTIVE_THEME.flip] || FLIP_EASE.clean;
      const k = ease(flipState.t);
      const direction = flipState.direction;

      const pivot = new THREE.Vector3(0, CARD_TOP_Y + 1.4, HINGE_Z - CELL / 2 + 1.5);
      const outAngle = -k * Math.PI * (direction > 0 ? 1 : -1);
      const inAngle = direction > 0 ? (-Math.PI + k * Math.PI) : (Math.PI - k * Math.PI);

      applyHingeRotation(currentPage.group, pivot, outAngle);
      applyHingeRotation(nextPage.group, pivot, inAngle);

      if (flipState.t >= 1) {
        stage.remove(currentPage.group);
        currentPage.group.position.set(0, 0, 0);
        currentPage.group.rotation.set(0, 0, 0);
        currentPage = nextPage;
        nextPage = null;
        flipState = null;
        // Land the character appropriately in the new month
        if (currentPage.year === TODAY.getFullYear() && currentPage.month === TODAY.getMonth()) {
          const days = buildMonthMatrix(currentPage.year, currentPage.month);
          let targetRow = 0;
          for (let i = 0; i < days.length; i++) {
            if (isSameDate(days[i], TODAY)) { targetRow = Math.floor(i / GRID_COLS); break; }
          }
          characterParent.position.x = -GRID_W / 2 + (TODAY.getDay() + 0.5) * CELL;
          characterParent.position.z = targetRow * CELL;
        } else {
          characterParent.position.z = direction > 0 ? boundMinZ + 1 : boundMaxZ - 1;
          characterParent.position.x = THREE.MathUtils.clamp(characterParent.position.x, boundMinX, boundMaxX);
        }
        updateMonthLauncher(currentPage.year, currentPage.month);
        currentDateKey = null;
        updateHudForPosition(characterParent.position.x, characterParent.position.z);
      }
    }

    function applyHingeRotation(group, pivot, angle) {
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      group.updateMatrix();
      const m = new THREE.Matrix4();
      m.makeTranslation(pivot.x, pivot.y, pivot.z);
      const rot = new THREE.Matrix4().makeRotationX(angle);
      const back = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
      m.multiply(rot).multiply(back);
      group.applyMatrix4(m);
    }

    // Small themed particle burst at the flip's midpoint -- the one
    // high-impact moment this design leans on, rather than lots of small
    // scattered micro-interactions elsewhere.
    let flourishPoints = null;
    function spawnFlipFlourish() {
      if (flourishPoints) { scene.remove(flourishPoints); flourishPoints.geometry.dispose(); }
      const count = 90;
      const positions = new Float32Array(count * 3);
      const velocities = [];
      const origin = new THREE.Vector3(0, CARD_TOP_Y + 1.4, HINGE_Z - CELL / 2 + 1.5);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = origin.x + (Math.random() - 0.5) * GRID_W * 0.6;
        positions[i * 3 + 1] = origin.y + Math.random() * 3;
        positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 6;
        velocities.push(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 10 + 4, (Math.random() - 0.5) * 6));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: ACTIVE_THEME.accent, size: 0.9, transparent: true, opacity: 1, depthWrite: false });
      flourishPoints = new THREE.Points(geo, mat);
      flourishPoints.userData.velocities = velocities;
      flourishPoints.userData.age = 0;
      scene.add(flourishPoints);
    }
    function updateFlourish(dt) {
      if (!flourishPoints) return;
      flourishPoints.userData.age += dt;
      const age = flourishPoints.userData.age;
      const pos = flourishPoints.geometry.attributes.position;
      const vels = flourishPoints.userData.velocities;
      for (let i = 0; i < vels.length; i++) {
        vels[i].y -= dt * 14;
        pos.setXYZ(i, pos.getX(i) + vels[i].x * dt, pos.getY(i) + vels[i].y * dt, pos.getZ(i) + vels[i].z * dt);
      }
      pos.needsUpdate = true;
      flourishPoints.material.opacity = Math.max(0, 1 - age / 1.1);
      if (age > 1.1) { scene.remove(flourishPoints); flourishPoints.geometry.dispose(); flourishPoints = null; }
    }

    // ------------------------------------------------------------------
    // Character
    // ------------------------------------------------------------------
    let characterRoot = null, mixer = null;
    const actionsByName = {};
    let currentActionName = null;
    let hipsBone = null, hipsRestPosition = null;

    function switchAnimation(name) {
      if (currentActionName === name) return;
      const prevAction = currentActionName ? actionsByName[currentActionName] : null;
      if (prevAction) prevAction.fadeOut(0.5);
      const nextAction = actionsByName[name];
      if (nextAction) { nextAction.reset().fadeIn(0.4).play(); currentActionName = name; }
    }

    new THREE.GLTFLoader().load(CHARACTER_MODEL_URL, (gltf) => {
      characterRoot = gltf.scene;
      characterRoot.scale.setScalar(11);
      characterRoot.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

      characterParent.add(characterRoot);

      mixer = new THREE.AnimationMixer(characterRoot);
      gltf.animations.forEach((clip) => { actionsByName[clip.name] = mixer.clipAction(clip); });

      hipsBone = characterRoot.getObjectByName('mixamorigHips');
      if (hipsBone) hipsRestPosition = hipsBone.position.clone();

      // This rig's own origin isn't at its feet, so without this the
      // character sinks into the calendar floor by roughly half its
      // height. The naive fix -- Box3().setFromObject(characterRoot) --
      // looks reasonable but is wrong for a *skinned* mesh: three.js builds
      // that box from the mesh's raw bind-pose geometry positions (a tiny,
      // near-origin space skinning deforms away from at render time), not
      // from where the skeleton actually places the rig, so it comes back
      // roughly two orders of magnitude too small and barely nudges the
      // model. The toe-end bones ARE regular scene-graph nodes positioned
      // by the real skeleton pose, so their world Y after scaling is the
      // model's actual lowest point -- shift the root up so that lands at
      // y=0 within characterParent (whose position.y then tracks the
      // surface).
      characterRoot.updateMatrixWorld(true);
      const leftToe = characterRoot.getObjectByName('mixamorigLeftToe_End');
      const rightToe = characterRoot.getObjectByName('mixamorigRightToe_End');
      let groundY = 0;
      if (leftToe && rightToe) {
        const leftToeWorld = new THREE.Vector3();
        const rightToeWorld = new THREE.Vector3();
        leftToe.getWorldPosition(leftToeWorld);
        rightToe.getWorldPosition(rightToeWorld);
        groundY = Math.min(leftToeWorld.y, rightToeWorld.y);
      } else {
        // Fallback for a differently-rigged model with no toe-end bones.
        const footBox = new THREE.Box3().setFromObject(characterRoot);
        groundY = footBox.min.y;
      }
      // Real measured leg height (hips world Y minus the feet's world Y,
      // in the same pre-adjustment reference frame as groundY above, so
      // the delta is correct regardless of the repositioning below) --
      // used to size the Classroom-deadline waypoint pins so they're
      // actually visible against the rest of the scene instead of a
      // guessed constant. Falls back to AVATAR_LEG_HEIGHT's own default
      // if this rig has no hips bone for some reason.
      if (hipsBone) {
        const hipsWorld = new THREE.Vector3();
        hipsBone.getWorldPosition(hipsWorld);
        AVATAR_LEG_HEIGHT = Math.max(3, hipsWorld.y - groundY);
      }

      // The toe-end joint sits inside the foot, not at the sole -- the shoe
      // mesh extends a bit below and around it, so landing the joint
      // exactly on the floor still buries the visible sole. Lift a little
      // further so the sole itself rests on the surface, not sunk into it.
      const FOOT_SOLE_CLEARANCE = 2.0;
      characterRoot.position.y -= groundY - FOOT_SOLE_CLEARANCE;

      characterRoot.updateMatrixWorld(true);
      const initialSurfaceY = getSurfaceHeightAt(characterParent.position.x, characterParent.position.z);
      characterParent.position.y = initialSurfaceY;
      switchAnimation(IDLE_ANIMATION);
    }, undefined, (error) => console.warn('Character model failed to load.', error));

    const listener = new THREE.AudioListener();
    camera.add(listener);
    const footstepSound = new THREE.PositionalAudio(listener);
    footstepSound.setLoop(true);
    footstepSound.setRefDistance(10);
    characterParent.add(footstepSound);
    new THREE.AudioLoader().load(\`\${ASSET_BASE}/audio/snow-step.mp3\`, (buffer) => footstepSound.setBuffer(buffer));

    // Woodland ambience -- hosted in this project's own public/
    // folder (not the third-party ASSET_BASE the footstep sound borrows),
    // since these are specific to this theme. Looping positional audio,
    // same technique as footstepSound above: gentle waves at the pond,
    // songbirds off in the trees. Autoplay attempts right when the clip
    // loads -- browsers may silently block that until a user gesture,
    // which is a harmless, acceptable degradation (opening the 3D view
    // was itself a click, so this usually succeeds in practice).
    if (ACTIVE_THEME_KEY === 'woodland') {
      const pondAudioCenter = new THREE.Object3D();
      pondAudioCenter.position.set(0, 2, GRID_D / 2 - CELL / 2);
      scene.add(pondAudioCenter);
      const wavesSound = new THREE.PositionalAudio(listener);
      wavesSound.setLoop(true);
      wavesSound.setRefDistance(45);
      pondAudioCenter.add(wavesSound);
      new THREE.AudioLoader().load('/audio/pond-waves.mp3', (buffer) => {
        wavesSound.setBuffer(buffer);
        wavesSound.setVolume(0.5);
        wavesSound.play();
      });

      const birdsCenter = new THREE.Object3D();
      birdsCenter.position.set(-GRID_W, 10, GRID_D / 2 - CELL / 2);
      scene.add(birdsCenter);
      const birdsSound = new THREE.PositionalAudio(listener);
      birdsSound.setLoop(true);
      birdsSound.setRefDistance(40);
      birdsCenter.add(birdsSound);
      new THREE.AudioLoader().load('/audio/forest-birds.mp3', (buffer) => {
        birdsSound.setBuffer(buffer);
        birdsSound.setVolume(0.35);
        birdsSound.play();
      });
    }

    // ------------------------------------------------------------------
    // Input, bounded movement, edge-flip trigger
    // ------------------------------------------------------------------
    const movement = { forward: false, backward: false, left: false, right: false };
    let isAutoWalkingToToday = false;

    function triggerWalkToToday() {
      hideTutorial();
      if (currentPage.year !== TODAY.getFullYear() || currentPage.month !== TODAY.getMonth()) {
        stage.remove(currentPage.group);
        currentPage = buildMonthPage(TODAY.getFullYear(), TODAY.getMonth());
        currentPage.group.position.set(0, 0, 0);
        currentPage.group.rotation.set(0, 0, 0);
        stage.add(currentPage.group);
        buildTaskTrails(currentPage);
        updateMonthLauncher(TODAY.getFullYear(), TODAY.getMonth());
      }
      isAutoWalkingToToday = true;
      turnAroundTarget = null;
    }

    function isTypingTarget() {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }
    function setMovementFromKey(key, down) {
      if (isTypingTarget()) return;
      if (down) isAutoWalkingToToday = false;
      switch (key) {
        case 'arrowup': case 'w': movement.forward = down; break;
        case 'arrowdown': case 's': movement.backward = down; break;
        case 'arrowleft': case 'a': movement.left = down; break;
        case 'arrowright': case 'd': movement.right = down; break;
      }
    }
    window.addEventListener('keydown', (e) => { setMovementFromKey(e.key.toLowerCase(), true); hideTutorial(); });
    window.addEventListener('keyup', (e) => setMovementFromKey(e.key.toLowerCase(), false));

    const touchStart = { x: 0, y: 0 };
    window.addEventListener('touchstart', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayTasksModal') || e.target.closest('#dayLabel') || e.target.closest('#monthLauncherBtn') || e.target.closest('#monthGridOverlay') || e.target.closest('#focusEnergyPrompt') || e.target.closest('#focusTimerWidget') || e.target.closest('#studyPlanOverlay') || e.target.closest('#cityLauncherBtn') || e.target.closest('#myCityOverlay')) return;
      const t = e.touches[0]; touchStart.x = t.clientX; touchStart.y = t.clientY; hideTutorial();
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayTasksModal') || e.target.closest('#dayLabel') || e.target.closest('#monthLauncherBtn') || e.target.closest('#monthGridOverlay') || e.target.closest('#focusEnergyPrompt') || e.target.closest('#focusTimerWidget') || e.target.closest('#studyPlanOverlay') || e.target.closest('#cityLauncherBtn') || e.target.closest('#myCityOverlay')) return;
      e.preventDefault();
      isAutoWalkingToToday = false;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      const maxRadius = 50;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxRadius);
      const angle = Math.atan2(dy, dx);
      const jx = (dist / maxRadius) * Math.cos(angle), jy = (dist / maxRadius) * Math.sin(angle);
      movement.left = jx < -0.3; movement.right = jx > 0.3; movement.forward = jy < -0.3; movement.backward = jy > 0.3;
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayTasksModal') || e.target.closest('#dayLabel') || e.target.closest('#monthLauncherBtn') || e.target.closest('#monthGridOverlay') || e.target.closest('#focusEnergyPrompt') || e.target.closest('#focusTimerWidget') || e.target.closest('#studyPlanOverlay') || e.target.closest('#cityLauncherBtn') || e.target.closest('#myCityOverlay')) return;
      movement.left = movement.right = movement.forward = movement.backward = false;
    }, { passive: true });

    const raycaster = new THREE.Raycaster();
    const mousePos = new THREE.Vector2();
    function checkCharacterHit(clientX, clientY) {
      if (!characterRoot) return false;
      mousePos.x = (clientX / window.innerWidth) * 2 - 1;
      mousePos.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mousePos, camera);
      const hits = raycaster.intersectObject(characterRoot, true);
      if (hits && hits.length > 0) return true;
      const charPos = characterParent.position.clone();
      charPos.y += 10;
      charPos.project(camera);
      if (charPos.z < 1) {
        const screenX = ((charPos.x + 1) / 2) * window.innerWidth;
        const screenY = ((-charPos.y + 1) / 2) * window.innerHeight;
        const distPx = Math.hypot(clientX - screenX, clientY - screenY);
        if (distPx < 85) return true;
      }
      return false;
    }
    window.addEventListener('dblclick', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayTasksModal') || e.target.closest('#dayLabel') || e.target.closest('#monthLauncherBtn') || e.target.closest('#monthGridOverlay') || e.target.closest('#focusEnergyPrompt') || e.target.closest('#focusTimerWidget') || e.target.closest('#studyPlanOverlay') || e.target.closest('#cityLauncherBtn') || e.target.closest('#myCityOverlay')) return;
      if (checkCharacterHit(e.clientX, e.clientY)) triggerWalkToToday();
    });

    let lastTouchTapTime = 0, lastTouchTapX = 0, lastTouchTapY = 0;
    window.addEventListener('touchend', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayTasksModal') || e.target.closest('#dayLabel') || e.target.closest('#monthLauncherBtn') || e.target.closest('#monthGridOverlay') || e.target.closest('#focusEnergyPrompt') || e.target.closest('#focusTimerWidget') || e.target.closest('#studyPlanOverlay') || e.target.closest('#cityLauncherBtn') || e.target.closest('#myCityOverlay')) return;
      const now = Date.now();
      const touch = e.changedTouches && e.changedTouches[0];
      if (touch) {
        const timeDelta = now - lastTouchTapTime;
        const dist = Math.hypot(touch.clientX - lastTouchTapX, touch.clientY - lastTouchTapY);
        if (timeDelta > 50 && timeDelta < 380 && dist < 35 && checkCharacterHit(touch.clientX, touch.clientY)) triggerWalkToToday();
        lastTouchTapTime = now; lastTouchTapX = touch.clientX; lastTouchTapY = touch.clientY;
      }
    }, { passive: true });
    window.addEventListener('mousemove', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayTasksModal') || e.target.closest('#dayLabel') || e.target.closest('#monthLauncherBtn') || e.target.closest('#monthGridOverlay') || e.target.closest('#focusEnergyPrompt') || e.target.closest('#focusTimerWidget') || e.target.closest('#studyPlanOverlay') || e.target.closest('#cityLauncherBtn') || e.target.closest('#myCityOverlay')) { canvas.style.cursor = 'default'; return; }
      canvas.style.cursor = checkCharacterHit(e.clientX, e.clientY) ? 'pointer' : 'default';
    });
    function hideTutorial() { const el = document.getElementById('tutorialWrapper'); if (el) el.style.display = 'none'; }

    // ------------------------------------------------------------------
    // Day HUD + notes panel -- bound to whichever day the character
    // currently stands on. No separate day-picker: walking there is how
    // you pick the date.
    // ------------------------------------------------------------------
    const weekNotesModalEl = document.getElementById('weekNotesModal');
    const notesWeekTitleEl = document.getElementById('notesWeekTitle');
    const notesListEl = document.getElementById('notesList');
    const noteInputEl = document.getElementById('noteInput');
    const addNoteBtnEl = document.getElementById('addNoteBtn');
    const notesCloseBtnEl = document.getElementById('notesCloseBtn');
    const dayTasksModalEl = document.getElementById('dayTasksModal');
    const tasksDayTitleEl = document.getElementById('tasksDayTitle');
    const tasksListEl = document.getElementById('tasksList');
    const taskInputEl = document.getElementById('taskInput');
    const taskDueInputEl = document.getElementById('taskDueInput');
    const addTaskBtnEl = document.getElementById('addTaskBtn');
    const tasksCloseBtnEl = document.getElementById('tasksCloseBtn');
    const expandedTaskIds = new Set();

    let currentDateKey = null;
    let currentDate = null;
    let notesOpen = false;
    let tasksOpen = false;

    // Drag (by header) + collapse (header stays, body hides) for the
    // notes/tasks panels, so they can be moved out of the way of the
    // walkable 3D view underneath instead of staying pinned in place.
    function makePanelMoveableAndCollapsible(panelEl, collapseBtnEl) {
      if (!panelEl) return;
      const handle = panelEl.querySelector('.panel-drag-handle');
      if (handle) {
        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;
        handle.addEventListener('pointerdown', (e) => {
          if (e.target.closest('button')) return;
          dragging = true;
          const rect = panelEl.getBoundingClientRect();
          startX = e.clientX; startY = e.clientY;
          startLeft = rect.left; startTop = rect.top;
          panelEl.style.left = startLeft + 'px';
          panelEl.style.top = startTop + 'px';
          panelEl.style.right = 'auto';
          panelEl.style.bottom = 'auto';
          panelEl.style.transform = 'none';
          // The base CSS has a transform/opacity transition for the open/
          // close slide animation -- still active here since we're only
          // overriding the transform value, not the transition itself,
          // which would otherwise make dragging visibly lag the pointer
          // instead of tracking it 1:1.
          panelEl.style.transition = 'none';
          handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          const dx = e.clientX - startX, dy = e.clientY - startY;
          const maxLeft = Math.max(0, window.innerWidth - panelEl.offsetWidth);
          const maxTop = Math.max(0, window.innerHeight - panelEl.offsetHeight);
          panelEl.style.left = THREE.MathUtils.clamp(startLeft + dx, 0, maxLeft) + 'px';
          panelEl.style.top = THREE.MathUtils.clamp(startTop + dy, 0, maxTop) + 'px';
        });
        const endDrag = () => { dragging = false; panelEl.style.transition = ''; };
        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);
      }
      if (collapseBtnEl) {
        collapseBtnEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const collapsed = panelEl.classList.toggle('panel-collapsed');
          collapseBtnEl.innerHTML = collapsed ? '&#43;' : '&#8722;';
          collapseBtnEl.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        });
      }
    }

    function renderNotesFor(key) {
      const notes = DAY_NOTES[key] || [];
      if (notes.length === 0) {
        notesListEl.innerHTML = '<div class="notes-empty">No notes for this day yet. Type below to add one.</div>';
      } else {
        notesListEl.innerHTML = notes.map((item, idx) => \`
          <div class="note-card">
            <div class="note-card-content">
              <div>\${item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              \${item.time ? \`<div class="note-time">\${item.time}</div>\` : ''}
            </div>
            <button class="note-del-btn" onclick="window.deleteNote('\${key}', \${idx})" title="Delete note">&times;</button>
          </div>
        \`).join('');
        notesListEl.scrollTop = notesListEl.scrollHeight;
      }
    }

    // No-op now that the Standing-on panel (and its Notes/Tasks count
    // badges) has been removed -- kept as a function since callers still
    // invoke it after notes/tasks change.
    function refreshHudForCurrentDay() {}

    window.deleteNote = function (key, idx) {
      if (!DAY_NOTES[key]) return;
      DAY_NOTES[key].splice(idx, 1);
      if (DAY_NOTES[key].length === 0) delete DAY_NOTES[key];
      renderNotesFor(key);
      refreshHudForCurrentDay();
      broadcastNotes();
    };

    function broadcastNotes() {
      const sentences = serializeNotesToSentences(DAY_NOTES);
      try {
        if (sentences && sentences.trim()) localStorage.setItem(STORAGE_KEY, sentences);
        else localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      try {
        window.parent.postMessage({ type: 'CALENDAR_WALK_NOTES_UPDATED', studentId: STUDENT_ID, notesFormatted: sentences, notesJson: sentences }, '*');
      } catch (e) {}
    }

    function addNoteForCurrentDay() {
      if (!currentDateKey) return;
      const text = noteInputEl.value.trim();
      if (!text) return;
      if (!DAY_NOTES[currentDateKey]) DAY_NOTES[currentDateKey] = [];
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      DAY_NOTES[currentDateKey].push({ text, time: timeStr });
      noteInputEl.value = '';
      renderNotesFor(currentDateKey);
      refreshHudForCurrentDay();
      broadcastNotes();
    }
    addNoteBtnEl.addEventListener('click', addNoteForCurrentDay);
    noteInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNoteForCurrentDay(); });

    function openNotesPanel() {
      if (!currentDateKey || !currentDate) return;
      notesOpen = true;
      const label = \`\${WEEKDAYS[currentDate.getDay()]}, \${MONTH_NAMES[currentDate.getMonth()].slice(0, 3)} \${currentDate.getDate()}\`;
      notesWeekTitleEl.textContent = label;
      renderNotesFor(currentDateKey);
      weekNotesModalEl.classList.add('active');
    }
    function closeNotesPanel() { notesOpen = false; weekNotesModalEl.classList.remove('active'); }
    notesCloseBtnEl.addEventListener('click', closeNotesPanel);
    makePanelMoveableAndCollapsible(weekNotesModalEl, document.getElementById('notesCollapseBtn'));

    // ------------------------------------------------------------------
    // Tasks panel -- same "bound to whichever day you're standing on"
    // pattern as notes, above.
    // ------------------------------------------------------------------
    function broadcastTasks() {
      const json = JSON.stringify(DAY_TASKS);
      try { localStorage.setItem(TASKS_STORAGE_KEY, json); } catch (e) {}
      try {
        window.parent.postMessage({ type: 'CALENDAR_WALK_TASKS_UPDATED', studentId: STUDENT_ID, tasksJson: json }, '*');
      } catch (e) {}
    }

    function formatShortDate(iso) {
      const d = new Date(iso + 'T00:00:00');
      return MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
    }

    function renderTasksFor(key) {
      const tasks = DAY_TASKS[key] || [];
      if (tasks.length === 0) {
        tasksListEl.innerHTML = '<div class="notes-empty">No tasks for this day yet. Add one below.</div>';
        return;
      }
      tasksListEl.innerHTML = tasks.map((t) => {
        const doneCount = t.decodedSteps.filter((s) => s.done).length;
        const nextStep = t.decodedSteps.find((s) => !s.done);
        const isExpanded = expandedTaskIds.has(t.id);
        // Only the next undone step is called out by default (reduces the
        // "wall of steps" overwhelm); the full list is one tap away behind
        // the expand toggle, not hidden entirely.
        const stepsHtml = t.decodedSteps.map((s) => \`
          <label class="task-step-row\${(nextStep && s.id === nextStep.id) ? ' task-step-next' : ''}">
            <input type="checkbox" \${s.done ? 'checked' : ''} onchange="window.toggleTaskStep('\${key}','\${t.id}','\${s.id}')" />
            <span class="\${s.done ? 'task-step-done' : ''}">\${s.text.replace(/</g, '&lt;')}</span>
          </label>
        \`).join('');
        const nextRowHtml = nextStep
          ? \`<div class="task-next-row">
              <span class="task-next-label">Next</span>
              <span class="task-next-text">\${nextStep.text.replace(/</g, '&lt;')}</span>
              <button class="task-focus-btn" onclick="window.startFocusSession('\${key}','\${t.id}')" type="button">Focus</button>
            </div>\`
          : '<div class="task-next-row task-all-done">All steps done! &#10024;</div>';
        return \`
          <div class="task-card">
            <div class="task-card-header">
              <div class="task-card-title">\${t.rawText.replace(/</g, '&lt;')}</div>
              <button class="note-del-btn" onclick="window.deleteTask('\${key}','\${t.id}')" title="Delete task">&times;</button>
            </div>
            <div class="task-card-meta">~\${t.estimatedMinutes} min &middot; \${doneCount}/\${t.decodedSteps.length} steps\${t.dueDateISO ? ' &middot; due ' + formatShortDate(t.dueDateISO) : ''}</div>
            \${nextRowHtml}
            <div class="task-card-actions">
              \${t.decodedSteps.length > 1 ? \`<button class="task-expand-btn" onclick="window.toggleTaskExpanded('\${t.id}','\${key}')" type="button">\${isExpanded ? 'Hide steps' : 'Show all ' + t.decodedSteps.length + ' steps'}</button>\` : ''}
              \${t.dueDateISO ? \`<button class="task-plan-btn" onclick="window.openStudyPlan('\${key}','\${t.id}')" type="button">Study plan</button>\` : ''}
            </div>
            \${isExpanded ? \`<div class="task-steps">\${stepsHtml}</div>\` : ''}
          </div>
        \`;
      }).join('');
    }

    window.toggleTaskExpanded = function (taskId, key) {
      if (expandedTaskIds.has(taskId)) expandedTaskIds.delete(taskId); else expandedTaskIds.add(taskId);
      renderTasksFor(key);
    };

    window.toggleTaskStep = function (key, taskId, stepId) {
      const list = DAY_TASKS[key] || [];
      const task = list.find((t) => t.id === taskId);
      if (!task) return;
      const step = task.decodedSteps.find((s) => s.id === stepId);
      if (!step) return;
      step.done = !step.done;
      task.status = computeTaskStatus(task);
      renderTasksFor(key);
      broadcastTasks();
    };

    window.deleteTask = function (key, taskId) {
      DAY_TASKS[key] = (DAY_TASKS[key] || []).filter((t) => t.id !== taskId);
      if (DAY_TASKS[key].length === 0) delete DAY_TASKS[key];
      renderTasksFor(key);
      refreshHudForCurrentDay();
      broadcastTasks();
      refreshTaskTrails();
    };

    function addTaskForCurrentDay() {
      if (!currentDateKey) return;
      const text = taskInputEl.value.trim();
      if (!text) return;
      const dueDateISO = taskDueInputEl && taskDueInputEl.value ? taskDueInputEl.value : null;
      if (!DAY_TASKS[currentDateKey]) DAY_TASKS[currentDateKey] = [];
      DAY_TASKS[currentDateKey].push(createTask(currentDateKey, text, dueDateISO));
      taskInputEl.value = '';
      if (taskDueInputEl) taskDueInputEl.value = '';
      renderTasksFor(currentDateKey);
      refreshHudForCurrentDay();
      broadcastTasks();
      refreshTaskTrails();
    }
    addTaskBtnEl.addEventListener('click', addTaskForCurrentDay);
    taskInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTaskForCurrentDay(); });

    function openTasksPanel() {
      if (!currentDateKey || !currentDate) return;
      tasksOpen = true;
      const label = \`\${WEEKDAYS[currentDate.getDay()]}, \${MONTH_NAMES[currentDate.getMonth()].slice(0, 3)} \${currentDate.getDate()}\`;
      tasksDayTitleEl.textContent = label;
      renderTasksFor(currentDateKey);
      dayTasksModalEl.classList.add('active');
    }
    function closeTasksPanel() { tasksOpen = false; dayTasksModalEl.classList.remove('active'); }
    tasksCloseBtnEl.addEventListener('click', closeTasksPanel);
    makePanelMoveableAndCollapsible(dayTasksModalEl, document.getElementById('tasksCollapseBtn'));

    // ------------------------------------------------------------------
    // Focus sessions: a short energy check-in, then a visible countdown
    // timer tied to one task's next step. Completing (or stopping) it logs
    // real minutes against that task's category, which is what lets
    // getCategoryMultiplier() above learn the student's actual pace over
    // time instead of relying purely on the rule-based baseline.
    // ------------------------------------------------------------------
    const FOCUS_FULL_MINUTES = 20;
    const FOCUS_LOW_MINUTES = 8;
    const focusEnergyPromptEl = document.getElementById('focusEnergyPrompt');
    const focusEnergyTaskLabelEl = document.getElementById('focusEnergyTaskLabel');
    const focusTimerEl = document.getElementById('focusTimerWidget');
    const focusTimerLabelEl = document.getElementById('focusTimerLabel');
    const focusTimerTimeEl = document.getElementById('focusTimerTime');
    const focusTimerStopBtnEl = document.getElementById('focusTimerStopBtn');
    const focusRewardToastEl = document.getElementById('focusRewardToast');
    const focusRewardTextEl = document.getElementById('focusRewardText');

    let pendingFocusRequest = null; // { key, taskId }
    let activeFocusSession = null; // { key, taskId, categoryKey, estimatedMinutesForSession, totalSeconds, remainingSeconds, startedAt, intervalId }

    window.startFocusSession = function (key, taskId) {
      const task = (DAY_TASKS[key] || []).find((t) => t.id === taskId);
      if (!task) return;
      pendingFocusRequest = { key, taskId };
      if (focusEnergyTaskLabelEl) focusEnergyTaskLabelEl.textContent = task.rawText;
      if (focusEnergyPromptEl) focusEnergyPromptEl.classList.add('active');
    };

    function cancelFocusPrompt() {
      pendingFocusRequest = null;
      if (focusEnergyPromptEl) focusEnergyPromptEl.classList.remove('active');
    }

    function updateFocusTimerDisplay() {
      if (!activeFocusSession || !focusTimerTimeEl) return;
      const remaining = Math.max(0, activeFocusSession.remainingSeconds);
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      focusTimerTimeEl.textContent = mm + ':' + String(ss).padStart(2, '0');
    }

    function beginFocusCountdown(minutes) {
      if (!pendingFocusRequest) return;
      const { key, taskId } = pendingFocusRequest;
      const task = (DAY_TASKS[key] || []).find((t) => t.id === taskId);
      cancelFocusPrompt();
      if (!task) return;
      if (activeFocusSession) clearInterval(activeFocusSession.intervalId);
      const totalSeconds = Math.round(minutes * 60);
      activeFocusSession = {
        key, taskId, categoryKey: task.categoryKey, estimatedMinutesForSession: minutes,
        totalSeconds, remainingSeconds: totalSeconds, startedAt: Date.now(), intervalId: null,
      };
      if (focusTimerLabelEl) focusTimerLabelEl.textContent = task.rawText.length > 30 ? task.rawText.slice(0, 30) + '...' : task.rawText;
      if (focusTimerEl) focusTimerEl.classList.add('active');
      updateFocusTimerDisplay();
      activeFocusSession.intervalId = setInterval(() => {
        if (!activeFocusSession) return;
        activeFocusSession.remainingSeconds--;
        updateFocusTimerDisplay();
        if (activeFocusSession.remainingSeconds <= 0) completeFocusSession(true);
      }, 1000);
    }

    function showRewardToast(message) {
      if (!focusRewardToastEl) return;
      if (focusRewardTextEl) focusRewardTextEl.textContent = message;
      focusRewardToastEl.classList.add('active');
      setTimeout(() => focusRewardToastEl.classList.remove('active'), 2200);
    }
    function spawnFocusCompleteReward(minutesLogged) {
      showRewardToast('Nice work! ' + minutesLogged + ' min logged.');
    }

    function completeFocusSession(finishedNaturally) {
      const s = activeFocusSession;
      if (!s) return;
      clearInterval(s.intervalId);
      const actualMinutes = Math.max(0.5, Math.round(((Date.now() - s.startedAt) / 60000) * 10) / 10);
      const task = (DAY_TASKS[s.key] || []).find((t) => t.id === s.taskId);
      if (task) {
        task.loggedMinutes = Math.round((task.loggedMinutes || 0) + actualMinutes);
        recordFocusSessionOutcome(s.categoryKey, s.estimatedMinutesForSession, actualMinutes);
        broadcastTasks();
      }
      if (focusTimerEl) focusTimerEl.classList.remove('active');
      activeFocusSession = null;
      if (finishedNaturally) spawnFocusCompleteReward(Math.round(actualMinutes));
      if (currentDateKey === s.key) renderTasksFor(s.key);
    }

    const focusEnergyFullBtnEl = document.getElementById('focusEnergyFullBtn');
    const focusEnergyLowBtnEl = document.getElementById('focusEnergyLowBtn');
    const focusEnergyCancelBtnEl = document.getElementById('focusEnergyCancelBtn');
    if (focusEnergyFullBtnEl) focusEnergyFullBtnEl.addEventListener('click', () => beginFocusCountdown(FOCUS_FULL_MINUTES));
    if (focusEnergyLowBtnEl) focusEnergyLowBtnEl.addEventListener('click', () => beginFocusCountdown(FOCUS_LOW_MINUTES));
    if (focusEnergyCancelBtnEl) focusEnergyCancelBtnEl.addEventListener('click', cancelFocusPrompt);
    if (focusTimerStopBtnEl) focusTimerStopBtnEl.addEventListener('click', () => completeFocusSession(false));

    // ------------------------------------------------------------------
    // Study plan: a per-task, separate full-window mind map that answers
    // WHEN and roughly HOW MUCH time to spend, never HOW to do the work --
    // that stays entirely in the task's own step list. Center node is the
    // task/submission; branches are day-segments between today and the due
    // date, each carrying just a date and a rough minute budget. Time is
    // spread as "little and often" rather than front- or back-loaded, and
    // the final day is always reserved as a light buffer/review block
    // (helpful for exam-style anxiety around a hard deadline).
    // ------------------------------------------------------------------
    const studyPlanOverlayEl = document.getElementById('studyPlanOverlay');
    const studyPlanTitleEl = document.getElementById('studyPlanTitle');
    const studyPlanDueEl = document.getElementById('studyPlanDue');
    const studyPlanCanvasEl = document.getElementById('studyPlanCanvas');
    const studyPlanBackBtnEl = document.getElementById('studyPlanBackBtn');

    // Each decoded step gets its OWN day -- "open a blank doc" on one day,
    // "write a first draft" on another -- rather than an even minutes-per-
    // day split with generic "study session" blocks. Steps spread across
    // the days between today and the due date, with the last step (every
    // category's decoder ends in a finish/submit-style step) always
    // landing exactly on the due date. Per-step minutes are weighted, not
    // split evenly: the first step is deliberately trivial (a task-
    // initiation nudge) and gets a light slice, the last step is a lighter
    // wrap-up too, and the steps in between carry the bulk of the work.
    function buildStudyPlanNodes(task) {
      const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      const due = new Date(task.dueDateISO + 'T00:00:00');
      const msPerDay = 86400000;
      let totalDays = Math.round((due - today) / msPerDay) + 1;
      if (totalDays < 1) totalDays = 1;

      const steps = (task.decodedSteps && task.decodedSteps.length) ? task.decodedSteps : [{ text: 'Work on it' }];
      const stepCount = steps.length;
      const remainingEstimate = Math.max(10, task.estimatedMinutes - (task.loggedMinutes || 0));

      const weights = steps.map((_, i) => {
        if (stepCount === 1) return 1;
        if (i === 0) return 0.5;
        if (i === stepCount - 1) return 0.8;
        return 1.4;
      });
      const weightSum = weights.reduce((a, b) => a + b, 0);

      return steps.map((step, i) => {
        const dateOffset = stepCount === 1
          ? totalDays - 1
          : Math.min(totalDays - 1, Math.round((i * (totalDays - 1)) / (stepCount - 1)));
        const minutes = Math.max(10, Math.round((remainingEstimate * weights[i] / weightSum) / 5) * 5);
        const isFinal = i === stepCount - 1;
        return {
          dateOffset, stepIndex: i, minutes, isFinal,
          label: isFinal ? 'Final review & submit' : 'Study session ' + (i + 1),
        };
      });
    }

    function renderStudyPlan(task) {
      if (studyPlanTitleEl) studyPlanTitleEl.textContent = task.rawText;
      if (studyPlanDueEl) studyPlanDueEl.textContent = 'Due ' + formatShortDate(task.dueDateISO) + ' -- a timing guide only, not instructions';
      if (!studyPlanCanvasEl) return;

      const nodes = buildStudyPlanNodes(task);
      const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      const cx = 50, cy = 50, radius = 36;
      const svgLines = [];
      const nodeHtml = nodes.map((n, i) => {
        const angle = (-Math.PI / 2) + (nodes.length > 1 ? (i / nodes.length) * Math.PI * 2 : 0);
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        svgLines.push('<line x1="' + cx + '%" y1="' + cy + '%" x2="' + x + '%" y2="' + y + '%" stroke="var(--cal-modal-border)" stroke-width="1.5" vector-effect="non-scaling-stroke" />');
        const d = addDays(today, n.dateOffset);
        const dayLabel = WEEKDAYS[d.getDay()].slice(0, 3) + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
        return '<div class="study-plan-node' + (n.isFinal ? ' is-final' : '') + '" style="left:' + x + '%; top:' + y + '%;">' +
          '<div class="study-plan-node-day">' + dayLabel + '</div>' +
          '<div class="study-plan-node-label">' + n.label + '</div>' +
          '<div class="study-plan-node-minutes">~' + n.minutes + ' min</div>' +
        '</div>';
      }).join('');

      studyPlanCanvasEl.innerHTML =
        '<svg class="study-plan-lines" viewBox="0 0 100 100" preserveAspectRatio="none">' + svgLines.join('') + '</svg>' +
        '<div class="study-plan-center" style="left:' + cx + '%; top:' + cy + '%;">' +
          '<div>' + task.rawText.replace(/</g, '&lt;').slice(0, 60) + '</div>' +
        '</div>' +
        nodeHtml;
    }

    window.openStudyPlan = function (key, taskId) {
      const task = (DAY_TASKS[key] || []).find((t) => t.id === taskId);
      if (!task || !task.dueDateISO || !studyPlanOverlayEl) return;
      renderStudyPlan(task);
      studyPlanOverlayEl.classList.add('active');
    };
    function closeStudyPlan() {
      if (studyPlanOverlayEl) studyPlanOverlayEl.classList.remove('active');
    }
    if (studyPlanBackBtnEl) studyPlanBackBtnEl.addEventListener('click', closeStudyPlan);
    const studyPlanBackFooterBtnEl = document.getElementById('studyPlanBackFooterBtn');
    if (studyPlanBackFooterBtnEl) studyPlanBackFooterBtnEl.addEventListener('click', closeStudyPlan);

    // ------------------------------------------------------------------
    // Month picker: one launcher button opens a separate full-window grid
    // (TikTok profile-grid styling) instead of an always-visible in-scene
    // rail. Picking a tile closes the grid and flips to that month in the
    // 3D environment via the existing jumpToMonth transition.
    // ------------------------------------------------------------------
    const monthLauncherBtnEl = document.getElementById('monthLauncherBtn');
    const monthLauncherAbbrEl = document.getElementById('monthLauncherAbbr');
    const monthGridOverlayEl = document.getElementById('monthGridOverlay');
    const monthGridEl = document.getElementById('monthGrid');
    const monthGridBackBtnEl = document.getElementById('monthGridBackBtn');
    const railYearLabelEl = document.getElementById('railYearLabel');
    const prevYearBtnEl = document.getElementById('prevYearBtn');
    const nextYearBtnEl = document.getElementById('nextYearBtn');
    let displayedRailYear = currentPage.year;

    // A distinct gradient per month so tiles read as a real grid of
    // destinations rather than 12 identical cards, without pulling in any
    // per-month imagery.
    const MONTH_TILE_GRADIENTS = [
      ['#3a4a63', '#232c3d'], ['#5a3a63', '#33212e'], ['#3a6355', '#1f3830'],
      ['#63583a', '#3a2f19'], ['#3a5f63', '#1c3336'], ['#553a63', '#2e1e39'],
      ['#63423a', '#3a2016'], ['#3a4763', '#1e2537'], ['#3a6350', '#1a3628'],
      ['#5e633a', '#33361c'], ['#63483a', '#3a271b'], ['#3a5163', '#1c2b37'],
    ];

    function openMonthGrid() {
      if (!monthGridOverlayEl) return;
      displayedRailYear = currentPage.year;
      renderMonthGrid(displayedRailYear, currentPage.month);
      monthGridOverlayEl.classList.add('active');
    }
    function closeMonthGrid() {
      if (monthGridOverlayEl) monthGridOverlayEl.classList.remove('active');
    }

    function renderMonthGrid(year, standingMonth) {
      if (!monthGridEl) return;
      if (railYearLabelEl) railYearLabelEl.textContent = String(year);
      displayedRailYear = year;

      let html = '';
      for (let m = 0; m < 12; m++) {
        const isStandingMonth = (currentPage.year === year && currentPage.month === m);
        const isCurrentTodayMonth = (TODAY.getFullYear() === year && TODAY.getMonth() === m);
        const monthFull = MONTH_NAMES[m];
        const dayCount = new Date(year, m + 1, 0).getDate();
        const [colorA, colorB] = MONTH_TILE_GRADIENTS[m];

        html += '<button class="month-grid-tile' + (isStandingMonth ? ' is-standing-month' : '') + '" style="--tile-a:' + colorA + ';--tile-b:' + colorB + '" data-month="' + m + '" data-year="' + year + '" type="button" title="' + monthFull + ' ' + year + '">' +
          (isCurrentTodayMonth ? '<span class="month-grid-tile-pin">Today</span>' : '') +
          '<span class="month-grid-tile-caption">' +
            '<span class="month-grid-tile-name">' + monthFull + '</span>' +
            '<span class="month-grid-tile-meta">' + dayCount + ' days</span>' +
          '</span>' +
        '</button>';
      }
      monthGridEl.innerHTML = html;

      const tiles = monthGridEl.querySelectorAll('.month-grid-tile');
      tiles.forEach((tile) => {
        tile.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetM = parseInt(tile.getAttribute('data-month'), 10);
          const targetY = parseInt(tile.getAttribute('data-year'), 10);
          closeMonthGrid();
          jumpToMonth(targetY, targetM);
        });
      });
    }

    function updateMonthLauncher(year, month) {
      displayedRailYear = year;
      if (monthLauncherAbbrEl) monthLauncherAbbrEl.textContent = MONTH_NAMES[month].slice(0, 3).toUpperCase();
    }

    if (monthLauncherBtnEl) {
      monthLauncherBtnEl.addEventListener('click', (e) => { e.stopPropagation(); openMonthGrid(); });
    }

    if (monthGridBackBtnEl) {
      monthGridBackBtnEl.addEventListener('click', (e) => { e.stopPropagation(); closeMonthGrid(); });
    }
    if (prevYearBtnEl) {
      prevYearBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        displayedRailYear--;
        renderMonthGrid(displayedRailYear, currentPage.year === displayedRailYear ? currentPage.month : -1);
      });
    }
    if (nextYearBtnEl) {
      nextYearBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        displayedRailYear++;
        renderMonthGrid(displayedRailYear, currentPage.year === displayedRailYear ? currentPage.month : -1);
      });
    }

    updateMonthLauncher(currentPage.year, currentPage.month);

    function updateHudForPosition(x, z) {
      const col = Math.round((x + GRID_W / 2) / CELL - 0.5);
      const row = Math.round(z / CELL);
      const clampedCol = THREE.MathUtils.clamp(col, 0, GRID_COLS - 1);
      const clampedRow = THREE.MathUtils.clamp(row, 0, GRID_ROWS - 1);
      const idx = clampedRow * GRID_COLS + clampedCol;
      const days = buildMonthMatrix(currentPage.year, currentPage.month);
      const date = days[idx] || TODAY;
      const key = isoKey(date);
      if (key === currentDateKey) return;
      currentDateKey = key;
      currentDate = date;
      if (notesOpen) openNotesPanel();
      if (tasksOpen) openTasksPanel();
    }

    // ------------------------------------------------------------------
    // Main loop
    // ------------------------------------------------------------------
    const smoothMovement = new THREE.Vector3();
    const directionVec = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    let currentRotation = 0;
    let turnAroundTarget = null;
    let isMoving = false;
    let lastMovementTime = 0;
    const clock = new THREE.Clock();
    let elapsedTime = 0;
    let lastFrameTimestamp = 0;
    const frameInterval = 1000 / TARGET_FPS;

    const boundMinX = -GRID_W / 2 + EDGE_MARGIN;
    const boundMaxX = GRID_W / 2 - EDGE_MARGIN;
    const boundMinZ = -CELL / 2 + EDGE_MARGIN;
    const boundMaxZ = HINGE_Z - CELL / 2 - EDGE_MARGIN;
    const FLIP_TRIGGER_SLACK = 3.5;

    function update(delta) {
      updateWaypointDropAnimations();
      if (mixer) mixer.update(delta);
      if (hipsBone && hipsRestPosition) hipsBone.position.copy(hipsRestPosition);

      if (flipState) {
        updateFlip(delta);
        updateFlourish(delta);
        camera.position.lerp(cameraOffset.clone().multiplyScalar(cameraZoom).add(new THREE.Vector3(0, 0, HINGE_Z / 2)), 0.04);
        camera.lookAt(0, 6, HINGE_Z / 2);
        renderer.render(scene, camera);
        return;
      }
      updateFlourish(delta);

      if (movement.forward || movement.backward || movement.left || movement.right) isAutoWalkingToToday = false;

      let isCurrentlyMoving = false;

      if (isAutoWalkingToToday) {
        const targetX = -GRID_W / 2 + (TODAY.getDay() + 0.5) * CELL;
        const days = buildMonthMatrix(currentPage.year, currentPage.month);
        let targetRow = 0;
        for (let i = 0; i < days.length; i++) { if (isSameDate(days[i], TODAY)) { targetRow = Math.floor(i / GRID_COLS); break; } }
        const targetZ = targetRow * CELL;
        const dx = targetX - characterParent.position.x, dz = targetZ - characterParent.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.45) {
          const targetAngle = Math.atan2(dx, dz);
          let angleDiff = targetAngle - currentRotation;
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          currentRotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), TURN_SPEED * 2.5 * delta);
          characterParent.rotation.y = currentRotation;
          const moveDist = Math.min(dist, CHARACTER_SPEED * 1.15 * delta);
          characterParent.position.x += Math.sin(currentRotation) * moveDist;
          characterParent.position.z += Math.cos(currentRotation) * moveDist;
          isCurrentlyMoving = true;
          switchAnimation(WALK_ANIMATION);
        } else {
          characterParent.position.x = targetX;
          characterParent.position.z = targetZ;
          let faceDiff = 0 - currentRotation;
          while (faceDiff > Math.PI) faceDiff -= 2 * Math.PI;
          while (faceDiff < -Math.PI) faceDiff += 2 * Math.PI;
          if (Math.abs(faceDiff) > 0.05) {
            currentRotation += Math.sign(faceDiff) * Math.min(Math.abs(faceDiff), TURN_SPEED * 2.5 * delta);
            characterParent.rotation.y = currentRotation;
          } else {
            currentRotation = 0; characterParent.rotation.y = 0; isAutoWalkingToToday = false;
            switchAnimation(IDLE_ANIMATION);
          }
        }
      } else {
        let autoTurning = false;
        if (movement.backward) {
          if (turnAroundTarget === null) turnAroundTarget = currentRotation + Math.PI;
          if (currentRotation < turnAroundTarget) {
            currentRotation = Math.min(turnAroundTarget, currentRotation + TURN_SPEED * delta);
            characterParent.rotation.y = currentRotation;
            autoTurning = true;
          }
        } else turnAroundTarget = null;

        let turnInput = 0;
        if (movement.left) turnInput -= 1;
        if (movement.right) turnInput += 1;
        if (turnInput !== 0 && !autoTurning) { currentRotation += turnInput * TURN_SPEED * delta; characterParent.rotation.y = currentRotation; }

        let moveInput = 0;
        if (movement.forward) moveInput += 1;
        if (movement.backward && !autoTurning) moveInput += 1;
        directionVec.set(Math.sin(currentRotation) * moveInput, 0, Math.cos(currentRotation) * moveInput);
        smoothMovement.lerp(directionVec, 0.05);
        isCurrentlyMoving = smoothMovement.lengthSq() > 0.01;

        if (isCurrentlyMoving) switchAnimation(WALK_ANIMATION);
        else if (autoTurning || turnInput > 0) switchAnimation(TURN_RIGHT_ANIMATION);
        else if (turnInput < 0) switchAnimation(TURN_LEFT_ANIMATION);
        else switchAnimation(IDLE_ANIMATION);

        if (isCurrentlyMoving) {
          const nextX = characterParent.position.x + smoothMovement.x * CHARACTER_SPEED * delta;
          const nextZ = characterParent.position.z + smoothMovement.z * CHARACTER_SPEED * delta;

          if (nextZ > boundMaxZ + FLIP_TRIGGER_SLACK) { startFlip(1); }
          else if (nextZ < boundMinZ - FLIP_TRIGGER_SLACK) { startFlip(-1); }
          else {
            characterParent.position.x = THREE.MathUtils.clamp(nextX, boundMinX, boundMaxX);
            characterParent.position.z = THREE.MathUtils.clamp(nextZ, boundMinZ, boundMaxZ);
          }
        }
      }

      if (isCurrentlyMoving) {
        lastMovementTime = elapsedTime;
        if (!isMoving) { isMoving = true; if (footstepSound.buffer && !footstepSound.isPlaying) footstepSound.play(); }
      } else if (elapsedTime - lastMovementTime > 0.3 && isMoving) {
        isMoving = false;
        if (footstepSound.isPlaying) footstepSound.stop();
      }

      // Smooth surface height stepping (walking on top of flat tiles & background)
      const targetSurfaceY = getSurfaceHeightAt(characterParent.position.x, characterParent.position.z);
      characterParent.position.y = THREE.MathUtils.lerp(characterParent.position.y, targetSurfaceY, Math.min(1, delta * 18));

      cameraTarget.copy(characterParent.position);
      const rotatedOffset = cameraOffset.clone().multiplyScalar(cameraZoom).applyAxisAngle(yAxis, currentRotation);
      const targetCameraPos = characterParent.position.clone().add(rotatedOffset);
      camera.position.lerp(targetCameraPos, 0.06);
      camera.lookAt(cameraTarget.x, cameraTarget.y + 10, cameraTarget.z);

      updateHudForPosition(characterParent.position.x, characterParent.position.z);
      if (waterMaterial) waterMaterial.uniforms.uTime.value = elapsedTime;
      renderer.render(scene, camera);
    }

    function animate(now) {
      requestAnimationFrame(animate);
      if (now - lastFrameTimestamp < frameInterval) return;
      lastFrameTimestamp = now;
      const delta = Math.min(clock.getDelta(), 1 / 15);
      elapsedTime += delta;
      update(delta);
    }
    requestAnimationFrame(animate);
  })();
  </script>
</body>
</html>`;
}

interface CalendarWalkProps {
  isOpen: boolean;
  studentId?: string;
  initialNotes?: string;
  onNotesChange?: (notesJson: string) => void;
  /** JSON-serialized Record<dateKey, TaskEntry[]> -- tasks the student has
   * added to specific calendar dates, each already run through the
   * rule-based decoder and estimator. Local-only, same as notes. */
  initialTasks?: string;
  onTasksChange?: (tasksJson: string) => void;
  /** Which theme background is currently active -- picks the calendar's physical
   * shell (plinth/card/ring colors, fonts, flip character) so it matches whatever
   * the student already chose elsewhere rather than being a separate setting.
   * Falls back to a neutral default look if omitted. */
  currentBgUrl?: string;
  /** Mirrors the app's global dark-mode toggle for the notes/HUD chrome. */
  isDarkMode?: boolean;
  key?: React.Key;
}

export default function CalendarWalk({
  isOpen,
  studentId = '',
  initialNotes = '{}',
  onNotesChange,
  initialTasks = '{}',
  onTasksChange,
  currentBgUrl = '',
  isDarkMode = false,
}: CalendarWalkProps) {
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      if (event.data.type === 'CALENDAR_WALK_NOTES_UPDATED') {
        if (onNotesChange) {
          onNotesChange(event.data.notesJson);
        }
      } else if (event.data.type === 'CALENDAR_WALK_TASKS_UPDATED') {
        if (onTasksChange) {
          onTasksChange(event.data.tasksJson);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNotesChange, onTasksChange]);

  // Keep the initial html stable for the duration of this open walk session
  // (App.tsx provides key={isOpen + '_' + studentId} so when reopened fresh it initializes anew)
  const [stableHtml] = React.useState(() => {
    return getCalendarWalkHtml(initialNotes, studentId, currentBgUrl, isDarkMode, initialTasks);
  });

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-20 bg-transparent pointer-events-auto flex flex-col rounded-[3rem] overflow-hidden transition-all duration-300">
      <iframe
        title="Walk Across Your Calendar"
        srcDoc={stableHtml}
        className="w-full h-full border-0 bg-transparent relative z-20 pointer-events-auto"
      />
    </div>
  );
}
