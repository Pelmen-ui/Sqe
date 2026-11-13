import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAG_JOINTS } from '../src/physics/core.js';
import { SoundEngine } from '../src/audio/audio.js';
import { QUALITY_ORDER, QUALITY_PRESETS } from '../src/core/quality.js';
import { EventBus } from '../src/core/events.js';

test('RAG_JOINTS defines strict anatomical joint limits for spine, neck, shoulders, elbows, hips, and knees', () => {
    assert.equal(RAG_JOINTS.length, 10);
    const byName = Object.fromEntries(RAG_JOINTS.map((j) => [j.name, j]));

    assert.equal(byName.spine.type, 'cone');
    assert.deepEqual([byName.spine.pitchMin, byName.spine.pitchMax], [-0.35, 0.50]);
    assert.equal(byName.spine.yawLimit, 0.35);
    assert.equal(byName.spine.rollLimit, 0.25);

    assert.equal(byName.neck.type, 'cone');
    assert.deepEqual([byName.neck.pitchMin, byName.neck.pitchMax], [-0.45, 0.55]);
    assert.equal(byName.neck.yawLimit, 0.85);
    assert.equal(byName.neck.rollLimit, 0.30);

    for (const side of ['shoulderL', 'shoulderR']) {
        assert.equal(byName[side].type, 'cone');
        assert.ok(byName[side].pitchMin >= -0.53 && byName[side].pitchMax <= 1.75);
        assert.ok(byName[side].rollLimit <= 1.49);
    }

    for (const side of ['elbowL', 'elbowR']) {
        assert.equal(byName[side].type, 'hinge');
        assert.equal(byName[side].lo, 0.0);
        assert.equal(byName[side].hi, 2.45);
    }

    for (const side of ['hipL', 'hipR']) {
        assert.equal(byName[side].type, 'cone');
        assert.ok(byName[side].pitchMin >= -0.35 && byName[side].pitchMax <= 1.75);
        assert.ok(byName[side].rollLimit <= 0.79);
    }

    for (const side of ['kneeL', 'kneeR']) {
        assert.equal(byName[side].type, 'hinge');
        assert.equal(byName[side].lo, 0.0);
        assert.equal(byName[side].hi, 2.35);
    }
});

test('SoundEngine schedules distant shots at speed of sound (343 m/s) and triggers concussion within 14m', () => {
    const events = new EventBus();
    const fakeEngine = {
        events,
        time: 1.5,
        camera: {
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            getWorldPosition(target) {
                target.set(0, 1.7, 0);
                return target;
            }
        }
    };
    const sound = new SoundEngine(fakeEngine);
    sound.install(fakeEngine);

    const before = sound.delayedEventsProcessed;
    events.emit('shot', { pos: { x: 0, y: 1.7, z: -343 }, isPlayer: false, weapon: { isExplosive: false } });
    assert.equal(sound.delayedEventsProcessed, before);

    sound.update(0.5);
    assert.equal(sound.delayedEventsProcessed, before);

    sound.update(0.55);
    assert.equal(sound.delayedEventsProcessed, before + 1);

    sound.concussion(0.8);
    assert.ok(sound.concussionTimer >= 4.0);
    assert.ok(sound.concussionLevel > 0.5);

    events.emit('order', { type: 'ATTACK' });
    assert.equal(sound.lastRadioCallout.key, 'order:attack');
});

test('QUALITY_PRESETS covers low, medium, high, and ultra tiers with complete budgets', () => {
    assert.deepEqual(QUALITY_ORDER, ['low', 'medium', 'high', 'ultra']);
    for (const key of QUALITY_ORDER) {
        const p = QUALITY_PRESETS[key];
        assert.ok(p.particles.budget > 0);
        assert.ok(p.decals.budget > 0);
        assert.ok(p.ragdolls.max > 0);
        assert.ok(p.lod.cullDistance > p.lod.soldierLod2);
    }
});
