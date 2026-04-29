// ── Backend (home WiFi) ───────────────────────────────────────────
// Update this to the IP of the PC running `node src/index.js`.
export const BACKEND_BASE_URL = 'http://192.168.1.100:3001';

// ── ESP32 Access Point ────────────────────────────────────────────
export const ESP32_WS_URL = 'ws://192.168.4.1/ws';

// ── Drive loop ────────────────────────────────────────────────────
export const DRIVE_INTERVAL_MS = 50;

// ── AsyncStorage keys ────────────────────────────────────────────
export const STORAGE_RACE_RESULT = 'pendingRaceResult';
export const STORAGE_RACE_ID     = 'currentRaceId';
export const STORAGE_NAME        = 'competitorName';

// ── Dev mode ─────────────────────────────────────────────────────
// Set to true to bypass backend registration and skip WiFi instruction.
// Flip to false before a real race event.
export const DEV_MODE = true;

// ── Color theme ──────────────────────────────────────────────────
export const C = {
  bg:          '#07070f',
  surface:     '#0e0e1e',
  card:        '#13132a',
  border:      '#1e1e3c',
  primary:     '#00c8ff',
  primaryDim:  '#003d55',
  green:       '#00e676',
  greenDim:    '#003322',
  red:         '#ff3366',
  redDim:      '#3a0018',
  amber:       '#ffaa00',
  white:       '#eeeeff',
  muted:       '#4a4a80',
  mutedLight:  '#8888bb',
} as const;
