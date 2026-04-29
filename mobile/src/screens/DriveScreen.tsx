import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
  GestureResponderEvent,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList }  from '../types/navigation';
import { Joystick }            from '../components/Joystick';
import { ESP32_WS_URL, DRIVE_INTERVAL_MS, STORAGE_RACE_RESULT, DEV_MODE, C } from '../constants';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Drive'>;
type Route = RouteProp<RootStackParamList, 'Drive'>;

type WsStatus = 'connecting' | 'connected' | 'error' | 'dev';
type Overlay  = null | 'eliminated' | 'finished';

interface RaceResult {
  raceId:     number;
  name:       string;
  score:      number;
  time_ms:    number;
  time_bonus: number;
  eliminated: boolean;
  posted:     boolean;
}

function formatTime(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m      = Math.floor(totalS / 60);
  const s      = totalS % 60;
  const tenth  = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
}

export function DriveScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { name, raceId } = route.params;

  // ── Display state ───────────────────────────────────────────────
  const [score,    setScore]    = useState(1000);
  const [elapsed,  setElapsed]  = useState(0);
  const [sensors,  setSensors]  = useState([0, 0, 0, 0, 0]);
  const [wsStatus, setWsStatus] = useState<WsStatus>(DEV_MODE ? 'dev' : 'connecting');
  const [overlay,  setOverlay]  = useState<Overlay>(null);
  const [warning,  setWarning]  = useState('');

  // ── Finish data for overlay ─────────────────────────────────────
  const [finishScore,  setFinishScore]  = useState(0);
  const [finishBonus,  setFinishBonus]  = useState(0);
  const [finishTimeMs, setFinishTimeMs] = useState(0);

  // ── Score flash animation (Phase 5) ────────────────────────────
  const scoreFlash    = useRef(new Animated.Value(0)).current;
  const prevScoreRef  = useRef(1000);

  // ── Drive values (refs — no re-render overhead) ─────────────────
  const leftYRef  = useRef(0);
  const rightXRef = useRef(0);
  const rightYRef = useRef(0);

  // ── Multi-touch routing (single capture zone) ────────────────────
  // Each joystick has its own Animated pan for display
  const leftPan  = useRef(new Animated.ValueXY()).current;
  const rightPan = useRef(new Animated.ValueXY()).current;

  // Maps finger identifier → which joystick it owns
  const touchSide   = useRef(new Map<string, 'left' | 'right'>());
  // Maps finger identifier → origin position when touch started
  const touchOrigin = useRef(new Map<string, { x: number; y: number }>());

  // Joystick physical constants (must match Joystick.tsx defaults)
  const JSIZE = 150;
  const JTHUMB = 52;
  const JMAX  = JSIZE / 2 - JTHUMB / 2; // max thumb offset in px

  // ── Stable refs for closures ────────────────────────────────────
  const wsRef            = useRef<WebSocket | null>(null);
  const driveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef       = useRef(0);
  const raceResultRef    = useRef<RaceResult | null>(null);

  // ── Lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (DEV_MODE) {
      startDriveLoop(); // no WS in dev — still run loop so logs are visible
    } else {
      connectEsp32();
    }
    return () => {
      driveIntervalRef.current && clearInterval(driveIntervalRef.current);
      wsRef.current?.close();
    };
  }, []);

  // ── WebSocket connection ─────────────────────────────────────────
  function connectEsp32() {
    setWsStatus('connecting');
    const ws = new WebSocket(ESP32_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[DriveScreen] WS connected to ESP32');
      setWsStatus('connected');
      const startCmd = JSON.stringify({ type: 'cmd', action: 'start' });
      console.log('[DriveScreen] → send:', startCmd);
      ws.send(startCmd);
      startDriveLoop();
    };

    ws.onmessage = (e) => {
      try { handleMessage(JSON.parse(e.data as string)); } catch { /* ignore */ }
    };

    ws.onerror = (e) => { console.warn('[DriveScreen] WS error', e); setWsStatus('error'); };

    ws.onclose = () => {
      console.log('[DriveScreen] WS closed');
      driveIntervalRef.current && clearInterval(driveIntervalRef.current);
      driveIntervalRef.current = null;
    };
  }

  // ── 50 ms drive loop ─────────────────────────────────────────────
  function startDriveLoop() {
    driveIntervalRef.current = setInterval(() => {
      if (!DEV_MODE && wsRef.current?.readyState !== WebSocket.OPEN) return;

      // Left Y = proportional speed (-1 to +1). Right X = steer (-1 to +1).
      // Tank mixing: outer wheel holds speed, inner wheel scales down.
      // Steering is naturally gated — when velocity=0 both outputs are 0.
      const velocity = leftYRef.current;           // proportional: push = faster
      const steer    = rightXRef.current;          // X-axis only

      const left  = Math.max(-1, Math.min(1, velocity * (1 + steer)));
      const right = Math.max(-1, Math.min(1, velocity * (1 - steer)));

      const driveCmd = JSON.stringify({ type: 'drive', left, right });
      console.log(`[Joystick Input]  leftY=${velocity.toFixed(2)}  rightX=${steer.toFixed(2)}`);
      console.log(`[ESP32 →] ${driveCmd}`);
      if (!DEV_MODE && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(driveCmd);
      }
    }, DRIVE_INTERVAL_MS);
  }

  // ── Incoming message handler ─────────────────────────────────────
  function handleMessage(msg: Record<string, unknown>) {
    console.log('[DriveScreen] ← recv:', msg.type, msg);
    switch (msg.type) {
      case 'state': {
        const newScore = (msg.score as number) ?? 0;

        if (newScore < prevScoreRef.current) {
          // Brief red flash on score deduction (Phase 5)
          Animated.sequence([
            Animated.timing(scoreFlash, { toValue: 1, duration: 80,  useNativeDriver: false }),
            Animated.timing(scoreFlash, { toValue: 0, duration: 320, useNativeDriver: false }),
          ]).start();
        }
        prevScoreRef.current = newScore;

        const ms = (msg.elapsed as number) ?? 0;
        elapsedRef.current = ms;

        setScore(newScore);
        setElapsed(ms);
        setSensors((msg.sensors as number[]) ?? [0, 0, 0, 0, 0]);
        break;
      }

      case 'eliminated': {
        stopDriveLoop();
        const result: RaceResult = {
          raceId,
          name,
          score:      prevScoreRef.current,
          time_ms:    elapsedRef.current,
          time_bonus: 0,
          eliminated: true,
          posted:     false,
        };
        raceResultRef.current = result;
        persistResult(result);
        setOverlay('eliminated');
        break;
      }

      case 'finished': {
        stopDriveLoop();
        const s     = (msg.score     as number) ?? 0;
        const t     = (msg.elapsed   as number) ?? elapsedRef.current;
        const bonus = (msg.timeBonus as number) ?? 0;
        const result: RaceResult = {
          raceId,
          name,
          score:      s,
          time_ms:    t,
          time_bonus: bonus,
          eliminated: false,
          posted:     false,
        };
        raceResultRef.current = result;
        persistResult(result);
        setFinishScore(s);
        setFinishBonus(bonus);
        setFinishTimeMs(t);
        setOverlay('finished');
        break;
      }

      case 'warning': {
        if ((msg.reason as string) === 'no_signal') {
          setWarning('Signal lost — motors stopped');
          setTimeout(() => setWarning(''), 3000);
        }
        break;
      }
    }
  }

  function stopDriveLoop() {
    driveIntervalRef.current && clearInterval(driveIntervalRef.current);
    driveIntervalRef.current = null;
  }

  async function persistResult(result: RaceResult) {
    await AsyncStorage.setItem(STORAGE_RACE_RESULT, JSON.stringify(result));
  }

  function goToResults() {
    console.log('[DriveScreen] Navigating to ResultsScreen', raceResultRef.current);
    const r = raceResultRef.current;
    navigation.replace('Results', {
      name,
      raceId,
      score:      r?.score      ?? 0,
      time_ms:    r?.time_ms    ?? 0,
      time_bonus: r?.time_bonus ?? 0,
      eliminated: r?.eliminated ?? false,
    });
  }

  // ── Multi-touch handlers (route by screen half) ──────────────────
  function onAreaTouchStart(e: GestureResponderEvent) {
    const sw = Dimensions.get('window').width;
    for (const t of e.nativeEvent.changedTouches) {
      const side: 'left' | 'right' = t.pageX < sw / 2 ? 'left' : 'right';
      // One finger per side — ignore extras
      const alreadyOwned = [...touchSide.current.values()].includes(side);
      if (alreadyOwned) continue;
      touchSide.current.set(t.identifier, side);
      touchOrigin.current.set(t.identifier, { x: t.pageX, y: t.pageY });
    }
  }

  function onAreaTouchMove(e: GestureResponderEvent) {
    for (const t of e.nativeEvent.changedTouches) {
      const side   = touchSide.current.get(t.identifier);
      const origin = touchOrigin.current.get(t.identifier);
      if (!side || !origin) continue;

      // Left joystick: Y axis only (speed, proportional).
      // Right joystick: X axis only (steer). dy locked to 0.
      let dx = side === 'left' ? 0 : (t.pageX - origin.x);
      let dy = side === 'right' ? 0 : (t.pageY - origin.y);

      const dist = Math.hypot(dx, dy);
      if (dist > JMAX) { dx = (dx / dist) * JMAX; dy = (dy / dist) * JMAX; }

      const ny = -(dy / JMAX); // up = +1
      const nx =   dx / JMAX;  // right = +1

      if (side === 'left') {
        leftPan.setValue({ x: 0, y: dy });
        leftYRef.current = ny;
        console.log(`[Touch] LEFT  y=${ny.toFixed(2)}`);
      } else {
        rightPan.setValue({ x: dx, y: 0 });
        rightXRef.current = nx;
        console.log(`[Touch] RIGHT x=${nx.toFixed(2)}`);
      }
    }
  }

  function onAreaTouchEnd(e: GestureResponderEvent) {
    for (const t of e.nativeEvent.changedTouches) {
      const side = touchSide.current.get(t.identifier);
      touchSide.current.delete(t.identifier);
      touchOrigin.current.delete(t.identifier);
      // Only zero out if no other finger is still on this side
      const sideStillActive = [...touchSide.current.values()].includes(side!);
      if (!sideStillActive) {
        if (side === 'left') {
          leftYRef.current = 0;
          Animated.spring(leftPan,  { toValue: { x:0,y:0 }, useNativeDriver: false, friction:6, tension:100 }).start();
        } else if (side === 'right') {
          rightXRef.current = 0;
          rightYRef.current = 0;
          Animated.spring(rightPan, { toValue: { x:0,y:0 }, useNativeDriver: false, friction:6, tension:100 }).start();
        }
      }
    }
  }

  // ── Score text colour animation ──────────────────────────────────
  const scoreColor = scoreFlash.interpolate({
    inputRange:  [0, 1],
    outputRange: [C.white, C.red],
  });

  // ── Render (landscape: L-joystick | center | R-joystick) ─────────
  return (
    <View style={styles.container}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.nameText} numberOfLines={1}>{name}</Text>

        {/* WS / warning status */}
        {wsStatus === 'dev' ? (
          <Text style={[styles.statusPill, styles.pillDev]}>⚡ DEV</Text>
        ) : wsStatus !== 'connected' ? (
          <Text style={[styles.statusPill, wsStatus === 'error' ? styles.pillError : styles.pillWarn]}>
            {wsStatus === 'connecting' ? 'Connecting…' : 'No connection'}
          </Text>
        ) : !!warning ? (
          <Text style={[styles.statusPill, styles.pillWarn]}>{warning}</Text>
        ) : (
          <Text style={[styles.statusPill, styles.pillOk]}>● LIVE</Text>
        )}

        <Text style={styles.elapsedText}>{formatTime(elapsed)}</Text>
        <TouchableOpacity style={styles.exitBtn} onPress={() => navigation.replace('Home' as any)}>
          <Text style={styles.exitBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Main area: single touch capture zone ─────────────────── */}
      <View
        style={styles.mainArea}
        onTouchStart={onAreaTouchStart}
        onTouchMove={onAreaTouchMove}
        onTouchEnd={onAreaTouchEnd}
        onTouchCancel={onAreaTouchEnd}
      >

        {/* Left joystick — Speed (Y axis, display only) */}
        <View style={styles.stickPanel}>
          <Text style={styles.stickLabel}>SPEED</Text>
          <Joystick size={150} pan={leftPan} />
          <Text style={styles.stickHint}>↑ forward</Text>
        </View>

        {/* Center — score + sensors */}
        <View style={styles.centerPanel}>
          <Animated.Text style={[styles.scoreText, { color: scoreColor }]}>
            {score}
          </Animated.Text>
          <Text style={styles.scoreLabel}>SCORE</Text>

          <View style={styles.sensorBar}>
            {sensors.map((s, i) => (
              <View key={i} style={[styles.sensorDot, s ? styles.sensorOn : styles.sensorOff]} />
            ))}
          </View>
          <Text style={styles.sensorLabel}>IR SENSORS</Text>
        </View>

        {/* Right joystick — Steer (free 2-D, display only) */}
        <View style={styles.stickPanel}>
          <Text style={styles.stickLabel}>STEER</Text>
          <Joystick size={150} pan={rightPan} />
          <Text style={styles.stickHint}>← steer →</Text>
        </View>

      </View>

      {/* ── Eliminated overlay ──────────────────────────────────── */}
      <Modal visible={overlay === 'eliminated'} transparent animationType="fade">
        <View style={styles.overlayBg}>
          <View style={styles.overlayCard}>
            <Text style={[styles.overlayTitle, { color: C.red }]}>Eliminated</Text>
            <Text style={styles.overlayBody}>Robot was off-line for 5 seconds</Text>
            <View style={styles.overlayStats}>
              <Text style={styles.overlayStat}>Score: <Text style={styles.overlayVal}>{raceResultRef.current?.score ?? 0}</Text></Text>
              <Text style={styles.overlayStat}>Time: <Text style={styles.overlayVal}>{formatTime(raceResultRef.current?.time_ms ?? 0)}</Text></Text>
            </View>
            <TouchableOpacity style={styles.overlayBtn} onPress={goToResults}>
              <Text style={styles.overlayBtnText}>View Results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Finished overlay ────────────────────────────────────── */}
      <Modal visible={overlay === 'finished'} transparent animationType="fade">
        <View style={styles.overlayBg}>
          <View style={styles.overlayCard}>
            <Text style={[styles.overlayTitle, { color: C.green }]}>Finished!</Text>
            <View style={styles.overlayStats}>
              <Text style={styles.overlayStat}>Score: <Text style={styles.overlayVal}>{finishScore}</Text></Text>
              <Text style={styles.overlayStat}>Bonus: <Text style={styles.overlayVal}>+{finishBonus}</Text></Text>
              <Text style={[styles.overlayStat, { color: C.primary, fontSize: 20 }]}>
                Final: <Text style={{ fontWeight: 'bold' }}>{finishScore + finishBonus}</Text>
              </Text>
              <Text style={styles.overlayStat}>Time: <Text style={styles.overlayVal}>{formatTime(finishTimeMs)}</Text></Text>
            </View>
            <TouchableOpacity style={styles.overlayBtn} onPress={goToResults}>
              <Text style={styles.overlayBtnText}>View Results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    flexDirection: 'column',
  },

  // ── Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  nameText: {
    flex: 1,
    color: C.mutedLight,
    fontSize: 14,
  },
  elapsedText: {
    flex: 1,
    color: C.mutedLight,
    fontSize: 14,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },
  pillOk:   { backgroundColor: C.greenDim,  color: C.green },
  pillWarn: { backgroundColor: '#2a2000',    color: C.amber },
  pillError:{ backgroundColor: C.redDim,    color: C.red   },
  pillDev:  { backgroundColor: '#1a1000',    color: C.amber },
  exitBtn: {
    marginLeft: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  exitBtnText: {
    color: C.mutedLight,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Main area
  mainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  // ── Stick panels
  stickPanel: {
    alignItems: 'center',
    gap: 8,
    flex: 0,
  },
  stickLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
  },
  stickHint: {
    color: C.muted,
    fontSize: 11,
  },

  // ── Center panel
  centerPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  scoreText: {
    fontSize: 72,
    fontWeight: 'bold',
    lineHeight: 80,
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 12,
  },
  sensorBar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  sensorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  sensorOn:  { backgroundColor: C.green,   borderColor: '#00a050' },
  sensorOff: { backgroundColor: C.surface, borderColor: C.border  },
  sensorLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 4,
  },

  // ── Overlays
  overlayBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    minWidth: 320,
    borderWidth: 1,
    borderColor: C.border,
  },
  overlayTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  overlayBody: {
    color: C.muted,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  overlayStats: {
    gap: 4,
    alignItems: 'center',
    marginBottom: 16,
  },
  overlayStat: {
    color: C.mutedLight,
    fontSize: 16,
  },
  overlayVal: {
    color: C.white,
    fontWeight: '600',
  },
  overlayBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 28,
  },
  overlayBtnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: '700',
  },
});
