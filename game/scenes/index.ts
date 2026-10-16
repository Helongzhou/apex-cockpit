/**
 * scenes/index.ts - Stage registry.
 *
 * The session and the UI both go through this table, so adding a stage is a one-line change and
 * the UI never needs to know which stages exist at build time (it renders what the game publishes
 * on `GameHost.stages`).
 */

import type * as THREE from 'three';
import type { World } from '@dimforge/rapier3d';
import { createEnvironment, type Environment } from '../world.js';
import { createHighwayEnvironment } from './highway.js';
import type { StageId } from '../types.js';

export interface StageDefinition {
    id: StageId;
    label: string;
    createEnvironment(scene: THREE.Scene, world: World): Environment;
}

export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
    { id: 'studio', label: '影棚', createEnvironment },
    { id: 'highway', label: '高速', createEnvironment: createHighwayEnvironment }
];

export const DEFAULT_STAGE: StageId = 'studio';

export function stageDefinition(id: StageId): StageDefinition {
    const definition = STAGE_DEFINITIONS.find(candidate => candidate.id === id);
    if (definition === undefined) {
        throw new Error(`Unknown stage: ${id}`);
    }
    return definition;
}

/** The list the UI renders; written to `GameHost.stages` when the game starts. */
export function stageSummaries(): Array<{ id: StageId; label: string }> {
    return STAGE_DEFINITIONS.map(({ id, label }) => ({ id, label }));
}
