# Line Follower Robot Game — CLAUDE.md

## Project overview
A competitive school game where players control a differential-drive ESP32 robot
along a white line in a black arena using a mobile joystick app. Points deduct
when the robot leaves the line. An admin dashboard manages config and leaderboard.

## Repository structure
```
/firmware      — Arduino/ESP32 C++ (PlatformIO)
/mobile        — Expo React Native (Android-first)
/admin         — React web dashboard
/backend       — Node.js + better-sqlite3 REST + WebSocket server
```

## Tech stack
- Firmware: PlatformIO + Arduino framework, ESPAsyncWebServer, AsyncWebSocket
- Mobile: Expo SDK (latest), expo-dev-client for on-device testing
- Admin: Vite + React + TailwindCSS
- Backend: Node.js + Express + better-sqlite3 + ws

---

## Phase 1 — ESP32 firmware: WiFi AP + WebSocket control server

### Goal
ESP32 boots as a WiFi Access Point. Accepts WebSocket connections. Receives
drive commands, drives two motors via PWM. Reads 5-sensor IR array and
broadcasts sensor state + score back to connected clients.

### Tasks
1. Configure ESP32 as AP (SSID: `LineFollower`, pass: `race1234`, IP: 192.168.4.1)
2. Start AsyncWebSocket server on ws://192.168.4.1/ws
3. Accept JSON drive commands:
   ```json
   { "type": "drive", "left": 0.0, "right": 0.0 }
   ```
   Values are -1.0 to 1.0. Map to PWM on motor driver pins (L298N or similar).
   Left motor: pins 16, 17 (dir), 18 (PWM). Right motor: pins 19, 21 (dir), 22 (PWM).
4. Read 5 IR sensors on analog pins 32–36. Threshold 2048 = on-line.
   Compute `onLine` = any of the 5 sensors reads as on-line.
5. Game state machine:
   - WAITING: before race starts (motors off)
   - RACING: after start command received
   - FINISHED: after finish command or time limit
6. During RACING:
   - Track cumulative milliseconds robot is off-line (none of 5 sensors on white).
   - If off-line for 5 cumulative seconds → broadcast `{ "type": "eliminated" }` → go to FINISHED.
   - Deduct 1 point per 100ms off-line from current score (initial score configured by admin, default 1000).
   - Broadcast every 100ms:
     ```json
     { "type": "state", "score": 950, "sensors": [0,1,1,1,0], "onLine": true, "elapsed": 12340 }
     ```
7. Accept control commands:
   ```json
   { "type": "cmd", "action": "start"|"stop"|"reset" }
   { "type": "config", "baseVelocity": 180, "initialScore": 1000 }
   ```
8. On finish wall trigger (digital pin 23, active LOW): broadcast
   ```json
   { "type": "finished", "score": 820, "elapsed": 34500, "timeBonus": 200 }
   ```
   Time bonus = max(0, 500 - floor(elapsed/1000) * 10) — configurable formula.

### Deliverable
`firmware/src/main.cpp` — compiles and flashes cleanly via PlatformIO.
`firmware/platformio.ini` — board: esp32dev, framework: arduino, libs: ESPAsyncWebServer.

---

## Phase 2 — Backend: REST API + WebSocket relay + SQLite leaderboard

### Goal
Node.js server running on the admin's PC (port 3001). Stores leaderboard in
SQLite. Exposes REST for admin config and score submission. Broadcasts leaderboard
updates to admin dashboard via WebSocket.

### Tasks
1. Initialize SQLite DB with tables:
   ```sql
   CREATE TABLE competitors (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     score INTEGER NOT NULL,
     time_ms INTEGER NOT NULL,
     time_bonus INTEGER DEFAULT 0,
     final_score INTEGER NOT NULL,
     eliminated BOOLEAN DEFAULT 0,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE config (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   ```
   Seed config: `{ baseVelocity: 180, initialScore: 1000, timeBonusEnabled: true }`

2. REST endpoints:
   - `GET  /api/config`              → returns all config key-values
   - `PUT  /api/config`              → body `{ key, value }` → upsert
   - `POST /api/race/start`          → body `{ name }` → creates pending race entry, returns `{ raceId }`
   - `POST /api/race/:id/finish`     → body `{ score, time_ms, time_bonus, eliminated }` → saves result
   - `GET  /api/leaderboard`         → returns top 20 by final_score DESC, then time_ms ASC
   - `DELETE /api/leaderboard`       → clears all competitor records

3. WebSocket server (ws://localhost:3001/ws):
   - On any leaderboard change → broadcast `{ "type": "leaderboard", "data": [...] }`
   - On config change → broadcast `{ "type": "config", "data": {...} }`

4. CORS: allow all origins (LAN use only, no auth needed).

### Deliverable
`backend/src/index.js` + `backend/package.json`
Run with `node src/index.js` — no build step needed.

---

## Phase 3 — Mobile app: competitor registration + dual joystick controller

### Goal
Expo React Native app. Player enters their name, app connects to ESP32 AP and
backend, then shows the drive screen with dual joystick, live score, and sensor
indicator bar.

### Screens
1. **Home screen** — text input for competitor name + "Ready to race" button.
   On submit: POST `/api/race/start` to backend (home WiFi), store raceId,
   then display "Now connect to WiFi: LineFollower" instruction + "I'm connected" button.

2. **Drive screen** — shown after player confirms ESP32 WiFi connection.
   Layout:
   - Top bar: competitor name, live score (large), elapsed time
   - Center: 5-dot sensor bar (green = on line, red = off line)
   - Bottom half: two circular joystick pads side by side
     - Left joystick: Y-axis only → speed scalar (0 to baseVelocity).
       Push forward = move, release = stop.
     - Right joystick: X-axis only → steering. Maps differential to left/right motor split.
     - Combine: leftSpeed = velocity * (1 + rightX), rightSpeed = velocity * (1 - rightX),
       clamped to [-baseVelocity, baseVelocity].
   - Send drive command via WebSocket to ws://192.168.4.1/ws every 50ms while joystick active.
   - Receive `state` messages → update score, sensors.
   - On `eliminated` message → show elimination overlay, POST result to backend, navigate to results screen.
   - On `finished` message → show finish overlay with score + bonus, POST result to backend.

3. **Results screen** — shows final score, time, bonus, and "Back to home" button.
   On load: if not yet posted, POST result to `POST /api/race/:id/finish` (reconnect to home WiFi first).

### Implementation notes
- Build a simple custom joystick with PanResponder (no external lib dependency).
- WebSocket: use native WebSocket API (available in Expo).
- Keep drive loop in a ref + setInterval — not in React state (avoid re-render lag).
- Use expo-dev-client so it can be tested on a real Android device via `npx expo run:android`.
- Buffer the final race result in AsyncStorage so it survives a WiFi switch before submission.

### Deliverable
`mobile/` — Expo project. `npx expo run:android` works on physical device.

---

## Phase 4 — Admin dashboard: config panel + live leaderboard

### Goal
React web app (run with `npm run dev`, port 5173). Admin opens this on their
laptop to configure the race and watch the leaderboard update live.

### Tabs

1. **Config tab**
   Fields (fetched from `GET /api/config`, updated via `PUT /api/config`):
   - Base velocity (number input, 0–255)
   - Initial score (number input)
   - Time bonus enabled (toggle)

   Save button — PUTs each changed field to backend.

   "Push to robot" button — admin laptop must be temporarily connected to the
   ESP32 AP (`LineFollower`). On click, open a WebSocket to ws://192.168.4.1/ws
   and send `{ type: "config", baseVelocity: N, initialScore: N }`.
   Show success/failure toast.

2. **Leaderboard tab**
   - Table columns: Rank, Name, Score, Time, Bonus, Final Score, Status
   - Live updates via WebSocket `ws://localhost:3001/ws` — no manual refresh needed.
   - Highlight top 3 rows with gold/silver/bronze styling.
   - "Clear leaderboard" button → DELETE `/api/leaderboard` with confirmation dialog.

3. **Race control tab** (optional but recommended)
   - Shows current competitor name (set by mobile app on race start).
   - Countdown button: broadcasts `{ type: "countdown", seconds: 3 }` via backend WS
     → mobile app shows 3-2-1 overlay → sends start command to ESP32.
   - Emergency stop button: sends `{ type: "cmd", action: "stop" }` to ESP32 (requires
     admin to be on ESP32 AP, or relay through a connected mobile client).

### Deliverable
`admin/` — Vite React project. `npm run dev` serves on port 5173.

---

## Phase 5 — Integration + polish

### Tasks
1. **Safety kill**: if ESP32 receives no drive command for 5 consecutive seconds
   during RACING state, automatically stop motors and broadcast
   `{ "type": "warning", "reason": "no_signal" }`.

2. **Calibration endpoint**: add `GET /calibrate` on ESP32 that streams raw IR
   sensor ADC readings every 200ms for 10 seconds, then stops. Useful for
   field tuning the on-line threshold.

3. **Score animation**: on mobile drive screen, animate score counting down
   visually when points are deducted (brief red flash + number tick).

4. **Countdown flow**: wire up the admin Race Control tab countdown to the
   mobile app. Mobile listens for `{ type: "countdown" }` on backend WS and
   shows overlay before connecting to ESP32 AP.

5. **README.md** at repo root covering:
   - Wiring description: motor driver pins (16/17/18 left, 19/21/22 right),
     IR sensor pins (32–36), finish wall pin (23, active LOW)
   - Startup sequence: flash ESP32 → `node src/index.js` → open admin dashboard
     → player enters name on mobile → connects to ESP32 AP → races
   - How to run on physical Android device (expo-dev-client steps)
   - How to push config from admin laptop to robot (manual WiFi switch step)

6. **End-to-end test checklist** (manual):
   - [ ] Full race: player drives to finish wall, time bonus awarded, leaderboard updates
   - [ ] Elimination: robot off-line for 5s, app shows elimination screen, result saved
   - [ ] Config push: admin changes velocity, pushes to robot, motor speed changes
   - [ ] Leaderboard: multiple competitors, correct ranking order
   - [ ] No-signal kill: phone disconnects mid-race, motors stop within 5s

---

## Global conventions
- All WebSocket messages are JSON with a `type` field as the discriminator.
- No authentication — this is a closed LAN game at a school event.
- Prefer simple and explicit over clever — maintainability matters more than elegance.
- Pin numbers, thresholds, and timing constants must be `#define` or top-of-file
  constants in firmware, and a `config.js` / `.env` in Node.js — never hardcoded
  mid-function.
- Mobile app targets Android SDK 33+. iOS support is not required.
- Do not use TypeScript in the backend (plain JS). Mobile and admin may use TypeScript.
- All times are in milliseconds internally. Display as seconds in UI.
- Score is always an integer. No floating point scores.

---

## Key design decisions & rationale

**Dual-WiFi on mobile**: The phone must be on the ESP32 AP during driving but needs
home WiFi to reach the backend. Solve this by buffering the race result locally
(AsyncStorage) and submitting it after the race ends when the player reconnects to
home WiFi. The results screen handles this submission step explicitly.

**No backend↔ESP32 direct link**: The backend runs on home WiFi; the ESP32 is its
own AP. They are on separate networks. The mobile app is the bridge during a race.
Admin config pushes require a manual WiFi switch on the admin laptop — document this
clearly rather than over-engineering a relay.

**50ms drive loop**: Sending commands every 50ms (20Hz) gives responsive control
without flooding the ESP32 WebSocket. If the connection drops, the safety kill
(5s no-signal) stops the motors automatically.

**IR threshold at 2048**: Mid-scale of a 12-bit ADC. Tune per environment using
the `/calibrate` endpoint. Store the tuned threshold in ESP32 flash (Preferences
library) so it survives reboots.