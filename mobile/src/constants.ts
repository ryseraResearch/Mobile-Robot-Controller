// ── Backend (PC on ESP32 AP network) ─────────────────────────────
// Set in .env.development / .env.production via EXPO_PUBLIC_BACKEND_BASE_URL.
// Update the production value to the PC's 192.168.4.x IP (run ipconfig after
// connecting to the 'LineFollower' AP).
export const BACKEND_BASE_URL  = process.env.EXPO_PUBLIC_BACKEND_BASE_URL  ?? 'http://192.168.4.100:3001';

// ── ESP32 Access Point ────────────────────────────────────────────
export const ESP32_WS_URL      = process.env.EXPO_PUBLIC_ESP32_WS_URL      ?? 'ws://192.168.4.1/ws';

// ── Drive loop ────────────────────────────────────────────────────
export const DRIVE_INTERVAL_MS = Number(process.env.EXPO_PUBLIC_DRIVE_INTERVAL_MS ?? 50);

// ── AsyncStorage keys ────────────────────────────────────────────
export const STORAGE_NAME = 'competitorName'; // reserved for future use

// ── Color theme ──────────────────────────────────────────────────
export const C = {
  bg:          '#0A0808',
  surface:     '#120C0C',
  card:        '#1A1010',
  border:      '#2E1A1A',
  primary:     '#FF1744',
  primaryDim:  '#3D0014',
  green:       '#00E676',
  greenDim:    '#003322',
  red:         '#FF1744',
  redDim:      '#3D0014',
  amber:       '#FF9100',
  white:       '#F0ECEC',
  muted:       '#5A3A3A',
  mutedLight:  '#9A7070',
} as const;
