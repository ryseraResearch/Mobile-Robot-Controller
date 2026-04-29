import { useState, useRef, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { BACKEND_WS_URL, ESP32_WS_URL } from '../constants';

interface Props {
  pendingRacer:  string | null;
  onRacerUpdate: Dispatch<SetStateAction<string | null>>;
}

export function RaceControlTab({ pendingRacer, onRacerUpdate }: Props) {
  const [countdown,  setCountdown]  = useState<number | null>(null);
  const [backendWs,  setBackendWs]  = useState<WebSocket | null>(null);
  const [bwsStatus,  setBwsStatus]  = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [stopStatus, setStopStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const bwsRef = useRef<WebSocket | null>(null);
  const ivRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    connectBackend();
    return () => {
      bwsRef.current?.close();
      ivRef.current && clearInterval(ivRef.current);
    };
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
        if (msg.type === 'race_start' && msg.name) onRacerUpdate(msg.name as string);
      } catch {}
    };
  }

  function sendCountdown(seconds: number) {
    if (!backendWs || backendWs.readyState !== WebSocket.OPEN) return;
    backendWs.send(JSON.stringify({ type: 'countdown', seconds }));
    setCountdown(seconds);
    let remaining = seconds;
    ivRef.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) {
        ivRef.current && clearInterval(ivRef.current);
        setCountdown(null);
        onRacerUpdate(null);
      }
    }, 1000);
  }

  async function emergencyStop() {
    setStopStatus('sending');
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(ESP32_WS_URL);
      await new Promise<void>((res, rej) => {
        ws!.onopen  = () => res();
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
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">

      {/* Backend connection */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${bwsStatus === 'connected' ? 'bg-[#00E676]' : 'bg-[#FF1744] animate-pulse'}`} />
        <span className="text-xs text-[#9A7070]">
          {bwsStatus === 'connected' ? 'Backend connected' : bwsStatus === 'connecting' ? 'Connecting to backend…' : 'Backend offline — retrying'}
        </span>
      </div>

      {/* Race request card */}
      {countdown !== null ? (
        /* ── Active countdown ── */
        <div className="rounded-xl border border-[#2E1A1A] bg-[#1C1010] px-6 py-10 text-center space-y-2">
          <p className="text-xs text-[#9A7070] uppercase tracking-widest">Race starting in</p>
          <p className="text-[96px] font-black leading-none text-[#FF1744]" style={{ textShadow: '0 0 32px #FF174466' }}>
            {countdown === 0 ? 'GO!' : countdown}
          </p>
          {pendingRacer && (
            <p className="text-sm text-[#9A7070]">Good luck, <span className="text-[#F0ECEC] font-semibold">{pendingRacer}</span>!</p>
          )}
        </div>
      ) : pendingRacer ? (
        /* ── Competitor waiting ── */
        <div className="rounded-xl border border-[#FF1744]/40 bg-[#1C1010] px-6 py-6 space-y-5"
             style={{ boxShadow: '0 0 24px #FF174422' }}>
          <div className="space-y-1">
            <p className="text-xs text-[#FF9100] uppercase tracking-widest font-bold">Race Request</p>
            <p className="text-2xl font-black text-[#F0ECEC]">{pendingRacer}</p>
            <p className="text-sm text-[#9A7070]">is ready to race — start the countdown when you're set.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-[#5A3A3A] uppercase tracking-wider">Countdown duration</p>
            <div className="flex gap-3">
              {[3, 5, 10].map(s => (
                <button
                  key={s}
                  onClick={() => sendCountdown(s)}
                  disabled={bwsStatus !== 'connected'}
                  className="flex-1 py-3 rounded-lg bg-[#FF1744] text-white font-bold text-lg hover:bg-[#ff4060] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Waiting for competitor ── */
        <div className="rounded-xl border border-[#2E1A1A] bg-[#1C1010] px-6 py-8 text-center space-y-2">
          <p className="text-[#F0ECEC] font-semibold">Waiting for a competitor</p>
          <p className="text-sm text-[#9A7070]">Ask the competitor to open the app and enter their name. Their request will appear here.</p>
          <div className="flex justify-center gap-1 pt-2">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#5A3A3A] animate-pulse"
                    style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
        </div>
      )}

      {/* Emergency stop */}
      <div className="space-y-2 pt-2">
        <p className="text-xs text-[#5A3A3A] uppercase tracking-wider">Emergency</p>
        <p className="text-xs text-[#5A3A3A]">
          Sends a stop command directly to the robot. Requires this laptop to be on the <strong className="text-[#9A7070]">LineFollower</strong> WiFi.
        </p>
        <button
          onClick={emergencyStop}
          disabled={stopStatus === 'sending'}
          className="w-full py-3 rounded-lg border border-[#FF1744]/40 text-[#FF1744] font-bold hover:bg-[#FF1744] hover:text-white transition-colors disabled:opacity-50"
        >
          {stopStatus === 'sending' ? 'Sending…'
            : stopStatus === 'ok'    ? '✓ Robot stopped'
            : stopStatus === 'error' ? '✗ Failed — check WiFi'
            : 'Emergency Stop'}
        </button>
      </div>
    </div>
  );
}
