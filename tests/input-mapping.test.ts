import { describe, expect, it } from 'vitest';
import { DIRECTION_LABELS, NO_DIRECTION, describeDirection } from '../game/math/input-mapping.js';
import type { TouchControls } from '../game/types.js';

const idle: TouchControls = { forward: false, backward: false, left: false, right: false, brake: false, jump: false };
const pressed = (...actions: Array<keyof TouchControls>): TouchControls => {
    const controls: TouchControls = { ...idle };
    for (const action of actions) {
        controls[action] = true;
    }
    return controls;
};

describe('describeDirection', () => {
    it('reports no direction when nothing is pressed', () => {
        expect(describeDirection(idle)).toBe(NO_DIRECTION);
        expect(NO_DIRECTION).toBe('—');
    });

    it('labels a single input', () => {
        expect(describeDirection(pressed('forward'))).toBe('↑ Forward');
        expect(describeDirection(pressed('jump'))).toBe('🚀 Jump');
    });

    it('joins several inputs in the declared order, not the press order', () => {
        expect(describeDirection(pressed('left', 'forward'))).toBe('↑ Forward + ← Left');
        expect(describeDirection(pressed('jump', 'right', 'brake'))).toBe('→ Right + 🚗 Brake + 🚀 Jump');
    });

    it('has one label per action and no duplicates', () => {
        const actions = DIRECTION_LABELS.map(([action]) => action);
        expect(new Set(actions).size).toBe(actions.length);
        expect(actions.every(action => action in idle)).toBe(true);
    });
});
