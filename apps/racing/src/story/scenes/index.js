/**
 * Every story scene, in story order, and when each one plays
 * (design/SPEC-scenes.md §3). Pure data: no imports beyond the scene files.
 */
import prologue from './prologue.js';
import chapter1 from './chapter1.js';

export const SCENES = [...prologue, ...chapter1];

export const SCENE_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
