/**
 * DevDebugOverlay — Development-Only Debug Panel
 * FAZ UI-13.2 TASK 12: Runtime visibility for engine state
 *
 * Shows: engine mode, fallback status, telemetry buffer, memory count, crash info
 * ONLY visible in development mode (process.env.NODE_ENV === 'development')
 */

'use client';

import { useState, useEffect } from 'react';
import { type DecisionEngineRuntime, createDecisionEngineRuntime } from '@/lib/decision-engine-failsafe';
import { getTelemetryBuffer, getTelemetryStats } from '@/lib/telemetry';
import { getMemoryAdapter } from '@/lib/decision-memory-adapter';
import { getChaosConfig, setChaosConfig, clearChaos, type CrashBlock } from '@/lib/chaos';

export function DevDebugOverlay({ runtime }: { runtime?: DecisionEngineRuntime } = {}) {
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);

  // Refresh every 2s
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [visible]);

  // Production guard
  if (process.env.NODE_ENV !== 'development') return null;

  const rt = runtime ?? createDecisionEngineRuntime();
  const engine = rt.getState();
  const telBuf = getTelemetryBuffer();
  const telStats = getTelemetryStats();
  const memCount = getMemoryAdapter().read().length;
  const chaos = getChaosConfig();

  const modeColor = engine.mode === 'full' ? '#22c55e' : engine.mode === 'fallback' ? '#f59e0b' : '#ef4444';

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          zIndex: 9999,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: modeColor,
          border: '2px solid white',
          cursor: 'pointer',
          fontSize: 10,
          color: 'white',
          fontWeight: 'bold',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
        title="Calon Debug Panel"
      >
        D
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: 'fixed',
            bottom: 44,
            right: 8,
            zIndex: 9999,
            width: 280,
            background: '#1e1e2e',
            color: '#cdd6f4',
            borderRadius: 8,
            padding: 12,
            fontSize: 11,
            fontFamily: 'monospace',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#cba6f7' }}>
            Calon Debug Panel
          </div>

          <Row label="Engine" value={engine.mode} color={modeColor} />
          <Row label="Failures" value={String(engine.consecutiveFailures)} />
          <Row label="Tel Buffer" value={`${telBuf.length} events`} />
          <Row label="Tel Pruned" value={String(telStats.totalPruned)} />
          <Row label="Memory" value={`${memCount} items`} />
          <Row label="Chaos Block" value={chaos.forceCrashBlock ?? 'none'} />
          {engine.reason && <Row label="Reason" value={engine.reason} />}

          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <DebugBtn
              label="Crash: Decision"
              onClick={() => setChaosConfig({ ...chaos, forceCrashBlock: 'decision' })}
            />
            <DebugBtn
              label="Crash: Revenue"
              onClick={() => setChaosConfig({ ...chaos, forceCrashBlock: 'revenue' })}
            />
            <DebugBtn
              label="Clear Chaos"
              onClick={() => { clearChaos(); setTick((t) => t + 1); }}
            />
            <DebugBtn
              label="Engine → Off"
              onClick={() => {
                rt.setMode('off', 'debug_manual');
                setTick((t) => t + 1);
              }}
            />
            <DebugBtn
              label="Engine → Full"
              onClick={() => {
                rt.setMode('full', 'debug_manual');
                setTick((t) => t + 1);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#a6adc8' }}>{label}</span>
      <span style={{ color: color ?? '#cdd6f4', fontWeight: 'bold' }}>{value}</span>
    </div>
  );
}

function DebugBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 6px',
        fontSize: 9,
        background: '#313244',
        color: '#cdd6f4',
        border: '1px solid #45475a',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
