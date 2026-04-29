import { useState, useEffect, useRef, useCallback } from 'react';
import { BACKEND_BASE_URL, BACKEND_WS_URL } from '../constants';
import type { Competitor } from '../types';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BG = [
  'bg-yellow-900/20 border-yellow-600/30',
  'bg-zinc-700/20 border-zinc-500/30',
  'bg-orange-900/20 border-orange-700/30',
];

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0').slice(0, 1)}`;
}

export function LeaderboardTab() {
  const [rows, setRows]                 = useState<Competitor[]>([]);
  const [wsStatus, setWsStatus]         = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [clearing, setClearing]         = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchLeaderboard = useCallback(() => {
    fetch(`${BACKEND_BASE_URL}/api/leaderboard`)
      .then(r => r.json())
      .then((data: Competitor[]) => setRows(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    connect();
    return () => { wsRef.current?.close(); };
  }, []);

  function connect() {
    setWsStatus('connecting');
    const ws = new WebSocket(BACKEND_WS_URL);
    wsRef.current = ws;
    ws.onopen    = () => setWsStatus('connected');
    ws.onerror   = () => setWsStatus('error');
    ws.onclose   = () => { setWsStatus('error'); setTimeout(connect, 3000); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'leaderboard') setRows(msg.data as Competitor[]);
      } catch {}
    };
  }

  async function onClearConfirmed() {
    setClearing(true);
    try {
      await fetch(`${BACKEND_BASE_URL}/api/leaderboard`, { method: 'DELETE' });
      setRows([]);
    } catch {}
    setClearing(false);
    setConfirmClear(false);
  }

  return (
    <div className="py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black text-[#F0ECEC] tracking-wide uppercase">Leaderboard</h2>
          <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border font-medium ${
            wsStatus === 'connected'
              ? 'border-[#00E676]/40 text-[#00E676] bg-[#00E676]/5'
              : 'border-[#FF1744]/40 text-[#FF1744] bg-[#FF1744]/5'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-[#00E676]' : 'bg-[#FF1744] animate-pulse'}`} />
            {wsStatus === 'connected' ? 'Live' : 'Offline'}
          </span>
        </div>

        {confirmClear ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#1C1010] text-[#9A7070] hover:text-[#F0ECEC] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClearConfirmed}
              disabled={clearing}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#FF1744] text-white font-semibold hover:bg-[#ff4060] transition-colors"
            >
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#2E1A1A] text-[#5A3A3A] hover:border-[#FF1744]/50 hover:text-[#FF1744] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden border border-[#2E1A1A]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#120C0C] text-[#5A3A3A] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Time</th>
              <th className="px-4 py-3 text-right">Bonus</th>
              <th className="px-4 py-3 text-right">Final</th>
              <th className="px-4 py-3 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#5A3A3A]">
                  No results yet — waiting for the first race.
                </td>
              </tr>
            ) : rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-t border-[#2E1A1A] transition-colors ${
                  i < 3
                    ? MEDAL_BG[i] + ' border'
                    : 'bg-[#120C0C]/60 hover:bg-[#1C1010]'
                }`}
              >
                <td className="px-4 py-3 font-bold text-[#F0ECEC]">
                  {i < 3 ? MEDALS[i] : `#${i + 1}`}
                </td>
                <td className="px-4 py-3 text-[#F0ECEC] font-semibold">{row.name}</td>
                <td className="px-4 py-3 text-right text-[#9A7070]">{row.score}</td>
                <td className="px-4 py-3 text-right text-[#9A7070] font-mono">{formatTime(row.time_ms)}</td>
                <td className="px-4 py-3 text-right text-[#00E676] font-medium">+{row.time_bonus}</td>
                <td className="px-4 py-3 text-right font-black text-[#FF1744] text-base">{row.final_score}</td>
                <td className="px-4 py-3 text-center">
                  {row.eliminated ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF1744]/10 text-[#FF1744] border border-[#FF1744]/30">
                      Eliminated
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#00E676]/10 text-[#00E676] border border-[#00E676]/30">
                      Finished
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
