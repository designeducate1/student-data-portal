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
// the character continues walking onto day 1 of the new month. Notes and
// their reward crystals are now tied directly to the real calendar date the
// student is standing on when they add them (no separate day-picker, no
// "week gap" tile) -- walking IS how you pick the date.
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
    html[data-theme="lotr"] {
      --cal-plinth: #4a4331; --cal-card: #f3ecd8; --cal-card-today: #cfd8ff; --cal-ring: #c8ccd4;
      --cal-accent: #5578b8; --font-display: 'Cinzel', serif; --font-body: 'EB Garamond', serif;
    }
    html[data-theme="pooh"] {
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

    #dayLabel {
      position: absolute; top: 18px; left: 50%; transform: translateX(-50%); z-index: 25;
      width: min(92vw, 560px); background: var(--cal-surface);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1.5px solid var(--cal-surface-border); border-radius: 20px; padding: 14px 22px;
      box-shadow: var(--cal-shadow); pointer-events: auto; cursor: default;
      transition: background 0.2s ease, box-shadow 0.2s ease; display: flex; flex-direction: column; gap: 8px;
    }
    .hud-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .hud-date-row { display: flex; align-items: baseline; gap: 8px; font-family: var(--font-display); }
    .hud-date-row span:first-child { font-size: 12px; color: var(--cal-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    #dayValue { font-size: 18px; font-weight: 700; color: var(--cal-text); }
    .hud-badge {
      font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px;
      background: rgba(60, 90, 107, 0.12); color: var(--cal-accent); white-space: nowrap;
    }
    .hud-badge.today { background: var(--cal-accent); color: #fff; }
    .hud-badge.pad { background: rgba(0,0,0,0.08); color: var(--cal-text-muted); }
    .hud-task-row { font-size: 13px; color: var(--cal-text-muted); display: flex; gap: 8px; align-items: flex-start; }
    .hud-btn-row { display: flex; gap: 8px; align-self: flex-start; }
    .hud-notes-btn {
      display: flex; align-items: center; gap: 6px; align-self: flex-start;
      background: var(--cal-accent); color: #fff; border: none; border-radius: 9999px;
      padding: 6px 14px; font-size: 12px; font-weight: 700; font-family: var(--font-body);
      cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .hud-tasks-btn { background: #d68a1e; }
    .hud-notes-btn:hover { opacity: 0.9; }
    .hud-notes-btn:active { transform: scale(0.96); }
    .hud-notes-btn .count {
      background: rgba(255,255,255,0.28); border-radius: 9999px; padding: 0 7px; font-size: 11px;
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
    .crystal-controls { display: flex; align-items: center; gap: 12px; padding-top: 8px; margin-top: 2px; border-top: 1px solid var(--cal-modal-border); }
    .crystal-controls-label { font-size: 11px; font-weight: 700; color: var(--cal-text-muted); white-space: nowrap; flex: none; }
    .crystal-slider-group { display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0; }
    .crystal-slider-group span { font-size: 12px; flex: none; }
    .crystal-slider-group input[type="range"] { flex: 1; min-width: 0; accent-color: var(--cal-accent); height: 4px; cursor: pointer; }
    .notes-close-btn {
      background: transparent; border: none; color: var(--cal-text-muted); font-size: 13px; font-weight: 700;
      cursor: pointer; padding: 2px 6px;
    }

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

    /* Sequential Month Circle Rail (Favicon-like Selector) */
    #monthSideRail {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 28;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      background: var(--cal-surface);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1.5px solid var(--cal-surface-border);
      border-radius: 28px;
      padding: 8px 6px;
      box-shadow: var(--cal-shadow);
      max-height: 92vh;
      overflow-y: auto;
      scrollbar-width: none;
      user-select: none;
    }
    #monthSideRail::-webkit-scrollbar { display: none; }
    .month-rail-year-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 0 2px 4px 2px;
      border-bottom: 1px solid var(--cal-modal-border);
      margin-bottom: 2px;
    }
    .month-rail-year-btn {
      background: transparent;
      border: none;
      color: var(--cal-text-muted);
      font-size: 10px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 6px;
      font-weight: 800;
      line-height: 1;
      transition: background 0.15s, color 0.15s;
    }
    .month-rail-year-btn:hover {
      background: rgba(0, 0, 0, 0.08);
      color: var(--cal-accent);
    }
    .month-rail-year-label {
      font-size: 11px;
      font-weight: 800;
      font-family: var(--font-display);
      color: var(--cal-text);
      letter-spacing: -0.02em;
    }
    .month-rail-circles {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .month-circle-btn {
      position: relative;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1.5px solid transparent;
      background: rgba(127, 127, 127, 0.1);
      color: var(--cal-text-muted);
      font-size: 10px;
      font-weight: 800;
      font-family: var(--font-body);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      outline: none;
      user-select: none;
      flex-shrink: 0;
    }
    .month-circle-btn:hover {
      background: rgba(60, 90, 107, 0.18);
      color: var(--cal-accent);
      transform: scale(1.14);
      border-color: var(--cal-accent);
    }
    .month-circle-btn:active {
      transform: scale(0.95);
    }
    .month-circle-btn.active {
      background: var(--cal-accent);
      color: #ffffff;
      font-weight: 900;
      transform: scale(1.16);
      box-shadow: 0 4px 12px rgba(60, 90, 107, 0.35);
      border-color: #ffffff;
    }
    .month-circle-btn.is-current-month::after {
      content: '';
      position: absolute;
      bottom: 0px;
      right: 0px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      border: 1.5px solid var(--cal-modal-surface);
    }
    .month-circle-btn .month-tooltip {
      position: absolute;
      right: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      background: var(--cal-modal-surface);
      color: var(--cal-modal-text);
      border: 1px solid var(--cal-modal-border);
      border-radius: 10px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.18s, transform 0.18s;
      box-shadow: var(--cal-shadow);
      z-index: 40;
    }
    .month-circle-btn:hover .month-tooltip {
      opacity: 1;
      visibility: visible;
      transform: translateY(-50%) translateX(-4px);
    }
    @media (max-height: 640px) {
      #monthSideRail { gap: 3px; padding: 6px 4px; }
      .month-rail-circles { gap: 3px; }
      .month-circle-btn { width: 27px; height: 27px; font-size: 9px; }
    }
  </style>
</head>
<body>

  <div class="canvas-wrapper">
    <canvas id="scene-canvas"></canvas>

    <!-- Sequential Month Circle Rail -->
    <div id="monthSideRail" aria-label="Month selector">
      <div class="month-rail-year-row">
        <button class="month-rail-year-btn" id="prevYearBtn" title="Previous Year" type="button">&lt;</button>
        <span class="month-rail-year-label" id="railYearLabel">2026</span>
        <button class="month-rail-year-btn" id="nextYearBtn" title="Next Year" type="button">&gt;</button>
      </div>
      <div class="month-rail-circles" id="monthRailCircles"></div>
    </div>

    <div id="dayLabel">
      <div class="hud-header">
        <div class="hud-date-row">
          <span>Standing on</span>
          <span id="dayValue">--</span>
        </div>
        <span class="hud-badge" id="hudBadge">Active Tile</span>
      </div>
      <div class="hud-task-row">
        <span id="hudTask">Walk across your calendar to explore dates and events.</span>
      </div>
      <div class="hud-btn-row">
        <button class="hud-notes-btn" id="hudNotesBtn" type="button">
          <span>Notes</span><span class="count" id="hudNotesCount">0</span>
        </button>
        <button class="hud-notes-btn hud-tasks-btn" id="hudTasksBtn" type="button">
          <span>Tasks</span><span class="count" id="hudTasksCount">0</span>
        </button>
      </div>
    </div>

    <div id="weekNotesModal">
      <div class="notes-header">
        <div class="notes-title"><span id="notesWeekTitle">Notes</span></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="notes-tag" id="crystalThemeLabel">Amethyst</span>
          <button class="notes-close-btn" id="notesCloseBtn" type="button">Close</button>
        </div>
      </div>
      <div class="notes-list" id="notesList">
        <div class="notes-empty">No notes for this day yet. Type below to add one.</div>
      </div>
      <div class="notes-input-row">
        <input type="text" id="noteInput" class="notes-textarea" placeholder="Add a note for this day..." autocomplete="off" />
        <button id="addNoteBtn" class="notes-add-btn">Add</button>
      </div>
      <div class="crystal-controls">
        <span class="crystal-controls-label">Crystals</span>
        <div class="crystal-slider-group">
          <span title="Crystal size">Size</span>
          <input type="range" id="crystalSizeSlider" min="0.5" max="1.6" step="0.05" value="1" />
        </div>
        <div class="crystal-slider-group">
          <span title="Glow">Glow</span>
          <input type="range" id="crystalGlowSlider" min="0" max="2" step="0.1" value="1" />
        </div>
      </div>
    </div>

    <div id="dayTasksModal">
      <div class="notes-header">
        <div class="notes-title"><span id="tasksDayTitle">Tasks</span></div>
        <button class="notes-close-btn" id="tasksCloseBtn" type="button">Close</button>
      </div>
      <div class="notes-list" id="tasksList">
        <div class="notes-empty">No tasks for this day yet. Add one below.</div>
      </div>
      <div class="notes-input-row">
        <input type="text" id="taskInput" class="notes-textarea" placeholder="e.g. Essay on the water cycle due..." autocomplete="off" />
        <button id="addTaskBtn" class="notes-add-btn">Add</button>
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
    const CARD_W = 16.4, CARD_D_SIZE = 16.4, CARD_H = 0.35;
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
    const CRYSTAL_SETTINGS_KEY = 'calendar_walk_crystal_settings_' + (STUDENT_ID || 'guest');

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

    function seasonTint(monthIndex) {
      if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) return 0xdCE8f5;
      if (monthIndex >= 2 && monthIndex <= 4) return 0xe1f0e1;
      if (monthIndex >= 5 && monthIndex <= 7) return 0xfaf0cf;
      return 0xf7e3ce;
    }

    // ------------------------------------------------------------------
    // Per-background theme -- extends the same theme language the note
    // crystals already use to the calendar object itself, so the physical
    // calendar belongs to whichever world the student picked, not just its
    // rewards.
    // ------------------------------------------------------------------
    const MINECRAFT_BG_URL = 'https://i.postimg.cc/QNY1CNnH/mixboard-image-(13).png';
    const LOTR_BG_URL = 'https://i.postimg.cc/P50825cB/Lord-of-the-rings-shhire.png';
    const EEYORE_BG_URL = 'https://i.postimg.cc/Dwj6cP3m/Eeyore_Cover_Concept.png';
    const WOODED_BG_URL = 'https://i.postimg.cc/Z5p6DrL6/Copy-of-Eeyore-Cover-Concept.png';

    const CALENDAR_THEMES = {
      minecraft: {
        key: 'minecraft', label: 'Voxel Amethyst',
        plinth: 0x5b4636, card: 0xd9c9a3, cardToday: 0x8a5cff, cardPad: 0xb9a67e, ring: 0x9a9a9a, ringMetal: 0.8, ringRough: 0.5,
        flip: 'snap',
        crystal: {
          color: 0xa878e8, attenuation: 0x5b2f96, emissive: 0x8a5cff, hueJitter: 0.05,
          transmission: 0.15, roughness: 0.42, clearcoat: 0.0, clearcoatRoughness: 0.3, ior: 1.4,
          glowBase: 0.4, tilt: 0.12, spread: 0.8,
          shape: { baseRMin: 0.22, baseRRange: 0.08, shaftHMin: 0.45, shaftHRange: 0.15, taperMin: 0.9, taperRange: 0.08, apexJitter: 0.06 },
        },
      },
      lotr: {
        key: 'lotr', label: 'Mithril Bloom',
        plinth: 0x4a4331, card: 0xf3ecd8, cardToday: 0xcfd8ff, cardPad: 0xe1dabf, ring: 0xc8ccd4, ringMetal: 0.9, ringRough: 0.15,
        flip: 'elegant',
        crystal: {
          color: 0xe4ecff, attenuation: 0x5578b8, emissive: 0xcfd8ff, hueJitter: 0.035,
          transmission: 0.85, roughness: 0.04, clearcoat: 0.6, clearcoatRoughness: 0.08, ior: 1.6,
          glowBase: 0.55, tilt: 0.22, spread: 0.7,
          shape: { baseRMin: 0.1, baseRRange: 0.06, shaftHMin: 0.65, shaftHRange: 0.2, taperMin: 0.62, taperRange: 0.18, apexJitter: 0.1 },
        },
      },
      pooh: {
        key: 'pooh', label: 'Honey Bloom',
        plinth: 0xc9a875, card: 0xfff6e6, cardToday: 0xffdca6, cardPad: 0xe9d3a8, ring: 0xb98a4a, ringMetal: 0.2, ringRough: 0.6,
        flip: 'bouncy',
        crystal: {
          color: 0xf7d38c, attenuation: 0xa8631a, emissive: 0xffb84d, hueJitter: 0.07,
          transmission: 0.4, roughness: 0.3, clearcoat: 0.15, clearcoatRoughness: 0.25, ior: 1.35,
          glowBase: 0.75, tilt: 0.45, spread: 1.1,
          shape: { baseRMin: 0.22, baseRRange: 0.12, shaftHMin: 0.32, shaftHRange: 0.14, taperMin: 0.85, taperRange: 0.1, apexJitter: 0.04 },
        },
      },
      default: {
        key: 'default', label: 'Amethyst',
        plinth: 0xa9bcc9, card: 0xf4f2ec, cardToday: 0xbfe0cb, cardPad: 0xdcdfd8, ring: 0x8fae9c, ringMetal: 0.35, ringRough: 0.4,
        flip: 'clean',
        crystal: {
          color: 0xa878e8, attenuation: 0x6b2fb0, emissive: 0x8a5cff, hueJitter: 0.065,
          transmission: 0.7, roughness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.12, ior: 1.55,
          glowBase: 0.3, tilt: 0.35, spread: 1.0,
          shape: { baseRMin: 0.16, baseRRange: 0.1, shaftHMin: 0.55, shaftHRange: 0.2, taperMin: 0.78, taperRange: 0.16, apexJitter: 0.07 },
        },
      },
    };

    function pickThemeKey(bgUrl) {
      if (bgUrl === MINECRAFT_BG_URL) return 'minecraft';
      if (bgUrl === LOTR_BG_URL) return 'lotr';
      if (bgUrl === EEYORE_BG_URL || bgUrl === WOODED_BG_URL) return 'pooh';
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
    const TASK_CATEGORIES = [
      { key: 'essay', match: /essay|report|coursework|assignment|write.?up/i, baseMinutes: 90,
        steps: ['Plan and jot down key points', 'Write a first draft', 'Read back through and edit', 'Submit it'] },
      { key: 'revision', match: /revis|exam|test|quiz|mock/i, baseMinutes: 45,
        steps: ['Gather your notes', 'Make a summary sheet', 'Try a few practice questions', 'Check what you got wrong'] },
      { key: 'reading', match: /read|chapter|book/i, baseMinutes: 30,
        steps: ['Find a quiet spot', 'Read the section', 'Jot down one thing you learned'] },
      { key: 'presentation', match: /presentation|slides|present/i, baseMinutes: 60,
        steps: ['Decide the main points', 'Build the slides', 'Practise saying it out loud'] },
      { key: 'project', match: /project|portfolio|build|make\s/i, baseMinutes: 75,
        steps: ["Break it into smaller pieces", 'Work on the first piece', "Check progress against what's due", 'Finish and tidy up'] },
      { key: 'general', match: /.*/, baseMinutes: 30,
        steps: ['Get started', 'Work on it', 'Finish and check it over'] },
    ];

    function decodeTask(rawText) {
      const category = TASK_CATEGORIES.find((c) => c.match.test(rawText)) || TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
      return { categoryKey: category.key, baseMinutes: category.baseMinutes, steps: category.steps.slice() };
    }

    // The personal multiplier is the estimator's other half -- a short,
    // optional, on-device self-profiling exercise is a separate future
    // feature. Until that exists this reads a neutral default (1x) from
    // the same local key that feature will eventually write to, so wiring
    // it in later won't require touching this function again.
    function getPersonalMultiplier() {
      try {
        const v = parseFloat(localStorage.getItem(TASK_MULTIPLIER_KEY));
        if (!isNaN(v) && v > 0) return v;
      } catch (e) {}
      return 1;
    }

    function computeTaskStatus(task) {
      const doneCount = task.decodedSteps.filter((s) => s.done).length;
      if (doneCount === 0) return 'not_started';
      if (doneCount === task.decodedSteps.length) return 'done';
      return 'in_progress';
    }

    function createTask(dateKey, rawText) {
      const decoded = decodeTask(rawText);
      const multiplier = getPersonalMultiplier();
      const id = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      return {
        id,
        dateISO: dateKey,
        rawText,
        decodedSteps: decoded.steps.map((text, i) => ({ id: id + '_s' + i, text, done: false })),
        estimatedMinutes: Math.round(decoded.baseMinutes * multiplier),
        loggedMinutes: 0,
        status: 'not_started',
      };
    }

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
    scene.fog = new THREE.Fog(WORLD_COLOR, 140, 260);

    const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
    const cameraOffset = new THREE.Vector3(0, 34, 52);
    camera.position.copy(cameraOffset);
    camera.lookAt(0, 6, 40);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.1);
    dirLight.position.set(24, 46, 18);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));

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
      const margin = 7;
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
      const geo = new THREE.ExtrudeGeometry(shape, { depth: CARD_H, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 6 });
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
      const margin = 7;
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
    // Note crystals -- one small cluster per note left on a day, capped,
    // deterministically seeded so a date's crystals look the same on every
    // future visit. Adapted to the classic THREE.MeshPhysicalMaterial /
    // InstancedMesh API this scene's r128 build supports (transmission /
    // ior / clearcoat / per-instance setColorAt all confirmed working in
    // r128; thickness / attenuationColor / dispersion / iridescence do not
    // exist yet in that version and are intentionally omitted).
    // ------------------------------------------------------------------
    function crystalMulberry32(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function crystalEaseOutBack(t) {
      const c1 = 1.20158, c3 = c1 + 1, u = t - 1;
      return 1 + c3 * u * u * u + c1 * u * u;
    }

    function makeCrystalGeometry(rnd, shape) {
      const sides = 6;
      const baseR = shape.baseRMin + rnd() * shape.baseRRange;
      const shaftH = shape.shaftHMin + rnd() * shape.shaftHRange;
      const taper = shape.taperMin + rnd() * shape.taperRange;
      const apex = new THREE.Vector3((rnd() - 0.5) * shape.apexJitter * 2, 1, (rnd() - 0.5) * shape.apexJitter * 2);
      const angles = [], radii = [];
      for (let i = 0; i < sides; i++) {
        angles.push(((i + (rnd() - 0.5) * 0.34) / sides) * Math.PI * 2);
        radii.push(baseR * (0.8 + rnd() * 0.4));
      }
      const lower = [], upper = [];
      for (let i = 0; i < sides; i++) {
        const c = Math.cos(angles[i]), s = Math.sin(angles[i]);
        lower.push(new THREE.Vector3(c * radii[i], 0, s * radii[i]));
        upper.push(new THREE.Vector3(c * radii[i] * taper, shaftH, s * radii[i] * taper));
      }
      const positions = [];
      const push3 = (a, b, c) => { positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
      const bottom = new THREE.Vector3(0, -0.02, 0);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        push3(lower[i], upper[i], upper[j]);
        push3(lower[i], upper[j], lower[j]);
        push3(upper[i], apex, upper[j]);
        push3(lower[j], bottom, lower[i]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      return geo;
    }

    const CRYSTAL_VARIANTS = 4;
    let crystalVariantGeos = null;
    function getCrystalVariantGeometries() {
      if (!crystalVariantGeos) {
        const rnd = crystalMulberry32(0xc0ffee + ACTIVE_THEME_KEY.length * 97);
        crystalVariantGeos = [];
        for (let i = 0; i < CRYSTAL_VARIANTS; i++) crystalVariantGeos.push(makeCrystalGeometry(rnd, ACTIVE_THEME.crystal.shape));
      }
      return crystalVariantGeos;
    }

    let crystalEnvMap = null;
    function getCrystalEnvMap() {
      if (crystalEnvMap) return crystalEnvMap;
      const envScene = new THREE.Scene();
      const skyColor = new THREE.Color(WORLD_COLOR).lerp(new THREE.Color(0xffffff), 0.5);
      envScene.background = skyColor;
      const glow = new THREE.PointLight(ACTIVE_THEME.crystal.emissive, 2, 30);
      glow.position.set(4, 6, 4);
      envScene.add(glow);
      const pmrem = new THREE.PMREMGenerator(renderer);
      crystalEnvMap = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();
      return crystalEnvMap;
    }

    let crystalMaterial = null;
    let crystalGlowMultiplier = 1;
    let crystalSizeMultiplier = 1;
    function getCrystalMaterial() {
      if (crystalMaterial) return crystalMaterial;
      const t = ACTIVE_THEME.crystal;
      crystalMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: t.roughness, transmission: t.transmission, ior: t.ior,
        clearcoat: t.clearcoat, clearcoatRoughness: t.clearcoatRoughness, emissive: t.emissive,
        emissiveIntensity: t.glowBase * crystalGlowMultiplier, envMap: getCrystalEnvMap(), envMapIntensity: 1.3,
      });
      return crystalMaterial;
    }

    const MAX_NOTE_CLUSTERS = 6;
    const CRYSTAL_LAYOUT_SCALE = 2.6;
    const _crystalM = new THREE.Matrix4();
    const _crystalDir = new THREE.Vector3();
    const _crystalAlign = new THREE.Quaternion();
    const _crystalY = new THREE.Vector3(0, 1, 0);
    const _crystalHsl = { h: 0, s: 0, l: 0 };
    const _crystalColor = new THREE.Color();
    const CRYSTAL_HEIGHT_MIN = 0.14, CRYSTAL_HEIGHT_MAX = 1.5;

    function buildCrystalCluster(targetGroup, seedKey, noteCount) {
      if (noteCount <= 0) return;
      const clusters = Math.min(noteCount, MAX_NOTE_CLUSTERS);
      let seedNum = 0;
      for (let i = 0; i < seedKey.length; i++) seedNum = (seedNum * 31 + seedKey.charCodeAt(i)) | 0;
      const rnd = crystalMulberry32((0x9e3779b9 ^ seedNum) >>> 0);
      const geos = getCrystalVariantGeometries();
      const mat = getCrystalMaterial();
      const theme = ACTIVE_THEME.crystal;

      const byVariant = [];
      for (let i = 0; i < geos.length; i++) byVariant.push([]);

      for (let c = 0; c < clusters; c++) {
        const azOffset = rnd() * Math.PI * 2;
        const radiusOffset = 0.3 + rnd() * 0.5;
        const cx = Math.cos(azOffset) * radiusOffset * theme.spread * CRYSTAL_LAYOUT_SCALE;
        const cz = Math.sin(azOffset) * radiusOffset * theme.spread * CRYSTAL_LAYOUT_SCALE;
        const items = [];
        items.push({ heightBase: 1.1 + rnd() * 0.4, tiltScale: 0.5, widthMul: 0.85 + rnd() * 0.3, offFrac: 0, offAz: 0 });
        const shardCount = 2 + Math.floor(rnd() * 2);
        for (let s = 0; s < shardCount; s++) items.push({ heightBase: 0.4 + rnd() * 0.35, tiltScale: 1, widthMul: 0.8 + rnd() * 0.4, offFrac: 0.3 + rnd() * 0.6, offAz: rnd() * Math.PI * 2 });
        const rubbleCount = 1 + Math.floor(rnd() * 2);
        for (let r = 0; r < rubbleCount; r++) items.push({ heightBase: 0.14 + rnd() * 0.1, tiltScale: 1.3, widthMul: 1.1 + rnd() * 0.3, offFrac: 0.6 + rnd() * 0.5, offAz: rnd() * Math.PI * 2 });

        for (const item of items) {
          const variant = Math.floor(rnd() * geos.length);
          byVariant[variant].push({
            x: cx + Math.cos(item.offAz) * item.offFrac * theme.spread * CRYSTAL_LAYOUT_SCALE * 0.35,
            z: cz + Math.sin(item.offAz) * item.offFrac * theme.spread * CRYSTAL_LAYOUT_SCALE * 0.35,
            heightBase: item.heightBase, tiltScale: item.tiltScale, widthMul: item.widthMul,
            leanRnd: rnd(), leanAz: rnd() * Math.PI * 2, spin: rnd() * Math.PI * 2,
            hueRnd: rnd(), satRnd: rnd(), lightRnd: rnd(),
          });
        }
      }

      const crystalSize = 1.9 * crystalSizeMultiplier;
      const baseColor = new THREE.Color(theme.color);
      const attnColor = new THREE.Color(theme.attenuation);

      for (let v = 0; v < geos.length; v++) {
        const list = byVariant[v];
        if (list.length === 0) continue;
        const mesh = new THREE.InstancedMesh(geos[v], mat, list.length);
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        for (let i = 0; i < list.length; i++) {
          const inst = list[i];
          const h = inst.heightBase * crystalSize;
          const w = h * inst.widthMul;
          const lean = theme.tilt * inst.tiltScale * (0.3 + inst.leanRnd * 0.7) * 0.9;
          _crystalDir.set(0, Math.cos(lean), 0).addScaledVector(new THREE.Vector3(Math.cos(inst.leanAz), 0, Math.sin(inst.leanAz)), Math.sin(lean)).normalize();
          _crystalAlign.setFromUnitVectors(_crystalY, _crystalDir);
          const quat = new THREE.Quaternion().setFromAxisAngle(_crystalDir, inst.spin).multiply(_crystalAlign);
          _crystalM.compose(new THREE.Vector3(inst.x, -0.04 * h, inst.z), quat, new THREE.Vector3(w, h, w));
          mesh.setMatrixAt(i, _crystalM);

          const depthT = THREE.MathUtils.clamp((inst.heightBase - CRYSTAL_HEIGHT_MIN) / (CRYSTAL_HEIGHT_MAX - CRYSTAL_HEIGHT_MIN), 0, 1);
          const attnMix = THREE.MathUtils.clamp(0.12 + depthT * 0.5 + inst.satRnd * 0.18, 0, 1);
          const color = _crystalColor.copy(baseColor).lerp(attnColor, attnMix);
          color.getHSL(_crystalHsl);
          color.setHSL(
            (_crystalHsl.h + (inst.hueRnd - 0.5) * theme.hueJitter + 1) % 1,
            THREE.MathUtils.clamp(_crystalHsl.s * (1.05 + inst.satRnd * 0.35), 0, 1),
            THREE.MathUtils.clamp(_crystalHsl.l * (0.55 + inst.lightRnd * 0.65), 0, 1)
          );
          mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        targetGroup.add(mesh);
      }
    }

    function clearCrystalGroup(group) {
      while (group.children.length > 0) {
        const mesh = group.children[0];
        group.remove(mesh);
        mesh.dispose();
      }
    }

    // ------------------------------------------------------------------
    // Month pages -- two live at once (current + next/prev, prebuilt just
    // before a flip), both children of "stage".
    // ------------------------------------------------------------------
    const stage = new THREE.Group();
    scene.add(stage);

    function buildMonthPage(year, month) {
      const days = buildMonthMatrix(year, month);
      const group = new THREE.Group();

      const plinthMat = new THREE.MeshStandardMaterial({ color: seasonTint(month), roughness: 0.9, metalness: 0.03 });
      const plinth = new THREE.Mesh(getPlinthGeometry(), plinthMat);
      plinth.receiveShadow = true;
      group.add(plinth);

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
        faceMesh.position.set(x, CARD_TOP_Y + 1.08, z);
        group.add(faceMesh);

        const crystalGroup = new THREE.Group();
        crystalGroup.position.set(x, CARD_TOP_Y + 0.1, z);
        group.add(crystalGroup);

        dayEntries.set(key, { date, row, col, isPadding, crystalGroup, noteCount: 0, growT: 1 });
      }

      return { group, year, month, dayEntries };
    }

    function syncPageCrystals(page, animateChangedOnly) {
      page.dayEntries.forEach((entry, key) => {
        const count = (DAY_NOTES[key] || []).length;
        if (count === entry.noteCount) return;
        clearCrystalGroup(entry.crystalGroup);
        if (count > 0) buildCrystalCluster(entry.crystalGroup, key, count);
        const wasZero = entry.noteCount === 0;
        entry.noteCount = count;
        if (animateChangedOnly && count > 0 && wasZero) {
          entry.growT = 0;
          entry.crystalGroup.scale.setScalar(0.001);
        } else {
          entry.growT = 1;
          entry.crystalGroup.scale.setScalar(1);
        }
      });
    }

    function rebuildPageCrystals(page) {
      page.dayEntries.forEach((entry, key) => {
        clearCrystalGroup(entry.crystalGroup);
        if (entry.noteCount > 0) buildCrystalCluster(entry.crystalGroup, key, entry.noteCount);
      });
    }

    function updateCrystalGrowth(dt) {
      [currentPage, nextPage].forEach((page) => {
        if (!page) return;
        page.dayEntries.forEach((entry) => {
          if (entry.growT < 1) {
            entry.growT = Math.min(1, entry.growT + dt / 0.6);
            entry.crystalGroup.scale.setScalar(Math.max(0.001, crystalEaseOutBack(entry.growT)));
          }
        });
      });
    }

    let currentPage = buildMonthPage(TODAY.getFullYear(), TODAY.getMonth());
    currentPage.group.position.set(0, 0, 0);
    stage.add(currentPage.group);
    syncPageCrystals(currentPage, false);
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
      syncPageCrystals(nextPage, false);
      nextPage.group.position.set(0, 0, 0);
      stage.add(nextPage.group);

      const dur = FLIP_DURATION[ACTIVE_THEME.flip] || 0.7;
      flipState = { direction, t: 0, duration: dur };
      spawnFlipFlourish();
      updateMonthRailActive(targetYear, targetMonth);
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
        clearFootprints();
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
        updateMonthRailActive(currentPage.year, currentPage.month);
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
      const mat = new THREE.PointsMaterial({ color: ACTIVE_THEME.crystal.emissive, size: 0.9, transparent: true, opacity: 1, depthWrite: false });
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
    let leftFootBone = null, rightFootBone = null, hipsBone = null, hipsRestPosition = null;

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

      // This rig's own origin isn't at its feet, so without this the
      // character sinks into the calendar floor by roughly half its
      // height. Measure its actual lowest point after scaling and shift it
      // up so the feet -- not the model's internal pivot -- sit at y=0
      // within characterParent (whose position.y then tracks the surface).
      characterRoot.updateMatrixWorld(true);
      const footBox = new THREE.Box3().setFromObject(characterRoot);
      characterRoot.position.y -= footBox.min.y;

      characterParent.add(characterRoot);

      mixer = new THREE.AnimationMixer(characterRoot);
      gltf.animations.forEach((clip) => { actionsByName[clip.name] = mixer.clipAction(clip); });

      leftFootBone = characterRoot.getObjectByName('mixamorigLeftFoot');
      rightFootBone = characterRoot.getObjectByName('mixamorigRightFoot');
      hipsBone = characterRoot.getObjectByName('mixamorigHips');
      if (hipsBone) hipsRestPosition = hipsBone.position.clone();

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

    // ------------------------------------------------------------------
    // Footprints
    // ------------------------------------------------------------------
    const FOOTPRINT_POOL_SIZE = 60;
    const FOOTPRINT_STEP_INTERVAL = 0.26;
    const FOOTPRINT_MAX_AGE = 12;
    const footprintCanvas = document.createElement('canvas');
    footprintCanvas.width = 64; footprintCanvas.height = 64;
    const footprintCtx = footprintCanvas.getContext('2d');
    const footGradient = footprintCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    footGradient.addColorStop(0, 'rgba(60,55,50,0.85)');
    footGradient.addColorStop(1, 'rgba(60,55,50,0)');
    footprintCtx.fillStyle = footGradient;
    footprintCtx.beginPath();
    footprintCtx.ellipse(32, 32, 22, 30, 0, 0, Math.PI * 2);
    footprintCtx.fill();
    const footprintTexture = new THREE.CanvasTexture(footprintCanvas);
    const footprintGeometry = new THREE.PlaneGeometry(1.3, 2.0);
    const footprintPool = [];
    for (let i = 0; i < FOOTPRINT_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({ map: footprintTexture, color: 0x2b2620, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(footprintGeometry, material);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.visible = false;
      scene.add(mesh);
      footprintPool.push({ mesh, stampedAt: -Infinity });
    }
    let nextFootprintIndex = 0, lastStepTime = -Infinity, stepOnLeft = true;
    const footWorldPos = new THREE.Vector3();
    function stampFootprint(worldX, worldZ, now) {
      const entry = footprintPool[nextFootprintIndex];
      nextFootprintIndex = (nextFootprintIndex + 1) % FOOTPRINT_POOL_SIZE;
      const surfY = getSurfaceHeightAt(worldX, worldZ);
      entry.mesh.position.set(worldX, surfY + 0.04, worldZ);
      entry.mesh.visible = true;
      entry.stampedAt = now;
    }
    function updateFootprints(now) {
      footprintPool.forEach((entry) => {
        if (!entry.mesh.visible) return;
        const age = now - entry.stampedAt;
        if (age > FOOTPRINT_MAX_AGE) { entry.mesh.visible = false; return; }
        entry.mesh.material.opacity = 0.14 * (1 - age / FOOTPRINT_MAX_AGE);
      });
    }
    function clearFootprints() { footprintPool.forEach((entry) => { entry.mesh.visible = false; }); }

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
        syncPageCrystals(currentPage, false);
        updateMonthRailActive(TODAY.getFullYear(), TODAY.getMonth());
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
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayLabel') || e.target.closest('#monthSideRail')) return;
      const t = e.touches[0]; touchStart.x = t.clientX; touchStart.y = t.clientY; hideTutorial();
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayLabel') || e.target.closest('#monthSideRail')) return;
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
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayLabel') || e.target.closest('#monthSideRail')) return;
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
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayLabel') || e.target.closest('#monthSideRail')) return;
      if (checkCharacterHit(e.clientX, e.clientY)) triggerWalkToToday();
    });
    let lastTouchTapTime = 0, lastTouchTapX = 0, lastTouchTapY = 0;
    window.addEventListener('touchend', (e) => {
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayLabel') || e.target.closest('#monthSideRail')) return;
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
      if (e.target.closest('#weekNotesModal') || e.target.closest('#dayLabel') || e.target.closest('#monthSideRail')) { canvas.style.cursor = 'default'; return; }
      canvas.style.cursor = checkCharacterHit(e.clientX, e.clientY) ? 'pointer' : 'default';
    });
    function hideTutorial() { const el = document.getElementById('tutorialWrapper'); if (el) el.style.display = 'none'; }

    // ------------------------------------------------------------------
    // Day HUD + notes panel -- bound to whichever day the character
    // currently stands on. No separate day-picker: walking there is how
    // you pick the date.
    // ------------------------------------------------------------------
    const dayValueEl = document.getElementById('dayValue');
    const hudBadgeEl = document.getElementById('hudBadge');
    const hudTaskEl = document.getElementById('hudTask');
    const hudNotesBtn = document.getElementById('hudNotesBtn');
    const hudNotesCount = document.getElementById('hudNotesCount');
    const weekNotesModalEl = document.getElementById('weekNotesModal');
    const notesWeekTitleEl = document.getElementById('notesWeekTitle');
    const notesListEl = document.getElementById('notesList');
    const noteInputEl = document.getElementById('noteInput');
    const addNoteBtnEl = document.getElementById('addNoteBtn');
    const notesCloseBtnEl = document.getElementById('notesCloseBtn');
    const hudTasksBtn = document.getElementById('hudTasksBtn');
    const hudTasksCount = document.getElementById('hudTasksCount');
    const dayTasksModalEl = document.getElementById('dayTasksModal');
    const tasksDayTitleEl = document.getElementById('tasksDayTitle');
    const tasksListEl = document.getElementById('tasksList');
    const taskInputEl = document.getElementById('taskInput');
    const addTaskBtnEl = document.getElementById('addTaskBtn');
    const tasksCloseBtnEl = document.getElementById('tasksCloseBtn');

    let currentDateKey = null;
    let currentDate = null;
    let notesOpen = false;
    let tasksOpen = false;

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

    function refreshHudForCurrentDay() {
      if (!currentDateKey) return;
      const count = (DAY_NOTES[currentDateKey] || []).length;
      hudNotesCount.textContent = String(count);
      const taskCount = (DAY_TASKS[currentDateKey] || []).length;
      if (hudTasksCount) hudTasksCount.textContent = String(taskCount);
    }

    window.deleteNote = function (key, idx) {
      if (!DAY_NOTES[key]) return;
      DAY_NOTES[key].splice(idx, 1);
      if (DAY_NOTES[key].length === 0) delete DAY_NOTES[key];
      renderNotesFor(key);
      refreshHudForCurrentDay();
      syncActivePageCrystals(true);
      broadcastNotes();
    };

    function syncActivePageCrystals(animate) {
      syncPageCrystals(currentPage, animate);
      if (nextPage) syncPageCrystals(nextPage, animate);
    }

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
      syncActivePageCrystals(true);
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
    hudNotesBtn.addEventListener('click', openNotesPanel);
    notesCloseBtnEl.addEventListener('click', closeNotesPanel);

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

    function renderTasksFor(key) {
      const tasks = DAY_TASKS[key] || [];
      if (tasks.length === 0) {
        tasksListEl.innerHTML = '<div class="notes-empty">No tasks for this day yet. Add one below.</div>';
        return;
      }
      tasksListEl.innerHTML = tasks.map((t) => {
        const doneCount = t.decodedSteps.filter((s) => s.done).length;
        const stepsHtml = t.decodedSteps.map((s) => \`
          <label class="task-step-row">
            <input type="checkbox" \${s.done ? 'checked' : ''} onchange="window.toggleTaskStep('\${key}','\${t.id}','\${s.id}')" />
            <span class="\${s.done ? 'task-step-done' : ''}">\${s.text.replace(/</g, '&lt;')}</span>
          </label>
        \`).join('');
        return \`
          <div class="task-card">
            <div class="task-card-header">
              <div class="task-card-title">\${t.rawText.replace(/</g, '&lt;')}</div>
              <button class="note-del-btn" onclick="window.deleteTask('\${key}','\${t.id}')" title="Delete task">&times;</button>
            </div>
            <div class="task-card-meta">~\${t.estimatedMinutes} min &middot; \${doneCount}/\${t.decodedSteps.length} steps &middot; \${t.status.replace('_', ' ')}</div>
            <div class="task-steps">\${stepsHtml}</div>
          </div>
        \`;
      }).join('');
    }

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
    };

    function addTaskForCurrentDay() {
      if (!currentDateKey) return;
      const text = taskInputEl.value.trim();
      if (!text) return;
      if (!DAY_TASKS[currentDateKey]) DAY_TASKS[currentDateKey] = [];
      DAY_TASKS[currentDateKey].push(createTask(currentDateKey, text));
      taskInputEl.value = '';
      renderTasksFor(currentDateKey);
      refreshHudForCurrentDay();
      broadcastTasks();
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
    hudTasksBtn.addEventListener('click', openTasksPanel);
    tasksCloseBtnEl.addEventListener('click', closeTasksPanel);

    // Crystal size/glow controls (persisted per-student)
    (function initCrystalControls() {
      const sizeSlider = document.getElementById('crystalSizeSlider');
      const glowSlider = document.getElementById('crystalGlowSlider');
      try {
        const saved = JSON.parse(localStorage.getItem(CRYSTAL_SETTINGS_KEY) || '{}');
        if (typeof saved.size === 'number') { crystalSizeMultiplier = saved.size; sizeSlider.value = String(saved.size); }
        if (typeof saved.glow === 'number') { crystalGlowMultiplier = saved.glow; glowSlider.value = String(saved.glow); }
      } catch (e) {}
      function saveCrystalSettings() {
        try { localStorage.setItem(CRYSTAL_SETTINGS_KEY, JSON.stringify({ size: crystalSizeMultiplier, glow: crystalGlowMultiplier })); } catch (e) {}
      }
      sizeSlider.addEventListener('input', () => {
        crystalSizeMultiplier = parseFloat(sizeSlider.value);
        rebuildPageCrystals(currentPage);
        if (nextPage) rebuildPageCrystals(nextPage);
        saveCrystalSettings();
      });
      glowSlider.addEventListener('input', () => {
        crystalGlowMultiplier = parseFloat(glowSlider.value);
        if (crystalMaterial) crystalMaterial.emissiveIntensity = ACTIVE_THEME.crystal.glowBase * crystalGlowMultiplier;
        saveCrystalSettings();
      });
    })();

    // ------------------------------------------------------------------
    // Month Side Rail (Sequential Circular Month Favicon-like Icons)
    // ------------------------------------------------------------------
    const monthRailCirclesEl = document.getElementById('monthRailCircles');
    const railYearLabelEl = document.getElementById('railYearLabel');
    const prevYearBtnEl = document.getElementById('prevYearBtn');
    const nextYearBtnEl = document.getElementById('nextYearBtn');
    let displayedRailYear = currentPage.year;

    function renderMonthRail(year, activeMonth) {
      if (!monthRailCirclesEl) return;
      if (railYearLabelEl) railYearLabelEl.textContent = String(year);
      displayedRailYear = year;

      let html = '';
      for (let m = 0; m < 12; m++) {
        const isCurrentActive = (currentPage.year === year && currentPage.month === m);
        const isCurrentTodayMonth = (TODAY.getFullYear() === year && TODAY.getMonth() === m);
        const monthShort = MONTH_NAMES[m].slice(0, 3).toUpperCase();
        const monthFull = MONTH_NAMES[m];

        html += '<button class="month-circle-btn' + (isCurrentActive ? ' active' : '') + (isCurrentTodayMonth ? ' is-current-month' : '') + '" data-month="' + m + '" data-year="' + year + '" type="button" title="' + monthFull + ' ' + year + '">' +
          '<span class="month-abbr">' + monthShort + '</span>' +
          '<span class="month-tooltip">' + monthFull + ' ' + year + '</span>' +
        '</button>';
      }
      monthRailCirclesEl.innerHTML = html;

      const btns = monthRailCirclesEl.querySelectorAll('.month-circle-btn');
      btns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetM = parseInt(btn.getAttribute('data-month'), 10);
          const targetY = parseInt(btn.getAttribute('data-year'), 10);
          jumpToMonth(targetY, targetM);
        });
      });
    }

    function updateMonthRailActive(year, month) {
      displayedRailYear = year;
      renderMonthRail(year, month);
    }

    if (prevYearBtnEl) {
      prevYearBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        displayedRailYear--;
        renderMonthRail(displayedRailYear, currentPage.year === displayedRailYear ? currentPage.month : -1);
      });
    }
    if (nextYearBtnEl) {
      nextYearBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        displayedRailYear++;
        renderMonthRail(displayedRailYear, currentPage.year === displayedRailYear ? currentPage.month : -1);
      });
    }

    renderMonthRail(currentPage.year, currentPage.month);

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
      const isToday = isSameDate(date, TODAY);
      const isPadding = date.getMonth() !== currentPage.month;
      const eventText = SAMPLE_EVENTS[key] || 'No events scheduled for this day.';
      const label = \`\${WEEKDAYS[date.getDay()]}, \${MONTH_NAMES[date.getMonth()].slice(0, 3)} \${date.getDate()}, \${date.getFullYear()}\`;
      if (dayValueEl) dayValueEl.textContent = label;
      if (hudBadgeEl) {
        hudBadgeEl.textContent = isToday ? 'Today' : (isPadding ? MONTH_NAMES[date.getMonth()].slice(0, 3) : \`Day \${date.getDate()}\`);
        hudBadgeEl.className = 'hud-badge' + (isToday ? ' today' : '') + (isPadding ? ' pad' : '');
      }
      if (hudTaskEl) hudTaskEl.textContent = eventText;
      refreshHudForCurrentDay();
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
      if (mixer) mixer.update(delta);
      if (hipsBone && hipsRestPosition) hipsBone.position.copy(hipsRestPosition);

      if (flipState) {
        updateFlip(delta);
        updateFlourish(delta);
        camera.position.lerp(cameraOffset.clone().add(new THREE.Vector3(0, 0, HINGE_Z / 2)), 0.04);
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
        if (elapsedTime - lastStepTime > FOOTPRINT_STEP_INTERVAL) {
          lastStepTime = elapsedTime;
          const bone = stepOnLeft ? leftFootBone : rightFootBone;
          stepOnLeft = !stepOnLeft;
          if (bone) { footWorldPos.setFromMatrixPosition(bone.matrixWorld); stampFootprint(footWorldPos.x, footWorldPos.z, elapsedTime); }
          else stampFootprint(characterParent.position.x, characterParent.position.z, elapsedTime);
        }
      } else if (elapsedTime - lastMovementTime > 0.3 && isMoving) {
        isMoving = false;
        if (footstepSound.isPlaying) footstepSound.stop();
      }
      updateFootprints(elapsedTime);
      updateCrystalGrowth(delta);

      // Smooth surface height stepping (walking on top of flat tiles & background)
      const targetSurfaceY = getSurfaceHeightAt(characterParent.position.x, characterParent.position.z);
      characterParent.position.y = THREE.MathUtils.lerp(characterParent.position.y, targetSurfaceY, Math.min(1, delta * 18));

      cameraTarget.copy(characterParent.position);
      const rotatedOffset = cameraOffset.clone().applyAxisAngle(yAxis, currentRotation);
      const targetCameraPos = characterParent.position.clone().add(rotatedOffset);
      camera.position.lerp(targetCameraPos, 0.06);
      camera.lookAt(cameraTarget.x, cameraTarget.y + 10, cameraTarget.z);

      updateHudForPosition(characterParent.position.x, characterParent.position.z);
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
   * shell (plinth/card/ring colors, fonts, flip character) and the note-crystal
   * look, so both match whatever the student already chose elsewhere rather than
   * being a separate setting. Falls back to a neutral default look if omitted. */
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
