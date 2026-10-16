import { describe, expect, it } from 'vitest';
import {
    GAUGE_MAX_DEGREES,
    GAUGE_MAX_KMH,
    GAUGE_MIN_DEGREES,
    POWER_BAR_MAX_KW,
    activeStatusIcons,
    gaugeTicks,
    isGearActive,
    powerToFraction,
    speedToFraction,
    speedToNeedleDegrees
} from '../src/ui/cluster/mapping.js';
import { createInitialVehicleState, type VehicleState } from '../game/vehicle-state.js';
import type { VehicleSnapshot } from '../game/types.js';

const snapshot = (overrides: Partial<VehicleSnapshot> = {}): VehicleSnapshot => ({
    speedMps: 0,
    speedKmh: 0,
    gear: 'N',
    powerKw: 0,
    accelLongitudinal: 0,
    accelLateral: 0,
    yawRate: 0,
    steerAngleDeg: 0,
    collision: false,
    ...overrides
});

describe('speed gauge mapping', () => {
    it('puts 0 km/h at the start of the sweep', () => {
        expect(speedToFraction(0)).toBe(0);
        expect(speedToNeedleDegrees(0)).toBe(GAUGE_MIN_DEGREES);
    });

    it('puts full scale at the end of the sweep', () => {
        expect(speedToFraction(GAUGE_MAX_KMH)).toBe(1);
        expect(speedToNeedleDegrees(GAUGE_MAX_KMH)).toBe(GAUGE_MAX_DEGREES);
    });

    it('maps the half-scale value to the middle', () => {
        expect(speedToNeedleDegrees(GAUGE_MAX_KMH / 2)).toBeCloseTo(0, 9);
    });

    it('clamps over-range speeds and treats reverse as magnitude', () => {
        expect(speedToFraction(999)).toBe(1);
        // Scale-independent: a quarter of full scale in reverse.
        expect(speedToFraction(-GAUGE_MAX_KMH / 4)).toBeCloseTo(0.25, 9);
    });

    it('survives NaN and Infinity without producing NaN angles', () => {
        expect(speedToNeedleDegrees(Number.NaN)).toBe(GAUGE_MIN_DEGREES);
        expect(speedToNeedleDegrees(Number.POSITIVE_INFINITY)).toBe(GAUGE_MAX_DEGREES);
    });

    it('generates monotonic ticks across the sweep', () => {
        const ticks = gaugeTicks();
        expect(ticks[0]).toEqual({ value: 0, degrees: GAUGE_MIN_DEGREES, label: '0' });
        expect(ticks.at(-1)?.value).toBe(GAUGE_MAX_KMH);
        for (let index = 1; index < ticks.length; index += 1) {
            expect(ticks[index].degrees).toBeGreaterThan(ticks[index - 1].degrees);
        }
        expect(ticks.filter(tick => tick.label !== null).length).toBeGreaterThanOrEqual(4);
    });
});

describe('gear mapping', () => {
    it('activates exactly the current gear', () => {
        expect(isGearActive('D', 'D')).toBe(true);
        expect(isGearActive('D', 'N')).toBe(false);
    });
});

describe('power bar mapping', () => {
    it('is zero at zero power', () => {
        expect(powerToFraction(0)).toBe(0);
    });

    it('clamps to full scale in both directions', () => {
        expect(powerToFraction(POWER_BAR_MAX_KW)).toBe(1);
        expect(powerToFraction(POWER_BAR_MAX_KW * 10)).toBe(1);
        expect(powerToFraction(-POWER_BAR_MAX_KW)).toBe(-1);
        expect(powerToFraction(-POWER_BAR_MAX_KW * 10)).toBe(-1);
    });

    it('keeps the sign so braking shows as regen', () => {
        expect(powerToFraction(POWER_BAR_MAX_KW / 2)).toBeCloseTo(0.5, 9);
        expect(powerToFraction(-POWER_BAR_MAX_KW / 4)).toBeCloseTo(-0.25, 9);
    });

    it('guards against NaN', () => {
        expect(powerToFraction(Number.NaN)).toBe(0);
    });
});

describe('status icons', () => {
    it('shows standstill when parked and driving when in gear', () => {
        expect(activeStatusIcons(snapshot(), false).map(icon => icon.id)).toEqual(['standstill']);
        expect(activeStatusIcons(snapshot({ gear: 'D' }), false).map(icon => icon.id)).toEqual(['driving']);
    });

    it('flags a collision as a warning and hides the driving icon then', () => {
        const icons = activeStatusIcons(snapshot({ gear: 'D', collision: true }), false);
        expect(icons.map(icon => icon.id)).toEqual(['collision']);
        expect(icons[0].tone).toBe('warning');
    });

    it('shows reverse and the race timer when both apply', () => {
        expect(activeStatusIcons(snapshot({ gear: 'R' }), true).map(icon => icon.id)).toEqual(['reverse', 'racing']);
    });

    it('only ever emits real signals (no ADAS placeholders before iteration 3)', () => {
        const ids = activeStatusIcons(snapshot({ gear: 'D' }), true).map(icon => icon.id);
        expect(ids.every(id => ['collision', 'reverse', 'standstill', 'driving', 'racing'].includes(id))).toBe(true);
    });
});

describe('snapshot shape guard', () => {
    it('accepts a state derived from the vehicle state module', () => {
        const state: VehicleState = createInitialVehicleState();
        const fromState: VehicleSnapshot = {
            speedMps: state.speedMps,
            speedKmh: state.speedKmh,
            gear: state.gear,
            powerKw: state.powerKw,
            accelLongitudinal: state.accelLongitudinal,
            accelLateral: state.accelLateral,
            yawRate: state.yawRate,
            steerAngleDeg: state.steerAngleDeg,
            collision: state.collision
        };
        expect(activeStatusIcons(fromState, false)).toHaveLength(1);
    });
});
