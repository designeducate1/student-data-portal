// Shared data model for the Student Portal + Little Big City integration.
// See the project build brief for the full picture. Stage 1 only uses
// `getOrCreateLocalStudentId`-style local identity + calendar notes; the
// TaskEntry/BuildingAsset shapes below are the target shape for later
// stages (decoder, estimator, silhouettes, claim/place) and are defined
// now so each stage only has to fill them in, not invent them.

// Types for the main student data portal shell (login, chat-based grades
// lookup) -- this reads official college data live and read-only, per the
// "display, don't duplicate" privacy principle, so it keeps talking to the
// same backend the original project used.
export interface ChatMessage {
  text: string;
  type: 'sent' | 'received';
}

export interface StudentData {
  [key: string]: string | number | undefined;
  Name?: string;
}

export interface SubStep {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskEntry {
  id: string;
  dateISO: string;
  rawText: string; // student's original input -- local-only, never shown to staff
  decodedSteps: SubStep[];
  estimatedMinutes: number;
  loggedMinutes: number;
  status: 'not_started' | 'in_progress' | 'done';
}

export type BuildingSizeTier = 'small' | 'medium' | 'large';
export type BuildingState = 'locked' | 'claimed' | 'placed';

export interface BuildingAsset {
  taskId: string; // links back to the TaskEntry
  state: BuildingState;
  sizeTier: BuildingSizeTier;
  worldPosition?: { offsetX: number; offsetY: number };
}

// Minimal staff-visible projection of a TaskEntry -- status and counts only,
// per the "minimal footprint for anything staff-visible" privacy principle.
export interface TaskStatusSummary {
  id: string;
  dateISO: string;
  status: TaskEntry['status'];
  subStepCount: number;
  subStepsDone: number;
}
