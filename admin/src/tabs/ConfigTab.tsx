import { useState, useEffect, useRef } from 'react';
import { BACKEND_BASE_URL, ESP32_WS_URL } from '../constants';
import type { ConfigMap } from '../types';

export function ConfigTab() {
  const [config, setConfig]     = useState<ConfigMap>({ baseVelocity: '180', initialScore: '1000', timeBonusEnabled: 'true' });
  const [dirty, setDirty]       = useState<Partial<ConfigMap>>({});
  const [saveStatus, setSave]   = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [pushStatus, setPush]   = useState<'idle' | 'pushing' | 'ok' | 'error'>('idle');

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
        ws!.onopen = () => res();
        ws!.onerror = () => rej(new Error('WS error'));
        setTimeout(() => rej(new Error('timeout')), 5000);
      });
      ws.send(JSON.stringify({
        type:         'config',
        baseVelocity: Number(config.baseVelocity),
        initialScore: Number(config.initialScore),
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
      <h2 className="text-xl font-semibold text-[#eeeeff]">Race Configuration</h2>

      <Field label="Base Velocity (0–255)">
        <input
          type="number" min={0} max={255} value={config.baseVelocity}
          onChange={e => onChange('baseVelocity', e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Initial Score">
        <input
          type="number" min={0} value={config.initialScore}
          onChange={e => onChange('initialScore', e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Time Bonus Enabled">
        <button
          onClick={() => onChange('timeBonusEnabled', config.timeBonusEnabled === 'true' ? 'false' : 'true')}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            config.timeBonusEnabled === 'true'
              ? 'bg-[#00e676] text-black'
              : 'bg-[#1e1e3c] text-[#8888bb]'
          }`}
        >
          {config.timeBonusEnabled === 'true' ? 'ON' : 'OFF'}
        </button>
      </Field>

      {/* Action row */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={!hasDirty || saveStatus === 'saving'}
          className={`flex-1 py-2.5 rounded font-semibold transition-colors ${
            hasDirty
              ? 'bg-[#00c8ff] text-black hover:bg-[#00a8dd]'
              : 'bg-[#1e1e3c] text-[#4a4a80] cursor-not-allowed'
          }`}
        >
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'ok' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : 'Save to Backend'}
        </button>

        <button
          onClick={onPushToRobot}
          disabled={pushStatus === 'pushing'}
          className="flex-1 py-2.5 rounded font-semibold bg-[#13132a] border border-[#1e1e3c] text-[#eeeeff] hover:border-[#00c8ff] transition-colors"
        >
          {pushStatus === 'pushing' ? 'Connecting…'
            : pushStatus === 'ok'   ? '✓ Sent to Robot'
            : pushStatus === 'error' ? '✗ Failed (check WiFi)'
            : '⚡ Push to Robot'}
        </button>
      </div>

      <p className="text-xs text-[#4a4a80]">
        "Push to Robot" requires your laptop to be connected to the <strong className="text-[#8888bb]">LineFollower</strong> WiFi AP.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-[#8888bb] font-medium">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded bg-[#0e0e1e] border border-[#1e1e3c] text-[#eeeeff] focus:outline-none focus:border-[#00c8ff] transition-colors';
