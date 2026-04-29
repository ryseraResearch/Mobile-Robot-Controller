import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../types/navigation';
import { BACKEND_BASE_URL, STORAGE_RACE_RESULT, DEV_MODE, C } from '../constants';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type Route = RouteProp<RootStackParamList, 'Results'>;

function formatTime(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m      = Math.floor(totalS / 60);
  const s      = totalS % 60;
  const tenth  = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowHighlight]}>{value}</Text>
    </View>
  );
}

export function ResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { name, raceId, score, time_ms, time_bonus, eliminated } = route.params;

  const [posting, setPosting] = useState(false);
  const [posted,  setPosted]  = useState(false);
  const [error,   setError]   = useState('');

  const finalScore = eliminated ? 0 : score + time_bonus;

  useEffect(() => {
    if (DEV_MODE || raceId === -1) {
      setPosted(true); // skip backend in dev mode
      return;
    }
    submitResult();
  }, []);

  async function submitResult() {
    const stored = await AsyncStorage.getItem(STORAGE_RACE_RESULT);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.posted) { setPosted(true); return; }
    }

    setPosting(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/race/${raceId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, time_ms, time_bonus, eliminated }),
      });
      if (!res.ok) throw new Error('server_error');
      if (stored) {
        await AsyncStorage.setItem(
          STORAGE_RACE_RESULT,
          JSON.stringify({ ...JSON.parse(stored), posted: true })
        );
      }
      setPosted(true);
    } catch {
      setError('Could not submit result.\nReconnect to home WiFi and tap Retry.');
    } finally {
      setPosting(false);
    }
  }

  function goHome() {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  // â”€â”€ Landscape: left column (identity) | right column (stats + actions)
  return (
    <View style={styles.container}>

      {/* Left â€” identity */}
      <View style={styles.leftPanel}>
        <Text style={styles.title}>{eliminated ? 'Race Over' : 'Race Complete!'}</Text>
        <Text style={styles.nameText}>{name}</Text>
        {eliminated && <Text style={styles.eliminatedBadge}>ELIMINATED</Text>}
        {DEV_MODE && <Text style={styles.devBadge}>DEV MODE â€” not submitted</Text>}
      </View>

      {/* Right â€” stats + buttons */}
      <View style={styles.rightPanel}>
        <View style={styles.card}>
          <StatRow label="Score"      value={String(score)} />
          {!eliminated && <StatRow label="Time Bonus" value={`+${time_bonus}`} />}
          <View style={styles.divider} />
          <StatRow label="Final Score" value={String(finalScore)} highlight />
          <StatRow label="Time"        value={formatTime(time_ms)} />
        </View>

        {/* Submission status */}
        {posting && <ActivityIndicator color={C.primary} size="small" style={{ marginTop: 10 }} />}
        {posted && !error && !DEV_MODE && (
          <Text style={styles.postedText}>âœ“ Saved to leaderboard</Text>
        )}
        {!!error && (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={submitResult}>
              <Text style={styles.retryText}>Retry Submission</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.homeBtn} onPress={goHome}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: C.white,
    textAlign: 'center',
  },
  nameText: {
    fontSize: 18,
    color: C.primary,
    textAlign: 'center',
  },
  eliminatedBadge: {
    backgroundColor: C.redDim,
    color: C.red,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  devBadge: {
    color: C.amber,
    fontSize: 11,
    marginTop: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: C.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    color: C.mutedLight,
    fontSize: 15,
  },
  rowValue: {
    color: C.white,
    fontSize: 15,
    fontWeight: '500',
  },
  rowHighlight: {
    color: C.primary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 6,
  },
  postedText: {
    color: C.green,
    fontSize: 13,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.primary,
  },
  retryText: {
    color: C.primary,
    fontSize: 14,
  },
  homeBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 4,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  homeBtnText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '700',
  },
});
