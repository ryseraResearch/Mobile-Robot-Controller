import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../types/navigation';
import { BACKEND_BASE_URL, DEV_MODE, C } from '../constants';

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type Route = RouteProp<RootStackParamList, 'Results'>;

function formatTime(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m      = Math.floor(totalS / 60);
  const s      = totalS % 60;
  const tenth  = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
}

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

function StatRow({ icon, label, value }: { icon: FeatherIconName; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Feather name={icon} size={13} color={C.muted} style={{ marginRight: 8 }} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
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
    setPosting(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/race/${raceId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, time_ms, time_bonus, eliminated }),
      });
      if (!res.ok) throw new Error('server_error');
      setPosted(true);
    } catch {
      setError('Could not reach backend. Tap Retry.');
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
        <View style={[styles.iconRing, eliminated && styles.iconRingElim]}>
          <Feather
            name={eliminated ? 'x-circle' : 'award'}
            size={56}
            color={C.primary}
          />
        </View>
        <Text style={styles.statusLabel}>
          {eliminated ? 'ELIMINATED' : 'RACE COMPLETE'}
        </Text>
        <Text style={styles.nameText}>{name}</Text>
        {!eliminated && (
          <View style={styles.tagRow}>
            <Feather name="check-circle" size={12} color={C.green} style={{ marginRight: 4 }} />
            <Text style={styles.tagText}>Crossed the finish line</Text>
          </View>
        )}
        {eliminated && (
          <View style={styles.tagRow}>
            <Feather name="alert-triangle" size={12} color={C.amber} style={{ marginRight: 4 }} />
            <Text style={[styles.tagText, { color: C.amber }]}>Left the track for 5 s</Text>
          </View>
        )}
        {DEV_MODE && <Text style={styles.devBadge}>DEV — not submitted</Text>}
      </View>

      {/* Right â€” stats + buttons */}
      <View style={styles.rightPanel}>
        <View style={styles.heroBlock}>
          <Text style={styles.heroNumber}>{eliminated ? '0' : String(finalScore)}</Text>
          <Text style={styles.heroLabel}>FINAL SCORE</Text>
        </View>

        <View style={styles.card}>
          <StatRow icon="zap"   label="Race Score" value={String(score)} />
          {!eliminated && <StatRow icon="star"  label="Time Bonus"  value={`+${time_bonus}`} />}
          <View style={styles.divider} />
          <StatRow icon="clock" label="Race Time"  value={formatTime(time_ms)} />
        </View>

        {posting && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={C.primary} size="small" style={{ marginRight: 6 }} />
            <Text style={styles.statusText}>Saving to leaderboard…</Text>
          </View>
        )}
        {posted && !error && !DEV_MODE && (
          <View style={styles.statusRow}>
            <Feather name="check-circle" size={13} color={C.green} style={{ marginRight: 6 }} />
            <Text style={[styles.statusText, { color: C.green }]}>Saved to leaderboard</Text>
          </View>
        )}
        {!!error && (
          <View style={styles.errorBlock}>
            <View style={styles.statusRow}>
              <Feather name="alert-circle" size={13} color={C.red} style={{ marginRight: 6 }} />
              <Text style={[styles.statusText, { color: C.red }]}>{error}</Text>
            </View>
            <TouchableOpacity style={styles.retryBtn} onPress={submitResult}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.homeBtn} onPress={goHome}>
          <Feather name="home" size={15} color={C.bg} style={{ marginRight: 8 }} />
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
  iconRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  iconRingElim: {
    borderColor: C.red,
    shadowColor: C.red,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: C.primary,
    letterSpacing: 4,
    marginTop: 2,
  },
  nameText: {
    fontSize: 22,
    fontWeight: '700',
    color: C.white,
    textAlign: 'center',
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  tagText: {
    color: C.mutedLight,
    fontSize: 12,
  },
  devBadge: {
    color: C.amber,
    fontSize: 11,
    marginTop: 6,
  },
  rightPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: 4,
  },
  heroNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: C.primary,
    lineHeight: 70,
    letterSpacing: -2,
    textShadowColor: C.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    fontVariant: ['tabular-nums'] as any,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 4,
    marginTop: 2,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: C.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: {
    color: C.mutedLight,
    fontSize: 14,
  },
  rowValue: {
    color: C.white,
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: C.mutedLight,
  },
  errorBlock: {
    alignItems: 'center',
    gap: 6,
  },
  retryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.primary,
  },
  retryText: {
    color: C.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  homeBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 300,
    marginTop: 2,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  homeBtnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

