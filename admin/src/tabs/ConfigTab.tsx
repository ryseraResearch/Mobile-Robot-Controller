import { useState, useEffect } from 'react';
import { BACKEND_BASE_URL, ESP32_WS_URL } from '../constants';
import type { ConfigMap } from '../types';

export function ConfigTab() {
  const [config, setConfig]   = useState<ConfigMap>({ baseVelocity: '100', initialScore: '1000', timeBonusEnabled: 'true', penaltyRate: '1' });
  const [dirty, setDirty]     = useState<Partial<ConfigMap>>({});
  const [saveStatus, setSave] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [pushStatus, setPush] = useState<'idle' | 'pushing' | 'ok' | 'error'>('idle');

  useEffect(() => {
    fetch(`${BACKEND_BASE_URL}/api/config`)
      .then(r => r.json())
      .then((data: ConfigMap) => setConfig(data))
      .catch(() => {});
  }, []);

  function onChange(key: keyof ConfigMap, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(prev => ({ ...prev, [key]: value }));
    setSave('idle');
  }

  async function onSave() {
    setSave('saving');
    try {
      await Promise.all(
        Object.entries(dirty).map(([key, value]) =>
          fetch(`${BACKEND_BASE_URL}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
          })
        )
      );
      setDirty({});
      setSave('ok');
      setTimeout(() => setSave('idle'), 2000);
    } catch {
      setSave('error');
    }
  }

  async function onPushToRobot() {
    setPush('pushing');
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(ESP32_WS_URL);
      await new Promise<void>((res, rej) => {
        ws!.onopen  = () => res();
        ws!.onerror = () => rej(new Error('WS error'));
        setTimeout(() => rej(new Error('timeout')), 5000);
      });
      ws.send(JSON.stringify({
        type:         'config',
        baseVelocity: Number(config.baseVelocity),
        initialScore: Number(config.initialScore),
        penaltyRate:  Number(config.penaltyRate),
      }));
      ws.close();
      setPush('ok');
      setTimeout(() => setPush('idle'), 2500);
    } catch {
      ws?.close();
      setPush('error');
      setTimeout(() => setPush('idle'), 3000);
    }
  }

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <h2 className="text-xl font-black text-[#F0ECEC] tracking-wide uppercase">Race Config</h2>

      <Field label="Base Velocity" hint="0 – 255 PWM">
        <input
          type="number" min={0} max={255} value={config.baseVelocity}
          onChange={e => onChange('baseVelocity', e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Initial Score" hint="Points at race start">
        <input
          type="number" min={0} value={config.initialScore}
          onChange={e => onChange('initialScore', e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Penalty Rate" hint="Points deducted per 100 ms off-line">
        <input
          type="number" min={0} value={config.penaltyRate}
          onChange={e => onChange('penaltyRate', e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Time Bonus">
        <button
          onClick={() => onChange('timeBonusEnabled', config.timeBonusEnabled === 'true' ? 'false' : 'true')}
          className={`px-5 py-2 rounded-lg font-bold text-sm transition-colors ${
            config.timeBonusEnabled === 'true'
              ? 'bg-[#00E676] text-black'
              : 'bg-[#1C1010] border border-[#2E1A1A] text-[#5A3A3A]'
          }`}
        >
          {config.timeBonusEnabled === 'true' ? 'Enabled' : 'Disabled'}
        </button>
      </Field>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={!hasDirty || saveStatus === 'saving'}
          className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors ${
            hasDirty
              ? 'bg-[#FF1744] text-white hover:bg-[#ff4060]'
              : 'bg-[#1C1010] border border-[#2E1A1A] text-[#5A3A3A] cursor-not-allowed'
          }`}
        >
          {saveStatus === 'saving' ? 'Saving…'
           : saveStatus === 'ok'   ? '✓ Saved'
           : saveStatus === 'error' ? '✗ Error'
           : 'Save to Backend'}
        </button>

        <button
          onClick={onPushToRobot}
          disabled={pushStatus === 'pushing'}
          className="flex-1 py-2.5 rounded-lg font-bold text-sm border border-[#2E1A1A] text-[#F0ECEC] hover:border-[#FF1744]/50 hover:text-[#FF1744] transition-colors"
        >
          {pushStatus === 'pushing' ? 'Connecting…'
           : pushStatus === 'ok'    ? '✓ Sent to Robot'
           : pushStatus === 'error' ? '✗ Failed — check WiFi'
           : 'Push to Robot'}
        </button>
      </div>

      <p className="text-xs text-[#5A3A3A]">
        "Push to Robot" requires this laptop to be connected to the <strong className="text-[#9A7070]">LineFollower</strong> WiFi AP.
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <label className="text-sm text-[#9A7070] font-semibold">{label}</label>
        {hint && <span className="text-xs text-[#5A3A3A]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-[#0A0808] border border-[#2E1A1A] text-[#F0ECEC] focus:outline-none focus:border-[#FF1744]/60 transition-colors';
