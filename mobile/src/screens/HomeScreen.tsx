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
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../types/navigation';
import { BACKEND_BASE_URL, DEV_MODE, C } from '../constants';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Home'>;
type Phase = 'form' | 'ready' | 'countdown';

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

  async function handleReady() {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (DEV_MODE) {
      raceIdRef.current = Date.now();
      nameRef.current   = trimmed;
      setPhase('ready');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/race/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error('server_error');
      const data = await res.json();

      raceIdRef.current = data.raceId;
      nameRef.current   = trimmed;
      connectBackendWs();
      setPhase('ready');
    } catch (err) {
      console.warn('[HomeScreen] Backend unreachable:', err);
      Alert.alert(
        'Cannot reach backend',
        `Check the server is running.\n\nURL: ${BACKEND_BASE_URL}`
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
    wsRef.current?.close();
    navigation.replace('Drive', {
      name:   nameRef.current || name.trim(),
      raceId: raceIdRef.current,
    });
  }

  // -- Countdown ------------------------------------------------------------
  if (phase === 'countdown') {
    return (
      <View style={[styles.container, styles.centerFull]}>
        <Text style={styles.countdownLabel}>RACE BEGINS IN</Text>
        <Text style={styles.countdownNumber}>{countdown}</Text>
        <Text style={styles.countdownSub}>GET READY!</Text>
      </View>
    );
  }

  // -- Ready ----------------------------------------------------------------
  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.leftPanel}>
          <View style={styles.iconRing}>
            <Feather name="check-circle" size={52} color={C.primary} />
          </View>
          <Text style={styles.lockedLabel}>LOCKED IN</Text>
          <Text style={styles.readyName}>{nameRef.current}</Text>
          {DEV_MODE && <Text style={styles.devBadge}>DEV MODE</Text>}
        </View>
        <View style={styles.rightPanel}>
          <Feather name="radio" size={22} color={C.primary} style={{ marginBottom: 4 }} />
          <Text style={styles.readyHint}>Awaiting race start{'\n'}from the admin...</Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={navigateToDrive}>
            <Feather name="zap" size={16} color={C.bg} style={{ marginRight: 8 }} />
            <Text style={styles.btnText}>Jump In Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -- Entry form -----------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Left - branding */}
      <View style={styles.leftPanel}>
        <View style={styles.iconRing}>
          <Feather name="zap" size={52} color={C.primary} />
        </View>
        <Text style={styles.title}>ROBORACE</Text>
        <View style={styles.titleAccent} />
        <Text style={styles.subtitle}>Mobile Robot Racing</Text>
        {DEV_MODE && <Text style={styles.devBadge}>DEV MODE</Text>}
      </View>

      {/* Right - form */}
      <View style={styles.rightPanel}>
        <Text style={styles.inputLabel}>CALLSIGN</Text>
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
            <Feather name="flag" size={16} color={!name.trim() ? C.muted : C.bg} style={{ marginRight: 8 }} />
            <Text style={[styles.btnText, !name.trim() && styles.btnTextDisabled]}>Join the Race</Text>
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
    gap: 8,
  },
  rightPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 6,
    textAlign: 'center',
    textShadowColor: C.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  titleAccent: {
    width: 48,
    height: 2,
    backgroundColor: C.primary,
    borderRadius: 1,
    marginTop: 2,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  subtitle: {
    fontSize: 13,
    color: C.mutedLight,
    marginTop: 4,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
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
    color: C.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    alignSelf: 'flex-start',
    marginLeft: 4,
    marginBottom: -4,
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
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  btnDisabled: {
    backgroundColor: C.surface,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  btnTextDisabled: {
    color: C.muted,
  },
  readyName: {
    fontSize: 22,
    color: C.white,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  lockedLabel: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 4,
  },
  readyHint: {
    fontSize: 14,
    color: C.mutedLight,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
    marginBottom: 8,
  },
  countdownLabel: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 8,
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: '900',
    color: C.primary,
    lineHeight: 130,
    textShadowColor: C.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  countdownSub: {
    fontSize: 14,
    color: C.mutedLight,
    letterSpacing: 6,
    marginTop: 8,
  },
});
