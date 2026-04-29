import { useState, useRef, useEffect } from 'react';
import { BACKEND_WS_URL, ESP32_WS_URL } from '../constants';

export function RaceControlTab() {
  const [countdown, setCountdown]         = useState<number | null>(null);
  const [backendWs, setBackendWs]         = useState<WebSocket | null>(null);
  const [bwsStatus, setBwsStatus]         = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [stopStatus, setStopStatus]       = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [currentRacer, setCurrentRacer]   = useState<string | null>(null);
  const bwsRef                            = useRef<WebSocket | null>(null);

  useEffect(() => {
    connectBackend();
    return () => { bwsRef.current?.close(); };
  }, []);

  function connectBackend() {
    setBwsStatus('connecting');
    const ws = new WebSocket(BACKEND_WS_URL);
    bwsRef.current = ws;
    ws.onopen  = () => { setBwsStatus('connected'); setBackendWs(ws); };
    ws.onerror = () => setBwsStatus('error');
    ws.onclose = () => { setBwsStatus('error'); setBackendWs(null); setTimeout(connectBackend, 3000); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'race_start' && msg.name) setCurrentRacer(msg.name as string);
      } catch {}
    };
  }

  function sendCountdown(seconds: number) {
    if (!backendWs || backendWs.readyState !== WebSocket.OPEN) return;
    backendWs.send(JSON.stringify({ type: 'countdown', seconds }));
    setCountdown(seconds);
    let remaining = seconds;
    const iv = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) { clearInterval(iv); setCountdown(null); }
    }, 1000);
  }

  async function emergencyStop() {
    setStopStatus('sending');
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(ESP32_WS_URL);
      await new Promise<void>((res, rej) => {
        ws!.onopen = () => res();
        ws!.onerror = () => rej();
        setTimeout(() => rej(), 5000);
      });
      ws.send(JSON.stringify({ type: 'cmd', action: 'stop' }));
      ws.close();
      setStopStatus('ok');
      setTimeout(() => setStopStatus('idle'), 2000);
    } catch {
      ws?.close();
      setStopStatus('error');
      setTimeout(() => setStopStatus('idle'), 3000);
    }
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-8">
      <h2 className="text-xl font-semibold text-[#eeeeff]">Race Control</h2>

      {/* Current racer */}
      <div className="rounded-lg bg-[#0e0e1e] border border-[#1e1e3c] px-5 py-4 space-y-1">
        <p className="text-xs text-[#4a4a80] uppercase tracking-wider">Current Competitor</p>
        <p className="text-lg font-bold text-[#00c8ff]">{currentRacer ?? '—'}</p>
        <p className="text-xs text-[#4a4a80]">Updates when mobile app starts a race</p>
      </div>

      {/* Backend WS status */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#4a4a80]">Backend WS:</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${
          bwsStatus === 'connected' ? 'border-[#00e676] text-[#00e676]' : 'border-[#ff3366] text-[#ff3366]'
        }`}>
          {bwsStatus === 'connected' ? '● Connected' : '○ Disconnected'}
        </span>
      </div>

      {/* Countdown */}
      <div className="space-y-3">
        <p className="text-sm text-[#8888bb] font-medium">Start Countdown</p>
        <p className="text-xs text-[#4a4a80]">Broadcasts countdown to mobile app via backend WebSocket. Mobile will show overlay then auto-send start to ESP32.</p>

        {countdown !== null ? (
          <div className="text-center py-6">
            <span className="text-7xl font-black text-[#ffaa00]">{countdown === 0 ? 'GO!' : countdown}</span>
          </div>
        ) : (
          <div className="flex gap-3">
            {[3, 5, 10].map(s => (
              <button
                key={s}
                onClick={() => sendCountdown(s)}
                disabled={bwsStatus !== 'connected'}
                className="flex-1 py-3 rounded bg-[#13132a] border border-[#1e1e3c] text-[#eeeeff] font-semibold hover:border-[#00c8ff] hover:text-[#00c8ff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {s}s
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Emergency stop */}
      <div className="space-y-3">
        <p className="text-sm text-[#8888bb] font-medium">Emergency Stop</p>
        <p className="text-xs text-[#4a4a80]">Sends stop command directly to ESP32. Requires laptop to be on <strong className="text-[#8888bb]">LineFollower</strong> WiFi.</p>
        <button
          onClick={emergencyStop}
          disabled={stopStatus === 'sending'}
          className="w-full py-3 rounded bg-[#3a0018] border border-[#ff3366]/50 text-[#ff3366] font-bold text-lg hover:bg-[#ff3366] hover:text-white transition-colors disabled:opacity-50"
        >
          {stopStatus === 'sending' ? 'Sending…'
            : stopStatus === 'ok'    ? '✓ Stopped'
            : stopStatus === 'error' ? '✗ Failed (check WiFi)'
            : '⛔ EMERGENCY STOP'}
        </button>
      </div>
    </div>
  );
}
