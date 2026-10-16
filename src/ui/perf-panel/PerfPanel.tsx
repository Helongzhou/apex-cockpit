import { useEffect, useState } from 'react';
import type { GameHost } from '../../../game/types.js';
import type { Store } from '../../state';
import { useGameState } from '../../hooks/useGameState';
import { BUNDLE_BASELINE } from '../../dev/bundle-baseline';

/** F9 toggles the panel; F12 is already taken by the vehicle-data panels. */
const TOGGLE_KEYS = new Set(['F9']);

const ms = (value: number): string => `${value.toFixed(1)} ms`;
const count = (value: number): string => value.toLocaleString('en-US');

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="perf-row">
            <span className="perf-label">{label}</span>
            <span className="perf-value">{value}</span>
        </div>
    );
}

/**
 * Performance panel. It reads the 4 Hz snapshot the game publishes (`host.perf`), so opening it
 * cannot couple React to the frame loop; every field is text, nothing here triggers layout beyond
 * the panel's own box.
 */
export function PerfPanel({ store }: { store: Store<GameHost> }) {
    const { perf, runtime, stage, fps } = useGameState(store);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (TOGGLE_KEYS.has(event.key)) {
                event.preventDefault();
                setVisible(current => !current);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    if (!visible) {
        return (
            <button className="perf-open" type="button" onClick={() => setVisible(true)}>
                📊 F9
            </button>
        );
    }

    return (
        <div className="perf-panel" role="group" aria-label="性能监控">
            <div className="perf-header">
                <span className="perf-title">Performance</span>
                <span className="perf-sub">{stage} · {runtime.phase}</span>
                <button className="perf-close" type="button" onClick={() => setVisible(false)}>✕</button>
            </div>
            <div className="perf-section">
                <div className="perf-section-title">Frame time（{perf.interval.samples} 帧窗口）</div>
                <Row label="p50" value={ms(perf.interval.p50)} />
                <Row label="p95" value={ms(perf.interval.p95)} />
                <Row label="p99" value={ms(perf.interval.p99)} />
                <Row label="max" value={ms(perf.interval.max)} />
                <Row label="fps（面板）" value={perf.fps.toFixed(1)} />
                <Row label="fps（HUD）" value={fps.toFixed(0)} />
            </div>
            <div className="perf-section">
                <div className="perf-section-title">主线程脚本耗时</div>
                <Row label="p50" value={ms(perf.script.p50)} />
                <Row label="p95" value={ms(perf.script.p95)} />
                <Row label="max" value={ms(perf.script.max)} />
            </div>
            <div className="perf-section">
                <div className="perf-section-title">渲染</div>
                <Row label="draw calls" value={count(perf.drawCalls)} />
                <Row label="triangles" value={count(perf.triangles)} />
                <Row label="geometries" value={count(perf.geometries)} />
                <Row label="textures" value={count(perf.textures)} />
                <Row label="programs" value={count(perf.programs)} />
            </div>
            <div className="perf-section">
                <div className="perf-section-title">物理 / ADAS</div>
                <Row label="子步（本帧）" value={count(perf.physicsStepsLastFrame)} />
                <Row label="子步（累计）" value={count(perf.physicsStepsTotal)} />
                <Row label="ADAS 目标" value={count(perf.adasTargets)} />
            </div>
            <div className="perf-section">
                <div className="perf-section-title">包体基线（由脚本生成）</div>
                <Row label="首屏 gzip" value={`${BUNDLE_BASELINE.firstScreenGzipKb.toFixed(1)} kB`} />
                <Row label="游戏 chunk" value={`${BUNDLE_BASELINE.gameChunkGzipKb.toFixed(1)} kB`} />
                <Row label="wasm 合计" value={`${BUNDLE_BASELINE.wasmGzipKb.toFixed(1)} kB`} />
                <Row label="生成日期" value={BUNDLE_BASELINE.generatedAt} />
            </div>
        </div>
    );
}
