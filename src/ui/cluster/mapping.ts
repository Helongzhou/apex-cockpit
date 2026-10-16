/**
 * mapping.ts - Pure mappings from vehicle state to cluster presentation.
 *
 * Kept free of React and DOM so the boundaries (0, full scale, over-range, negative power) are
 * unit testable; the components only apply the returned numbers to transform/opacity.
 */

import type { Gear, VehicleSnapshot } from '../../../game/types.js';

/** Gauge scale. The demo's physical top speed is 36 km/h (80 world units/s at 8 units per metre). */
export const GAUGE_MAX_KMH = 40;
/** Sweep of the needle: -120° (0 km/h) to +120° (full scale). */
export const GAUGE_MIN_DEGREES = -120;
export const GAUGE_MAX_DEGREES = 120;
/** Full-scale power for the bar; the demo car peaks around 2000 kW on paper, the bar is clamped. */
export const POWER_BAR_MAX_KW = 400;

/** NaN is treated as 0; the infinities clamp to the ends of the scale. */
const clamp01 = (value: number): number => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)));

/** Fraction of the gauge scale, clamped to 0..1 and NaN-safe. */
export function speedToFraction(speedKmh: number): number {
    return clamp01(Math.abs(speedKmh) / GAUGE_MAX_KMH);
}

/** Needle angle in degrees for the given speed. */
export function speedToNeedleDegrees(speedKmh: number): number {
    const fraction = speedToFraction(speedKmh);
    return GAUGE_MIN_DEGREES + fraction * (GAUGE_MAX_DEGREES - GAUGE_MIN_DEGREES);
}

/** Tick definitions for the gauge face (every 5 km/h, labelled every 10). */
export function gaugeTicks(step = 5): Array<{ value: number; degrees: number; label: string | null }> {
    const ticks = [];
    for (let value = 0; value <= GAUGE_MAX_KMH; value += step) {
        ticks.push({
            value,
            degrees: speedToNeedleDegrees(value),
            label: value % (step * 2) === 0 ? String(value) : null
        });
    }
    return ticks;
}

export const GEAR_ORDER: readonly Gear[] = ['P', 'R', 'N', 'D'];

export function isGearActive(current: Gear, candidate: Gear): boolean {
    return current === candidate;
}

/** Power as -1..1: negative is braking/regen, positive is drive. */
export function powerToFraction(powerKw: number): number {
    if (!Number.isFinite(powerKw)) {
        return 0;
    }
    return Math.min(1, Math.max(-1, powerKw / POWER_BAR_MAX_KW));
}

export type StatusTone = 'warning' | 'info' | 'ok';
export type StatusIconId = 'collision' | 'reverse' | 'standstill' | 'driving' | 'racing';

export interface StatusIcon {
    id: StatusIconId;
    label: string;
    tone: StatusTone;
}

/**
 * Only real signals are shown. The ADAS-specific icons (lane keeping, target lock, ACC) arrive in
 * iteration 3 once those layers exist; this function is the single place they will be added.
 */
export function activeStatusIcons(snapshot: VehicleSnapshot, isRacing: boolean): StatusIcon[] {
    const icons: StatusIcon[] = [];
    if (snapshot.collision) {
        icons.push({ id: 'collision', label: '碰撞告警', tone: 'warning' });
    }
    if (snapshot.gear === 'R') {
        icons.push({ id: 'reverse', label: '倒车', tone: 'info' });
    }
    if (snapshot.gear === 'N') {
        icons.push({ id: 'standstill', label: '驻车', tone: 'info' });
    }
    if (snapshot.gear === 'D' && !snapshot.collision) {
        icons.push({ id: 'driving', label: '行驶中', tone: 'ok' });
    }
    if (isRacing) {
        icons.push({ id: 'racing', label: '计时中', tone: 'ok' });
    }
    return icons;
}
