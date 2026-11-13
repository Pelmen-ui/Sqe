import * as THREE from 'three';

const SPEED_OF_SOUND = 343.0;
const CRACK_RANGE = 3.0;
const CONCUSSION_RANGE = 14.0;
const CONCUSSION_LP_FREQ = 380;
const TINNITUS_FREQ_LO = 4000;
const TINNITUS_FREQ_HI = 6000;
const TINNITUS_DURATION = 5.0;
const DRONE_AUDIBLE_RANGE = 80.0;
const DELAY_POOL_SIZE = 64;

const _camPos = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _toSrc = new THREE.Vector3();

export class SoundEngine {
    constructor(engineRef) {
        this.engine = engineRef;
        this.name = 'sound';
        this.ctx = null;
        this.noiseBuffer = null;
        this.engineNode = null;
        this.turretNode = null;
        this.ambientDroneNode = null;
        this.listener = null;
        this.masterGain = null;
        this.concussionLP = null;
        this.concussionGain = null;
        this.tinnitusOsc = null;
        this.tinnitusGain = null;
        this.concussionTimer = 0;
        this.concussionLevel = 0;
        this.maxVoices = 32;
        this.activeVoices = 0;
        this.useHrtf = true;
        this._pannerPool = [];
        this._pannerIdx = 0;
        this._lastTurretYaw = 0;
        this._trackClankTimer = 0;
        this._fpvCalloutCooldown = 0;
        this.lastRadioCallout = null;
        this.delayedEventsProcessed = 0;

        this._delayPool = new Array(DELAY_POOL_SIZE);
        for (let i = 0; i < DELAY_POOL_SIZE; i++) {
            this._delayPool[i] = {
                active: false,
                timer: 0,
                kind: 0,
                x: 0,
                y: 0,
                z: 0,
                dist: 0,
                heavy: false
            };
        }
    }

    install(engine) {
        if (engine) this.engine = engine;
        const ev = this.engine?.events;
        if (!ev) return;

        ev.on('shot', (data) => {
            if (!data || data.isPlayer) return;
            this._updateListenerCoords();
            const pos = data.pos;
            if (!pos) return;
            const dx = pos.x - _camPos.x;
            const dy = pos.y - _camPos.y;
            const dz = pos.z - _camPos.z;
            const dist = Math.hypot(dx, dy, dz);
            const heavy = Boolean(data.weapon?.isExplosive || data.heavy);
            this._scheduleDelayed(0, pos.x, pos.y, pos.z, dist, heavy);
        });

        ev.on('vehicle:fired', (data) => {
            if (!data || !data.pos) return;
            this._updateListenerCoords();
            const dx = data.pos.x - _camPos.x;
            const dy = data.pos.y - _camPos.y;
            const dz = data.pos.z - _camPos.z;
            const dist = Math.hypot(dx, dy, dz);
            this._scheduleDelayed(0, data.pos.x, data.pos.y, data.pos.z, dist, Boolean(data.heavy));
            if (data.heavy && dist < 8.0) {
                this.playCasingBounce(data.pos.x, Math.max(0.1, data.pos.y - 0.8), data.pos.z);
            }
        });

        ev.on('explosion', (data) => {
            if (!data || !data.pos) return;
            this._updateListenerCoords();
            const dx = data.pos.x - _camPos.x;
            const dy = data.pos.y - _camPos.y;
            const dz = data.pos.z - _camPos.z;
            const dist = Math.hypot(dx, dy, dz);
            if (!data.handledPlayer) {
                this._scheduleDelayed(1, data.pos.x, data.pos.y, data.pos.z, dist, true);
            } else if (dist < CONCUSSION_RANGE) {
                this._triggerConcussion(dist);
            }
        });

        ev.on('bullet:nearmiss', (data) => {
            if (!data || !data.point) return;
            const dist = typeof data.distance === 'number' ? data.distance : 1.0;
            this.playSupersonicCrack(data.point.x, data.point.y, data.point.z, dist);
        });

        ev.on('casing:bounce', (data) => {
            if (!data || !data.pos) return;
            this.playCasingBounce(data.pos.x, data.pos.y, data.pos.z);
        });

        ev.on('order', (data) => {
            const orderType = data?.type || 'HOLD';
            const text = orderType === 'ATTACK' ? 'Штурм! Вперёд!' : 'Держать позицию!';
            this.radio(`order:${orderType.toLowerCase()}`, text);
        });

        ev.on('callout', (data) => {
            if (!data) return;
            this.radio(data.key || 'callout', data.text || 'Контакт!');
        });

        ev.on('launch', (data) => {
            if (!data || !data.pos) return;
            this._updateListenerCoords();
            const dist = Math.hypot(data.pos.x - _camPos.x, data.pos.y - _camPos.y, data.pos.z - _camPos.z);
            if (data.kind === 'rpg') {
                this._scheduleDelayed(0, data.pos.x, data.pos.y, data.pos.z, dist, true);
            }
        });

        ev.on('quality:changed', ({ profile }) => {
            if (profile?.audio) {
                this.maxVoices = profile.audio.maxVoices || 32;
                this.useHrtf = profile.audio.hrtf !== false;
                for (let i = 0; i < this._pannerPool.length; i++) {
                    this._pannerPool[i].panningModel = this.useHrtf ? 'HRTF' : 'equalpower';
                }
            }
        });

        ev.on('settings:changed', ({ key, value }) => {
            if (key === 'masterVolume' && this.masterGain && this.ctx) {
                this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, value)), this.ctx.currentTime, 0.02);
            }
        });
    }

    _scheduleDelayed(kind, x, y, z, dist, heavy) {
        const delay = dist / SPEED_OF_SOUND;
        if (delay <= 0.015) {
            if (kind === 1) {
                this.playExplosion(dist);
            } else {
                this.playGunshotSpatial(x, y, z, heavy, 0);
            }
            this.delayedEventsProcessed++;
            return;
        }
        for (let i = 0; i < DELAY_POOL_SIZE; i++) {
            const slot = this._delayPool[i];
            if (!slot.active) {
                slot.active = true;
                slot.timer = delay;
                slot.kind = kind;
                slot.x = x;
                slot.y = y;
                slot.z = z;
                slot.dist = dist;
                slot.heavy = heavy;
                return;
            }
        }
    }

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        const sr = this.ctx.sampleRate;

        this.noiseBuffer = this.ctx.createBuffer(1, sr * 2, sr);
        const data = this.noiseBuffer.getChannelData(0);
        let s = 0x5EED;
        for (let i = 0; i < data.length; i++) {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), s | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            data[i] = ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
        }

        this.listener = this.ctx.listener;
        this.masterGain = this.ctx.createGain();
        const vol = this.engine?.settings?.get('masterVolume') ?? 1.0;
        this.masterGain.gain.value = vol;
        this.masterGain.connect(this.ctx.destination);

        this.concussionLP = this.ctx.createBiquadFilter();
        this.concussionLP.type = 'lowpass';
        this.concussionLP.frequency.value = 22000;
        this.concussionLP.connect(this.masterGain);

        this.concussionGain = this.ctx.createGain();
        this.concussionGain.gain.value = 1.0;
        this.concussionGain.connect(this.concussionLP);

        const profile = this.engine?.quality?.profile?.audio;
        if (profile) {
            this.maxVoices = profile.maxVoices || 32;
            this.useHrtf = profile.hrtf !== false;
        }

        for (let i = 0; i < 12; i++) {
            this._pannerPool.push(this._makePanner());
        }
    }

    _makePanner() {
        if (!this.ctx) return null;
        const panner = this.ctx.createPanner();
        panner.panningModel = this.useHrtf ? 'HRTF' : 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 500;
        panner.rolloffFactor = 1.2;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        return panner;
    }

    _getPanner(x, y, z) {
        const p = this._pannerPool[this._pannerIdx % this._pannerPool.length];
        this._pannerIdx++;
        if (p && typeof p.positionX !== 'undefined') {
            p.positionX.value = x;
            p.positionY.value = y;
            p.positionZ.value = z;
        } else if (p) {
            p.setPosition(x, y, z);
        }
        return p;
    }

    _updateListenerCoords() {
        const cam = this.engine?.camera;
        if (!cam) return;
        cam.getWorldPosition(_camPos);
        _camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
        _camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    }

    _updateListener() {
        this._updateListenerCoords();
        if (!this.ctx || !this.listener) return;
        if (typeof this.listener.positionX !== 'undefined') {
            this.listener.positionX.value = _camPos.x;
            this.listener.positionY.value = _camPos.y;
            this.listener.positionZ.value = _camPos.z;
            this.listener.forwardX.value = _camFwd.x;
            this.listener.forwardY.value = _camFwd.y;
            this.listener.forwardZ.value = _camFwd.z;
            this.listener.upX.value = _camUp.x;
            this.listener.upY.value = _camUp.y;
            this.listener.upZ.value = _camUp.z;
        } else {
            this.listener.setPosition(_camPos.x, _camPos.y, _camPos.z);
            this.listener.setOrientation(_camFwd.x, _camFwd.y, _camFwd.z, _camUp.x, _camUp.y, _camUp.z);
        }
    }

    _voice() {
        if (this.activeVoices >= this.maxVoices) return false;
        this.activeVoices++;
        return true;
    }

    _endVoice() {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
    }

    playGunshot(distance = 0, isHeavy = false) {
        if (!this.ctx || !this.noiseBuffer) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const atten = Math.max(0.04, Math.min(1.0, 26.0 / (distance + 20.0)));
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isHeavy ? 380 : 1250, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + (isHeavy ? 0.42 : 0.17));
        filter.Q.value = 0.9;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime((isHeavy ? 1.25 : 0.78) * atten, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.46 : 0.21));

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.concussionGain);
        src.start(now);
        src.stop(now + (isHeavy ? 0.48 : 0.23));
        src.onended = () => this._endVoice();

        const osc = this.ctx.createOscillator();
        const punchGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isHeavy ? 98 : 195, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.11);
        punchGain.gain.setValueAtTime(0.62 * atten, now);
        punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);
        osc.connect(punchGain);
        punchGain.connect(this.concussionGain);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playGunshotSpatial(worldX, worldY, worldZ, isHeavy, listenerDist) {
        if (!this.ctx || !this.noiseBuffer) return;
        const delay = listenerDist / SPEED_OF_SOUND;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const startAt = now + delay;
        const atten = Math.max(0.04, Math.min(1.0, 26.0 / (listenerDist + 20.0)));

        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isHeavy ? 380 : 1250, startAt);
        filter.frequency.exponentialRampToValueAtTime(140, startAt + (isHeavy ? 0.42 : 0.17));
        filter.Q.value = 0.9;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, startAt);
        gain.gain.linearRampToValueAtTime((isHeavy ? 1.25 : 0.78) * atten, startAt + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + (isHeavy ? 0.46 : 0.21));

        const panner = this._getPanner(worldX, worldY, worldZ);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.concussionGain);
        src.start(startAt);
        src.stop(startAt + (isHeavy ? 0.48 : 0.23));
        src.onended = () => this._endVoice();
    }

    playExplosion(distance = 0) {
        if (distance < CONCUSSION_RANGE) {
            this._triggerConcussion(distance);
        }
        if (!this.ctx || !this.noiseBuffer) return;
        if (!this._voice()) return;
        const delay = distance / SPEED_OF_SOUND;
        const now = this.ctx.currentTime;
        const startAt = now + delay;
        const atten = Math.max(0.08, Math.min(1.0, 55.0 / (distance + 18.0)));
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(540, startAt);
        lp.frequency.exponentialRampToValueAtTime(42, startAt + 1.45);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, startAt);
        gain.gain.linearRampToValueAtTime(1.4 * atten, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + 1.5);

        src.connect(lp);
        lp.connect(gain);
        gain.connect(this.concussionGain);
        src.start(startAt);
        src.stop(startAt + 1.55);
        src.onended = () => this._endVoice();
    }

    concussion(amount = 1.0) {
        const clamped = Math.max(0.05, Math.min(1.0, amount));
        const syntheticDist = (1.0 - clamped) * CONCUSSION_RANGE;
        this._triggerConcussion(syntheticDist);
    }

    _triggerConcussion(distance) {
        const intensity = Math.pow(Math.max(0, 1 - distance / CONCUSSION_RANGE), 1.5);
        const duration = Math.max(4.0, TINNITUS_DURATION * Math.max(0.8, intensity));
        this.concussionTimer = duration;
        this.concussionLevel = Math.max(this.concussionLevel, intensity);

        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        this.concussionLP.frequency.cancelScheduledValues(now);
        this.concussionLP.frequency.setValueAtTime(CONCUSSION_LP_FREQ, now);
        this.concussionLP.frequency.exponentialRampToValueAtTime(22000, now + duration);

        if (this.tinnitusOsc) {
            try { this.tinnitusOsc.stop(); } catch (_) {}
        }

        this.tinnitusOsc = this.ctx.createOscillator();
        this.tinnitusGain = this.ctx.createGain();
        this.tinnitusOsc.type = 'sine';
        const freq = TINNITUS_FREQ_LO + (TINNITUS_FREQ_HI - TINNITUS_FREQ_LO) * intensity;
        this.tinnitusOsc.frequency.value = freq;
        this.tinnitusGain.gain.setValueAtTime(Math.max(0.02, 0.18 * intensity), now);
        this.tinnitusGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        this.tinnitusOsc.connect(this.tinnitusGain);
        this.tinnitusGain.connect(this.masterGain);
        this.tinnitusOsc.start(now);
        this.tinnitusOsc.stop(now + duration + 0.1);
    }

    playSupersonicCrack(worldX, worldY, worldZ, listenerDist) {
        if (!this.ctx || listenerDist > CRACK_RANGE) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const atten = Math.max(0.1, 1 - listenerDist / CRACK_RANGE);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(4200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.015);
        gain.gain.setValueAtTime(0.55 * atten, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

        const panner = this._getPanner(worldX, worldY, worldZ);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.concussionGain);
        osc.start(now);
        osc.stop(now + 0.03);
        osc.onended = () => this._endVoice();
    }

    playHitMarker(isHeadshot = false) {
        if (!this.ctx) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = isHeadshot ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(isHeadshot ? 1680 : 920, now);
        osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 620 : 340, now + 0.075);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.085);
        osc.onended = () => this._endVoice();
    }

    playReloadClick(pitch = 640) {
        if (!this.ctx) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.045);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.055);
        osc.onended = () => this._endVoice();
    }

    playRadioSquelch() {
        if (!this.ctx || !this.noiseBuffer) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1800;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2600;
        bp.Q.value = 2.6;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        src.connect(hp);
        hp.connect(bp);
        bp.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
        src.stop(now + 0.1);
        src.onended = () => this._endVoice();
    }

    radio(key, text = '') {
        this.lastRadioCallout = { key, text, time: this.engine?.time || 0 };
        this.playRadioSquelch();
        if (!this.ctx || !this.noiseBuffer) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const bp = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        const isAlert = key === 'fpv' || key === 'grenade';
        osc.frequency.setValueAtTime(isAlert ? 235 : 175, now + 0.05);
        osc.frequency.linearRampToValueAtTime(isAlert ? 290 : 155, now + 0.18);
        osc.frequency.linearRampToValueAtTime(isAlert ? 210 : 140, now + 0.34);
        bp.type = 'bandpass';
        bp.frequency.value = 1150;
        bp.Q.value = 3.2;
        gain.gain.setValueAtTime(0.001, now + 0.05);
        gain.gain.linearRampToValueAtTime(0.075, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.connect(bp);
        bp.connect(gain);
        gain.connect(this.concussionGain);
        osc.start(now + 0.05);
        osc.stop(now + 0.38);
        osc.onended = () => this._endVoice();
    }

    createDroneMotorNode() {
        if (!this.ctx) return null;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 390;
        gain.gain.value = 0.0;
        osc.connect(gain);
        gain.connect(this.concussionGain);
        osc.start();
        return { osc, gain };
    }

    updateDroneAudio(droneNode, distance, speed, maxSpeed, radialVel = 0) {
        if (!droneNode || !this.ctx) return;
        if (distance > DRONE_AUDIBLE_RANGE) {
            droneNode.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
            return;
        }
        const vol = Math.max(0.01, 1 - distance / DRONE_AUDIBLE_RANGE) * 0.25;
        droneNode.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.04);

        const baseFreq = 390;
        const speedRatio = speed / Math.max(1, maxSpeed);
        const clampedRadial = Math.max(-120, Math.min(120, radialVel));
        const doppler = SPEED_OF_SOUND / (SPEED_OF_SOUND - clampedRadial);
        const targetFreq = baseFreq * (1 + speedRatio * 0.32) * doppler;
        droneNode.osc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.03);
    }

    updateVehicleEngineSound(active, speedKmh, throttle) {
        if (!this.ctx) return;
        if (!this.engineNode) {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = 48;
            filter.type = 'lowpass';
            filter.frequency.value = 190;
            gain.gain.value = 0.0;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.concussionGain);
            osc.start();

            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'triangle';
            subOsc.frequency.value = 24;
            subGain.gain.value = 0.0;
            subOsc.connect(subGain);
            subGain.connect(this.concussionGain);
            subOsc.start();

            this.engineNode = { osc, filter, gain, subOsc, subGain };
        }
        if (!active) {
            this.engineNode.gain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.08);
            this.engineNode.subGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.08);
            return;
        }
        const rpmFreq = 46 + Math.min(85, speedKmh * 1.15 + Math.abs(throttle) * 28);
        this.engineNode.osc.frequency.setTargetAtTime(rpmFreq, this.ctx.currentTime, 0.06);
        this.engineNode.filter.frequency.setTargetAtTime(160 + rpmFreq * 2.2, this.ctx.currentTime, 0.06);
        this.engineNode.gain.gain.setTargetAtTime(0.11, this.ctx.currentTime, 0.08);

        this.engineNode.subOsc.frequency.setTargetAtTime(rpmFreq * 0.5, this.ctx.currentTime, 0.06);
        this.engineNode.subGain.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.08);
    }

    _updateTurretWhine(yawRate) {
        if (!this.ctx) return;
        if (!this.turretNode) {
            const osc = this.ctx.createOscillator();
            const bp = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = 520;
            bp.type = 'bandpass';
            bp.frequency.value = 680;
            bp.Q.value = 4.0;
            gain.gain.value = 0;
            osc.connect(bp);
            bp.connect(gain);
            gain.connect(this.concussionGain);
            osc.start();
            this.turretNode = { osc, gain };
        }
        const absRate = Math.abs(yawRate);
        if (absRate < 0.02) {
            this.turretNode.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
            return;
        }
        const pitch = 480 + Math.min(360, absRate * 240);
        this.turretNode.osc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.03);
        this.turretNode.gain.gain.setTargetAtTime(Math.min(0.055, absRate * 0.04), this.ctx.currentTime, 0.03);
    }

    playTrackClank(worldX, worldY, worldZ) {
        if (!this.ctx || !this.noiseBuffer) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 800;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        const panner = this._getPanner(worldX, worldY, worldZ);
        src.connect(hp);
        hp.connect(gain);
        gain.connect(panner);
        panner.connect(this.concussionGain);
        src.start(now);
        src.stop(now + 0.08);
        src.onended = () => this._endVoice();
    }

    playCasingBounce(worldX, worldY, worldZ) {
        if (!this.ctx) return;
        if (!this._voice()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(3800 + Math.random() * 1200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        const panner = this._getPanner(worldX, worldY, worldZ);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.concussionGain);
        osc.start(now);
        osc.stop(now + 0.06);
        osc.onended = () => this._endVoice();
    }

    update(dt) {
        this._updateListener();

        for (let i = 0; i < DELAY_POOL_SIZE; i++) {
            const slot = this._delayPool[i];
            if (!slot.active) continue;
            slot.timer -= dt;
            if (slot.timer <= 0) {
                slot.active = false;
                this.delayedEventsProcessed++;
                if (slot.kind === 1) {
                    this.playExplosion(slot.dist);
                } else {
                    this.playGunshotSpatial(slot.x, slot.y, slot.z, slot.heavy, 0);
                }
            }
        }

        if (this.concussionTimer > 0) {
            this.concussionTimer -= dt;
            if (this.concussionTimer <= 0) {
                this.concussionTimer = 0;
                this.concussionLevel = 0;
            }
        }

        if (this._fpvCalloutCooldown > 0) {
            this._fpvCalloutCooldown = Math.max(0, this._fpvCalloutCooldown - dt);
        }

        const drones = this.engine?.drones;
        if (drones && drones.length > 0) {
            let nearestDist = 9999;
            let nearestSpeed = 0;
            let nearestRadial = 0;
            for (let i = 0; i < drones.length; i++) {
                const d = drones[i];
                if (!d || d.destroyed || !d.position) continue;
                _toSrc.subVectors(d.position, _camPos);
                const dist = _toSrc.length();
                if (dist < nearestDist) {
                    nearestDist = dist;
                    const vel = d.velocity;
                    if (vel && dist > 0.001) {
                        nearestSpeed = vel.length();
                        nearestRadial = -vel.dot(_toSrc) / dist;
                    } else {
                        nearestSpeed = d.speed || 18;
                        nearestRadial = 0;
                    }
                }
            }
            if (nearestDist < DRONE_AUDIBLE_RANGE) {
                if (this.ctx && !this.ambientDroneNode) {
                    this.ambientDroneNode = this.createDroneMotorNode();
                }
                this.updateDroneAudio(this.ambientDroneNode, nearestDist, nearestSpeed, 30, nearestRadial);
                if (nearestDist < 55 && this._fpvCalloutCooldown <= 0) {
                    this._fpvCalloutCooldown = 14.0;
                    this.radio('fpv', 'Воздух! FPV!');
                }
            } else if (this.ambientDroneNode) {
                this.updateDroneAudio(this.ambientDroneNode, 999, 0, 30, 0);
            }
        }

        const pVeh = this.engine?.playerVehicleState?.vehicle;
        if (pVeh && !pVeh.destroyed && dt > 0) {
            const yawDelta = (pVeh.turretYaw || 0) - this._lastTurretYaw;
            this._lastTurretYaw = pVeh.turretYaw || 0;
            this._updateTurretWhine(yawDelta / dt);

            const isTracked = Boolean(pVeh.spec?.isTracked);
            const movingOrPivoting = Math.abs(pVeh.forwardSpeed || 0) > 0.6 || Math.abs(pVeh.controls?.steer || 0) > 0.2;
            if (isTracked && movingOrPivoting) {
                this._trackClankTimer -= dt * (1.0 + Math.abs(pVeh.forwardSpeed || 0) * 0.35);
                if (this._trackClankTimer <= 0) {
                    this._trackClankTimer = 0.22;
                    this.playTrackClank(pVeh.chassisPos.x, pVeh.chassisPos.y + 0.4, pVeh.chassisPos.z);
                }
            }
        } else if (this.turretNode) {
            this._updateTurretWhine(0);
        }
    }
}
