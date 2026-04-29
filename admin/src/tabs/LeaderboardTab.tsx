import { useState, useEffect, useRef, useCallback } from 'react';
import { BACKEND_BASE_URL, BACKEND_WS_URL } from '../constants';
import type { Competitor } from '../types';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BG = [
  'bg-yellow-900/30 border-yellow-600/40',
  'bg-slate-700/30 border-slate-500/40',
  'bg-orange-900/30 border-orange-700/40',
];

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0').slice(0, 1)}`;
}

export function LeaderboardTab() {
  const [rows, setRows]               = useState<Competitor[]>([]);
  const [wsStatus, setWsStatus]       = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [clearing, setClearing]       = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const wsRef                         = useRef<WebSocket | null>(null);

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
    ws.onopen  = () => setWsStatus('connected');
    ws.onerror = () => setWsStatus('error');
    ws.onclose = () => { setWsStatus('error'); setTimeout(connect, 3000); };
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
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#eeeeff]">Leaderboard</h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
            wsStatus === 'connected' ? 'border-[#00e676] text-[#00e676]' : 'border-[#ff3366] text-[#ff3366]'
          }`}>
            {wsStatus === 'connected' ? '● LIVE' : '○ offline'}
          </span>

          {confirmClear ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(false)} className="text-xs px-3 py-1 rounded bg-[#1e1e3c] text-[#8888bb] hover:text-[#eeeeff]">Cancel</button>
              <button onClick={onClearConfirmed} disabled={clearing} className="text-xs px-3 py-1 rounded bg-[#ff3366] text-white font-semibold">
                {clearing ? 'Clearing…' : 'Confirm Clear'}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="text-xs px-3 py-1 rounded border border-[#1e1e3c] text-[#4a4a80] hover:border-[#ff3366] hover:text-[#ff3366] transition-colors">
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden border border-[#1e1e3c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0e0e1e] text-[#4a4a80] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Time</th>
              <th className="px-4 py-3 text-right">Bonus</th>
              <th className="px-4 py-3 text-right">Final</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#4a4a80]">No results yet</td>
              </tr>
            ) : rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-t border-[#1e1e3c] transition-colors ${
                  i < 3 ? MEDAL_BG[i] + ' border' : 'bg-[#0e0e1e]/50 hover:bg-[#13132a]'
                }`}
              >
                <td className="px-4 py-3 font-bold text-[#eeeeff]">
                  {i < 3 ? MEDALS[i] : `#${i + 1}`}
                </td>
                <td className="px-4 py-3 text-[#eeeeff] font-medium">{row.name}</td>
                <td className="px-4 py-3 text-right text-[#8888bb]">{row.score}</td>
                <td className="px-4 py-3 text-right text-[#8888bb] font-mono">{formatTime(row.time_ms)}</td>
                <td className="px-4 py-3 text-right text-[#00e676]">+{row.time_bonus}</td>
                <td className="px-4 py-3 text-right font-bold text-[#00c8ff] text-base">{row.final_score}</td>
                <td className="px-4 py-3 text-center">
                  {row.eliminated ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#3a0018] text-[#ff3366] border border-[#ff3366]/30">Eliminated</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#003322] text-[#00e676] border border-[#00e676]/30">Finished</span>
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
