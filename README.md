# RoboRace — Mobile Robot Racing Challenge

A high-energy competitive event where players pilot a differential-drive ESP32 robot along a white line track using a mobile joystick app. Points deduct in real time whenever the robot strays off course. An admin dashboard manages race configuration, countdowns, and the live leaderboard — suitable for all ages, from first-timers to seasoned hobbyists.

---

## Repository structure

```
/firmware   — ESP32 C++ (PlatformIO + Arduino)
/mobile     — Expo React Native controller app (Android)
/backend    — Node.js + Express + SQLite REST & WebSocket server
/admin      — Vite + React admin dashboard
```

---

## Network architecture

All devices connect to the **ESP32's own WiFi access point** — no home WiFi needed during a race.

```
ESP32 AP  SSID: LineFollower  PASS: race1234  IP: 192.168.4.1
    ├── Phone     192.168.4.x   ← drives robot via WebSocket
    └── PC        192.168.4.x   ← runs backend + admin dashboard
```

> The PC must have a **static IP** on the `LineFollower` network so the mobile app can always reach the backend at a known address. See [Admin PC static IP](#admin-pc-static-ip-required-on-race-day) below.

---

## Hardware wiring

### Motor driver (L298N)

| Signal       | ESP32 GPIO |
|--------------|-----------|
| Left IN1     | 26        |
| Left IN2     | 27        |
| Left ENA/PWM | 18        |
| Right IN3    | 19        |
| Right IN4    | 21        |
| Right ENB/PWM| 22        |

> GPIO 16 & 17 are reserved for PSRAM on ESP32-WROOM — do not use for motors.

### IR sensors (×5) — digital DO output

Connect each module's **DO pin** (not AO) to the ESP32. Use each module's blue trimmer pot to set the threshold: LED on = white line (DO = HIGH).

| Sensor | GPIO |
|--------|------|
| 1      | 32   |
| 2      | 33   |
| 3      | 34   |
| 4      | 35   |
| 5      | 4    |

### Finish wall (HC-SR04 ultrasonic)

| Signal | GPIO |
|--------|------|
| TRIG   | 23   |
| ECHO   | 25   |

The finish triggers when the robot is within **10 cm** of the wall (`FINISH_DISTANCE_CM` in `main.cpp`).

---

## Game rules

- Initial score: **1000** (configurable)
- **−1 point** per 100 ms spent off the white line
- **Eliminated** after 5 s of cumulative off-line time
- **Time bonus** = `max(0, 500 − floor(elapsed_seconds) × 10)` added on finish
- Safety kill: motors stop if no drive command is received for **5 s** during a race

---

## Setup & startup sequence

### 1 — Flash the ESP32

```bash
cd firmware
pio run --target upload
pio device monitor   # 115200 baud — confirm "AP ready" message
```

Requires [PlatformIO](https://platformio.org/) (VS Code extension or CLI).

### 2 — Set a static IP on the PC (race day only)

The ESP32's DHCP server assigns a different IP to your PC each time you connect. A static IP prevents the mobile app's backend URL from becoming stale.

**Set static IP** (PowerShell as Admin, run before or after connecting to `LineFollower`):

```powershell
netsh interface ip set address name="WiFi" static 192.168.4.100 255.255.255.0 192.168.4.1
```

**Restore DHCP** (run when leaving the event and switching back to normal WiFi):

```powershell
netsh interface ip set address name="WiFi" dhcp
```

`192.168.4.100` is already set in `mobile/.env.production` and `mobile/.env.development` — no manual IP hunting needed.

### 3 — Start the backend (on the PC)

```bash
cd backend
npm install

# Development (localhost, DEV_MODE available)
npm run dev

# Race day (binds to 0.0.0.0:3001)
npm run start
```

The server starts on `http://0.0.0.0:3001`. Make sure the PC is connected to `LineFollower` WiFi and the static IP is set before players join.

### 4 — Open the admin dashboard

```bash
cd admin
npm install

# Development (backend on localhost)
npm run dev

# Race day build (backend on 192.168.4.x)
# First update admin/.env.production with the PC's IP, then:
npm run build
npm run preview   # serves the production build locally
```

Open `http://localhost:5173` (dev) or `http://localhost:4173` (preview).

### 5 — Configure environment for race day

If you set the static IP `192.168.4.100` as above, the `.env.production` files are already correct and need no changes. If you use a different address, update it in both files:

- `admin/.env.production` → `VITE_BACKEND_BASE_URL` and `VITE_BACKEND_WS_URL`
- `mobile/.env.production` → `EXPO_PUBLIC_BACKEND_BASE_URL`

### 6 — Build and install the mobile app

Requires a physical Android device with USB debugging enabled.

```bash
cd mobile
npm install
npx expo run:android   # builds and installs via expo-dev-client
```

For subsequent runs without rebuilding:
```bash
npx expo start --dev-client
```

Then open the Expo Dev Client app on the phone and connect.

---

## Race day flow

1. Admin connects PC to `LineFollower` WiFi, starts backend (`npm run start`)
2. Admin opens dashboard (`http://localhost:5173` or the preview URL)
3. Player opens the app on their phone (phone connected to `LineFollower` WiFi)
4. Player enters their name → taps **Ready to Race**
   - App registers the player with the backend (POST `/api/race/start`)
   - App shows "Ready!" screen
5. Admin uses the **Race Control** tab to trigger a countdown (3 / 5 / 10 s)
   - App receives the countdown via WebSocket and shows an overlay
   - At zero, app connects to ESP32 and sends the `start` command
6. Player drives using the dual joysticks:
   - **Left joystick** (Y-axis) — throttle: push up = forward
   - **Right joystick** (X-axis) — steering: left/right
7. Race ends when:
   - Robot reaches the finish wall (ultrasonic trigger), or
   - Robot is off-line for 5 cumulative seconds (eliminated)
8. Results screen shows final score + time bonus
   - Result is automatically POSTed to the backend
   - Leaderboard on the admin dashboard updates live

---

## Admin dashboard

| Tab | Purpose |
|-----|---------|
| **Leaderboard** | Live rankings, top 3 highlighted, clear button |
| **Config** | Base velocity (0–255), initial score, time bonus toggle; "Push to Robot" sends config directly to ESP32 |
| **Race Control** | Countdown broadcast, emergency stop |

### Push config to robot

The **Push to Robot** button opens a WebSocket directly to `ws://192.168.4.1/ws` and sends:
```json
{ "type": "config", "baseVelocity": 180, "initialScore": 1000 }
```
The PC must be connected to the `LineFollower` AP when doing this (it usually already is on race day).

---

## Sensor calibration

While the ESP32 is running, open a browser and visit:
```
http://192.168.4.1/calibrate
```
The Serial monitor will print all 5 sensor DO values (0 or 1) every 200 ms for 10 seconds. Adjust each module's trimmer pot until the correct sensors read `1` on white and `0` on black.

---

## Environment files

| File | Used by | When |
|------|---------|------|
| `backend/.env.development`  | `npm run dev`   | Local testing |
| `backend/.env.production`   | `npm run start` | Race day |
| `admin/.env.development`    | `npm run dev`   | Local testing |
| `admin/.env.production`     | `npm run build` | Race day |
| `mobile/.env.development`   | `npx expo start`       | Local testing (DEV_MODE=true) |
| `mobile/.env.production`    | `npx expo run:android` | Race day build (DEV_MODE=false) |

`.env.local` and `.env.*.local` files are gitignored — use them for machine-specific overrides without affecting the committed defaults.

---

## End-to-end test checklist

- [ ] Full race: player drives to finish wall, time bonus awarded, leaderboard updates
- [ ] Elimination: robot off-line for 5 s, app shows elimination screen, result saved
- [ ] Config push: admin changes base velocity, pushes to robot, motor speed changes
- [ ] Leaderboard: multiple competitors ranked correctly (final score DESC, time ASC)
- [ ] No-signal kill: phone disconnects mid-race, motors stop within 5 s
- [ ] Admin countdown: 3-2-1 overlay appears on phone, race starts automatically
