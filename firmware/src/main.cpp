/**
 * Line Follower Robot — ESP32 Firmware
 *
 * WiFi AP: SSID=LineFollower, PASS=race1234, IP=192.168.4.1
 * WebSocket: ws://192.168.4.1/ws
 * Calibration: GET http://192.168.4.1/calibrate  (streams raw ADC to Serial, 10 s)
 *
 * Motor wiring (L298N):
 *   Left  — IN1=26, IN2=27, ENA(PWM)=18
 *   Right — IN3=19, IN4=21, ENB(PWM)=22
 *
 * IR sensors (DO digital comparator output, active-HIGH on white line):
 *   GPIO 32, 33, 34, 35, 4 — connect DO pin of each module, tune pot per module
 * Finish wall: HC-SR04 ultrasonic — TRIG=23, ECHO=25
 *   Triggers finish when wall is within FINISH_DISTANCE_CM (default 20 cm)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ─────────────────────────── WiFi AP ────────────────────────────
#define AP_SSID  "LineFollower"
#define AP_PASS  "race1234"

// ─────────────────────── Motor pins (L298N) ──────────────────────
// NOTE: GPIO 16 & 17 are reserved for PSRAM on ESP32-WROOM modules.
#define LEFT_IN1      26
#define LEFT_IN2      27
#define LEFT_PWM_PIN  18
#define RIGHT_IN1     19
#define RIGHT_IN2     21
#define RIGHT_PWM_PIN 22

#define LEFT_PWM_CH   0
#define RIGHT_PWM_CH  1
#define PWM_FREQ      5000
#define PWM_RES_BITS  8   // 0–255

// ─────────────────────── IR sensors ─────────────────────────────
// All 5 sensors use DO (digital comparator) output — no ADC needed.
// Active-HIGH: DO = 1 when sensor is over white line.
// Adjust each module's trimmer pot so LED lights on white, off on black.
#define SENSOR_COUNT 5
const uint8_t SENSOR_PINS[SENSOR_COUNT] = {32, 33, 34, 35, 4};

// ─────────────────────── Finish wall (HC-SR04 ultrasonic) ───────
#define ULTRASONIC_TRIG_PIN   23
#define ULTRASONIC_ECHO_PIN   25
#define FINISH_DISTANCE_CM    10    // trigger finish when wall ≤ this distance
#define ULTRASONIC_TIMEOUT_US 30000UL  // ~5 m max range; avoids blocking too long

// ─────────────────────── Timing constants ────────────────────────
#define STATE_BROADCAST_MS   100UL  // send state every 100 ms
#define OFFLINE_DEDUCT_MS    100UL  // 1 point deducted per 100 ms offline
#define ELIMINATION_MS      5000UL  // eliminated after 5 s cumulative offline
#define NO_SIGNAL_KILL_MS   5000UL  // stop motors if no drive cmd for 5 s

// ─────────────────────── Game defaults ───────────────────────────
#define DEFAULT_INITIAL_SCORE  1000
#define DEFAULT_BASE_VELOCITY  180

// ─────────────────────── Calibration ────────────────────────────
#define CALIBRATE_INTERVAL_MS  200UL
#define CALIBRATE_DURATION_MS 10000UL

// ─────────────────────── Globals ─────────────────────────────────
AsyncWebServer httpServer(80);
AsyncWebSocket ws("/ws");
Preferences    prefs;

enum GameState { WAITING, RACING, FINISHED };
GameState gameState = WAITING;

int initialScore = DEFAULT_INITIAL_SCORE;
int currentScore = DEFAULT_INITIAL_SCORE;
int baseVelocity = DEFAULT_BASE_VELOCITY;

unsigned long raceStartMs            = 0;
unsigned long offlineAccumMs         = 0;   // cumulative ms spent off-line
unsigned long offlineDeductIntervals = 0;   // intervals already charged

unsigned long lastLoopMs            = 0;
unsigned long lastStateBroadcastMs  = 0;
unsigned long lastDriveCmdMs        = 0;

bool driveEverReceived   = false;  // first drive cmd received this race
bool motorsKilledNoSig   = false;  // safety-kill already fired this race
bool finishTriggered     = false;  // finish-wall already processed

// Calibration
bool          calibrating      = false;
unsigned long calibrateStartMs = 0;
unsigned long lastCalibrateMs  = 0;

// ─────────────────────── Motor helpers ───────────────────────────
void driveMotor(uint8_t in1, uint8_t in2, uint8_t ch, float val) {
    val = constrain(val, -1.0f, 1.0f);
    uint8_t pwm = (uint8_t)(fabsf(val) * 255.0f);
    if (val > 0.0f) {
        digitalWrite(in1, HIGH);
        digitalWrite(in2, LOW);
    } else if (val < 0.0f) {
        digitalWrite(in1, LOW);
        digitalWrite(in2, HIGH);
    } else {
        digitalWrite(in1, LOW);
        digitalWrite(in2, LOW);
        pwm = 0;
    }
    ledcWrite(ch, pwm);
}

void stopMotors() {
    driveMotor(LEFT_IN1,  LEFT_IN2,  LEFT_PWM_CH,  0.0f);
    driveMotor(RIGHT_IN1, RIGHT_IN2, RIGHT_PWM_CH, 0.0f);
}

// ─────────────────────── Sensor read ────────────────────────────
bool readSensors(int out[SENSOR_COUNT]) {
    bool anyOn = false;
    for (int i = 0; i < SENSOR_COUNT; i++) {
        out[i] = digitalRead(SENSOR_PINS[i]);
        if (out[i]) anyOn = true;
    }
    return anyOn;
}

// ─────────────────────── WebSocket broadcast ─────────────────────
void broadcastDoc(StaticJsonDocument<256> &doc) {
    String s;
    serializeJson(doc, s);
    ws.textAll(s);
}

void broadcastState(int sensors[SENSOR_COUNT], bool onLine, unsigned long elapsed) {
    StaticJsonDocument<256> doc;
    doc["type"]   = "state";
    doc["score"]  = currentScore;
    doc["onLine"] = onLine;
    doc["elapsed"] = elapsed;
    JsonArray arr = doc.createNestedArray("sensors");
    for (int i = 0; i < SENSOR_COUNT; i++) arr.add(sensors[i]);
    broadcastDoc(doc);
}

// ─────────────────────── Time bonus ──────────────────────────────
int calcTimeBonus(unsigned long elapsedMs) {
    return max(0, 500 - (int)(elapsedMs / 1000UL) * 10);
}

// ─────────────────────── Race reset ──────────────────────────────
void resetRace() {
    gameState             = WAITING;
    currentScore          = initialScore;
    offlineAccumMs        = 0;
    offlineDeductIntervals = 0;
    driveEverReceived     = false;
    motorsKilledNoSig     = false;
    finishTriggered       = false;
    stopMotors();
}

// ─────────────────────── WebSocket handler ───────────────────────
void onWsEvent(AsyncWebSocket *srv, AsyncWebSocketClient *client,
               AwsEventType type, void *arg, uint8_t *data, size_t len)
{
    if (type != WS_EVT_DATA) return;
    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    // Accept only complete, single-frame text messages
    if (!info->final || info->index != 0 || info->len != len) return;
    if (info->opcode != WS_TEXT) return;

    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, data, len) != DeserializationError::Ok) return;

    const char *t = doc["type"] | "";

    if (strcmp(t, "drive") == 0) {
        if (gameState == RACING) {
            float l = constrain((float)(doc["left"]  | 0.0), -1.0f, 1.0f);
            float r = constrain((float)(doc["right"] | 0.0), -1.0f, 1.0f);
            driveMotor(LEFT_IN1,  LEFT_IN2,  LEFT_PWM_CH,  l);
            driveMotor(RIGHT_IN1, RIGHT_IN2, RIGHT_PWM_CH, r);
            lastDriveCmdMs    = millis();
            driveEverReceived = true;
            motorsKilledNoSig = false;  // driver reconnected — re-arm kill
        }

    } else if (strcmp(t, "cmd") == 0) {
        const char *action = doc["action"] | "";
        if (strcmp(action, "start") == 0 && gameState == WAITING) {
            gameState             = RACING;
            raceStartMs           = millis();
            lastLoopMs            = raceStartMs;
            offlineAccumMs        = 0;
            offlineDeductIntervals = 0;
            currentScore          = initialScore;
            driveEverReceived     = false;
            motorsKilledNoSig     = false;
            finishTriggered       = false;
            lastDriveCmdMs        = millis();  // grace period before kill
        } else if (strcmp(action, "stop") == 0) {
            gameState = FINISHED;
            stopMotors();
        } else if (strcmp(action, "reset") == 0) {
            resetRace();
        }

    } else if (strcmp(t, "config") == 0) {
        if (doc.containsKey("baseVelocity")) {
            baseVelocity = (int)doc["baseVelocity"];
            prefs.putInt("baseVelocity", baseVelocity);
        }
        if (doc.containsKey("initialScore")) {
            initialScore = (int)doc["initialScore"];
            prefs.putInt("initialScore", initialScore);
        }
    }
}

// ─────────────────────── Setup ───────────────────────────────────
void setup() {
    Serial.begin(115200);

    // Persistent config (survives reboot)
    prefs.begin("robot", false);
    baseVelocity = prefs.getInt("baseVelocity", DEFAULT_BASE_VELOCITY);
    initialScore = prefs.getInt("initialScore", DEFAULT_INITIAL_SCORE);
    currentScore = initialScore;

    // Motor output pins
    pinMode(LEFT_IN1,  OUTPUT);
    pinMode(LEFT_IN2,  OUTPUT);
    pinMode(RIGHT_IN1, OUTPUT);
    pinMode(RIGHT_IN2, OUTPUT);
    ledcSetup(LEFT_PWM_CH,  PWM_FREQ, PWM_RES_BITS);
    ledcSetup(RIGHT_PWM_CH, PWM_FREQ, PWM_RES_BITS);
    ledcAttachPin(LEFT_PWM_PIN,  LEFT_PWM_CH);
    ledcAttachPin(RIGHT_PWM_PIN, RIGHT_PWM_CH);
    stopMotors();

    // IR sensor DO pins
    for (int i = 0; i < SENSOR_COUNT; i++) pinMode(SENSOR_PINS[i], INPUT);

    // Finish wall — HC-SR04 ultrasonic
    pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
    pinMode(ULTRASONIC_ECHO_PIN, INPUT);

    // WiFi Access Point
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(
        IPAddress(192, 168, 4, 1),
        IPAddress(192, 168, 4, 1),
        IPAddress(255, 255, 255, 0)
    );
    WiFi.softAP(AP_SSID, AP_PASS);
    Serial.printf("[WiFi] AP ready — SSID: %s  IP: %s\n",
                  AP_SSID, WiFi.softAPIP().toString().c_str());

    // HTTP + WebSocket
    ws.onEvent(onWsEvent);
    httpServer.addHandler(&ws);

    // /calibrate — prints raw ADC values to Serial for 10 s
    httpServer.on("/calibrate", HTTP_GET, [](AsyncWebServerRequest *req) {
        // Always restart calibration on each request
        calibrating      = true;
        calibrateStartMs = millis();
        lastCalibrateMs  = millis() - CALIBRATE_INTERVAL_MS;
        Serial.println("[CAL] Calibration started.");
        req->send(200, "text/plain",
                  "Calibration started (10 s). Open Serial monitor for raw ADC readings.\n");
    });

    httpServer.begin();
    Serial.println("[HTTP] Server ready on port 80");

    lastLoopMs = millis();
}

// ─────────────────────── Loop ────────────────────────────────────
void loop() {
    ws.cleanupClients();

    unsigned long now   = millis();
    unsigned long delta = now - lastLoopMs;
    lastLoopMs          = now;

    int  sensors[SENSOR_COUNT];
    bool onLine = readSensors(sensors);

    // ── Calibration (streams raw ADC to Serial) ───────────────────
    if (calibrating) {
        if (now - calibrateStartMs >= CALIBRATE_DURATION_MS) {
            calibrating = false;
            Serial.println("[CAL] Calibration done.");
        } else if (now - lastCalibrateMs >= CALIBRATE_INTERVAL_MS) {
            lastCalibrateMs = now;
            Serial.print("[CAL] ");
            for (int i = 0; i < SENSOR_COUNT; i++) {
                Serial.printf("GPIO%d=%d  ", SENSOR_PINS[i], digitalRead(SENSOR_PINS[i]));
            }
            Serial.println();
        }
    }

    if (gameState != RACING) return;

    unsigned long elapsed = now - raceStartMs;

    // ── No-signal motor kill (Phase 5 safety) ────────────────────
    if (driveEverReceived && !motorsKilledNoSig &&
        (now - lastDriveCmdMs >= NO_SIGNAL_KILL_MS)) {
        stopMotors();
        motorsKilledNoSig = true;
        StaticJsonDocument<256> doc;
        doc["type"]   = "warning";
        doc["reason"] = "no_signal";
        broadcastDoc(doc);
    }

    // ── Off-line time accumulation & scoring ──────────────────────
    if (!onLine) {
        offlineAccumMs += delta;

        // Deduct 1 point per OFFLINE_DEDUCT_MS of cumulative offline time
        unsigned long intervals = offlineAccumMs / OFFLINE_DEDUCT_MS;
        if (intervals > offlineDeductIntervals) {
            int toDeduct          = (int)(intervals - offlineDeductIntervals);
            currentScore          = max(0, currentScore - toDeduct);
            offlineDeductIntervals = intervals;
        }

        // Elimination: 5 s cumulative offline
        if (offlineAccumMs >= ELIMINATION_MS) {
            stopMotors();
            gameState = FINISHED;
            StaticJsonDocument<256> doc;
            doc["type"] = "eliminated";
            broadcastDoc(doc);
            return;
        }
    }

    // ── Finish wall trigger (HC-SR04) ────────────────────────────
    // Fire a 10 µs trigger pulse
    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
    // Measure echo pulse width; convert to cm (speed of sound: 29.1 µs/cm one-way)
    unsigned long echoUs = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, ULTRASONIC_TIMEOUT_US);
    float distanceCm = (echoUs == 0) ? 999.0f : (echoUs / 2.0f / 29.1f);

    if (!finishTriggered && distanceCm > 0 && distanceCm <= FINISH_DISTANCE_CM) {
        finishTriggered = true;
        stopMotors();
        gameState      = FINISHED;
        int bonus      = calcTimeBonus(elapsed);
        StaticJsonDocument<256> doc;
        doc["type"]      = "finished";
        doc["score"]     = currentScore;
        doc["elapsed"]   = elapsed;
        doc["timeBonus"] = bonus;
        broadcastDoc(doc);
        return;
    }

    // ── Periodic state broadcast ──────────────────────────────────
    if (now - lastStateBroadcastMs >= STATE_BROADCAST_MS) {
        lastStateBroadcastMs = now;
        broadcastState(sensors, onLine, elapsed);
    }
}
