import { describe, expect, it } from 'vitest';
import {
    METERS_PER_KILOMETER,
    SECONDS_PER_HOUR,
    UNITS_PER_METER,
    metersToWorldUnits,
    mpsToKmh,
    worldSpeedToKmh,
    worldSpeedToMps,
    worldUnitsToMeters
} from '../game/math/units.js';

/**
 * The unit bug this suite locks down (analysis U1/U2): the HUD printed raw world units as
 * km/h. The conversion chain is world units/s -> m/s -> km/h.
 */
describe('unit conversion', () => {
    it('converts world units to metres with the world scale', () => {
        expect(UNITS_PER_METER).toBe(8);
        expect(worldUnitsToMeters(8)).toBe(1);
        expect(worldUnitsToMeters(0)).toBe(0);
        expect(worldUnitsToMeters(-16)).toBe(-2);
        expect(metersToWorldUnits(1)).toBe(8);
    });

    it('is inverse to itself', () => {
        for (const value of [0, 1, 8, 123.456, -8]) {
            expect(worldUnitsToMeters(metersToWorldUnits(value))).toBeCloseTo(value, 12);
        }
    });

    it('converts m/s to km/h with the 3.6 factor', () => {
        expect(SECONDS_PER_HOUR / METERS_PER_KILOMETER).toBeCloseTo(3.6, 12);
        expect(mpsToKmh(0)).toBe(0);
        expect(mpsToKmh(1)).toBeCloseTo(3.6, 12);
        expect(mpsToKmh(-10)).toBeCloseTo(-36, 12);
    });

    it('converts a world speed to km/h through both steps', () => {
        // 8 world units/s = 1 m/s = 3.6 km/h
        expect(worldSpeedToMps(8)).toBe(1);
        expect(worldSpeedToKmh(8)).toBeCloseTo(3.6, 12);
        expect(worldSpeedToKmh(0)).toBe(0);
        // 80 world units/s = 10 m/s = 36 km/h (the simulation's motor limit)
        expect(worldSpeedToKmh(80)).toBeCloseTo(36, 12);
    });

    it('keeps the sign for reverse motion', () => {
        expect(worldSpeedToKmh(-8)).toBeCloseTo(-3.6, 12);
    });

    it('round-trips through the display value', () => {
        const worldSpeed = 37.5;
        const kmh = worldSpeedToKmh(worldSpeed);
        const backToWorld = (kmh / 3.6) * UNITS_PER_METER;
        expect(backToWorld).toBeCloseTo(worldSpeed, 12);
    });
});
