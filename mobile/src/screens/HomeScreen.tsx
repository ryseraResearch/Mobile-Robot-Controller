import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../types/navigation';
import { BACKEND_BASE_URL, STORAGE_NAME, STORAGE_RACE_ID, DEV_MODE, C } from '../constants';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Home'>;
type Phase = 'form' | 'waiting_wifi' | 'countdown';

export function HomeScreen() {
  const navigation = useNavigation<Nav>();

  const [name,      setName]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [phase,     setPhase]     = useState<Phase>('form');
  const [countdown, setCountdown] = useState(0);

  const raceIdRef      = useRef(0);
  const nameRef        = useRef('');
  const wsRef          = useRef<WebSocket | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      countdownTimer.current && clearInterval(countdownTimer.current);
    };
  }, []);

  // â”€â”€ Dev bypass: skip backend + WiFi screen, go straight to Drive â”€
  function handleDevSkip() {
    const trimmed = name.trim() || 'Dev Player';
    raceIdRef.current = -1;
    nameRef.current   = trimmed;
    console.log('[HomeScreen] DEV skip â€” going straight to Drive');
    navigation.replace('Drive', { name: trimmed, raceId: -1 });
  }

  async function handleReady() {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (DEV_MODE) {
      // In dev mode, skip backend and just go to WiFi screen
      raceIdRef.current = Date.now();
      nameRef.current   = trimmed;
      setPhase('waiting_wifi');
      return;
    }

    console.log(`[HomeScreen] Ready pressed â€” name="${trimmed}"`);
    setLoading(true);
    try {
      console.log(`[HomeScreen] POST ${BACKEND_BASE_URL}/api/race/start`);
      const res = await fetch(`${BACKEND_BASE_URL}/api/race/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error('server_error');
      const data = await res.json();
      console.log(`[HomeScreen] Race registered â€” raceId=${data.raceId}`);

      raceIdRef.current = data.raceId;
      nameRef.current   = trimmed;

      await AsyncStorage.multiSet([
        [STORAGE_NAME,    trimmed],
        [STORAGE_RACE_ID, String(data.raceId)],
      ]);

      connectBackendWs();
      setPhase('waiting_wifi');
    } catch (err) {
      console.warn('[HomeScreen] Backend unreachable:', err);
      Alert.alert(
        'Cannot reach backend',
        `Check the server is running.\n\nURL: ${BACKEND_BASE_URL}\n\nTip: set DEV_MODE=true in constants.ts to bypass this.`
      );
    } finally {
      setLoading(false);
    }
  }

  function connectBackendWs() {
    try {
      const wsUrl = BACKEND_BASE_URL.replace(/^http/, 'ws') + '/ws';
      const ws    = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === 'countdown') startCountdown(msg.seconds ?? 3);
        } catch { /* ignore */ }
      };
    } catch { /* optional */ }
  }

  function startCountdown(seconds: number) {
    let remaining = seconds;
    setCountdown(remaining);
    setPhase('countdown');
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        countdownTimer.current && clearInterval(countdownTimer.current);
        navigateToDrive();
      }
    }, 1000);
  }

  function navigateToDrive() {
    console.log('[HomeScreen] Navigating to DriveScreen');
    wsRef.current?.close();
    navigation.replace('Drive', {
      name:   nameRef.current || name.trim(),
      raceId: raceIdRef.current,
    });
  }

  // â”€â”€ Countdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === 'countdown') {
    return (
      <View style={[styles.container, styles.centerFull]}>
        <Text style={styles.countdownLabel}>Race starting in</Text>
        <Text style={styles.countdownNumber}>{countdown}</Text>
      </View>
    );
  }

  // â”€â”€ WiFi instruction (landscape: two columns) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === 'waiting_wifi') {
    return (
      <View style={styles.container}>
        <View style={styles.leftPanel}>
          <Text style={styles.title}>Almost ready!</Text>
          {DEV_MODE && <Text style={styles.devBadge}>DEV MODE</Text>}
          <Text style={styles.wifiInstruction}>Connect your phone to:</Text>
          <Text style={styles.wifiSsid}>LineFollower</Text>
          <Text style={styles.wifiSub}>Password: race1234</Text>
        </View>
        <View style={styles.rightPanel}>
          <Text style={styles.wifiNote}>
            You'll lose internet while on the robot's WiFi.{'\n'}
            Your result is saved locally and submitted afterwards.
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={navigateToDrive}>
            <Text style={styles.btnText}>I'm connected â†’</Text>
          </TouchableOpacity>
          {DEV_MODE && (
            <TouchableOpacity style={styles.btnDev} onPress={handleDevSkip}>
              <Text style={styles.btnDevText}>Skip WiFi (Dev)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // â”€â”€ Entry form (landscape: two columns) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <View style={styles.container}>
      {/* Left â€” branding */}
      <View style={styles.leftPanel}>
        <Text style={styles.logo}>â¬¡</Text>
        <Text style={styles.title}>Line Follower</Text>
        <Text style={styles.subtitle}>School Racing Challenge</Text>
        {DEV_MODE && <Text style={styles.devBadge}>DEV MODE</Text>}
      </View>

      {/* Right â€” form */}
      <View style={styles.rightPanel}>
        <Text style={styles.inputLabel}>COMPETITOR NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor={C.muted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleReady}
          maxLength={32}
        />

        {loading ? (
          <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 16 }} />
        ) : (
          <TouchableOpacity
            style={[styles.btnPrimary, !name.trim() && styles.btnDisabled]}
            onPress={handleReady}
            disabled={!name.trim()}
          >
            <Text style={styles.btnText}>Ready to Race</Text>
          </TouchableOpacity>
        )}

        {DEV_MODE && (
          <TouchableOpacity style={styles.btnDev} onPress={handleDevSkip}>
            <Text style={styles.btnDevText}>âš¡ Skip to Drive (Dev)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: C.bg,
  },
  centerFull: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  rightPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  logo: {
    fontSize: 48,
    marginBottom: 8,
    color: C.primary,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: C.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: C.mutedLight,
    marginTop: 4,
    textAlign: 'center',
  },
  devBadge: {
    marginTop: 10,
    backgroundColor: C.amber,
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  inputLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  input: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 17,
    color: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: C.surface,
  },
  btnText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '700',
  },
  btnDev: {
    borderWidth: 1,
    borderColor: C.amber,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  btnDevText: {
    color: C.amber,
    fontSize: 14,
    fontWeight: '600',
  },
  wifiInstruction: {
    fontSize: 15,
    color: C.mutedLight,
    marginBottom: 4,
    textAlign: 'center',
  },
  wifiSsid: {
    fontSize: 26,
    fontWeight: 'bold',
    color: C.primary,
    marginBottom: 2,
  },
  wifiSub: {
    fontSize: 14,
    color: C.muted,
  },
  wifiNote: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  countdownLabel: {
    fontSize: 18,
    color: C.mutedLight,
    marginBottom: 12,
  },
  countdownNumber: {
    fontSize: 110,
    fontWeight: 'bold',
    color: C.primary,
    lineHeight: 120,
  },
});
