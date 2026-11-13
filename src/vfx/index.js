import * as THREE from 'three';

const MAX_PARTICLES = 16384;
const MAX_CASINGS = 128;
const MAX_TRACERS = 128;
const MAX_LIGHTS = 6;
const ATLAS_SIZE = 512;
const ATLAS_CELLS = 4;
const CELL_SIZE = ATLAS_SIZE / ATLAS_CELLS;

const FRAME_SMOKE = 0;
const FRAME_FLAME = 1;
const FRAME_SPARK = 2;
const FRAME_BLOOD = 3;
const FRAME_SHOCKWAVE = 4;
const FRAME_DUST = 5;

const PARTICLE_VERTEX = `
attribute vec3 aOffset;
attribute vec4 aVelLife;
attribute vec4 aSizeRotFrame;
varying vec2 vUv;
varying float vLife;
varying float vFrame;

void main() {
    float life = aVelLife.w;
    vLife = life;
    vFrame = aSizeRotFrame.w;
    float grow = (vFrame < 0.5 || vFrame > 3.5) ? (1.0 + life * 0.65) : (1.0 - life * 0.25);
    float size = max(0.0, aSizeRotFrame.x * grow);
    float rot = aSizeRotFrame.y + life * aSizeRotFrame.z;
    float c = cos(rot);
    float s = sin(rot);
    vec2 p = position.xy;
    vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * size;
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 worldPos = aOffset + camRight * rp.x + camUp * rp.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    vUv = uv;
}`;

const PARTICLE_FRAGMENT = `
varying vec2 vUv;
varying float vLife;
varying float vFrame;
uniform sampler2D uAtlas;
uniform float uCells;

void main() {
    float frame = floor(vFrame + 0.5);
    float row = floor(frame / uCells);
    float col = frame - row * uCells;
    vec2 cell = (vec2(col, row) + vUv) / uCells;
    vec4 tex = texture2D(uAtlas, cell);
    float maxL = (frame < 0.5 || frame > 4.5) ? 3.5 : ((frame > 1.5 && frame < 2.5) ? 1.5 : 2.0);
    float normLife = clamp(vLife / maxL, 0.0, 1.0);
    float alpha = tex.a * (1.0 - smoothstep(0.55, 1.0, normLife));
    if (alpha < 0.01) discard;
    vec3 rgb = tex.rgb;
    if (frame > 0.5 && frame < 2.5) {
        rgb *= (2.2 - normLife * 1.1);
    }
    gl_FragColor = vec4(rgb, alpha);
}`;

function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

function generateAtlas() {
    const canvas = makeCanvas(ATLAS_SIZE, ATLAS_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

    function drawCell(col, row, fn) {
        ctx.save();
        ctx.translate(col * CELL_SIZE, row * CELL_SIZE);
        fn(ctx, CELL_SIZE);
        ctx.restore();
    }

    drawCell(0, 0, (c, s) => {
        const cx = s / 2, cy = s / 2, r = s * 0.44;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(95,92,88,0.82)');
        grad.addColorStop(0.5, 'rgba(68,65,62,0.52)');
        grad.addColorStop(1, 'rgba(40,40,40,0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, s, s);
    });

    drawCell(1, 0, (c, s) => {
        const cx = s / 2, cy = s / 2, r = s * 0.42;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(255,235,140,0.96)');
        grad.addColorStop(0.35, 'rgba(255,135,25,0.85)');
        grad.addColorStop(0.7, 'rgba(190,45,8,0.42)');
        grad.addColorStop(1, 'rgba(40,10,0,0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, s, s);
    });

    drawCell(2, 0, (c, s) => {
        const cx = s / 2, cy = s / 2;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, s * 0.35);
        grad.addColorStop(0, 'rgba(255,250,200,0.98)');
        grad.addColorStop(0.4, 'rgba(255,180,60,0.85)');
        grad.addColorStop(1, 'rgba(255,90,10,0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, s, s);
    });

    drawCell(3, 0, (c, s) => {
        const cx = s / 2, cy = s / 2, r = s * 0.42;
        const grad = c.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        grad.addColorStop(0, 'rgba(135,14,14,0.88)');
        grad.addColorStop(0.55, 'rgba(95,8,8,0.48)');
        grad.addColorStop(1, 'rgba(55,4,4,0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, s, s);
    });

    drawCell(0, 1, (c, s) => {
        const cx = s / 2, cy = s / 2, r = s * 0.46;
        const grad = c.createRadialGradient(cx, cy, r * 0.65, cx, cy, r);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,240,200,0.52)');
        grad.addColorStop(1, 'rgba(255,220,160,0)');
        c.fillStyle = grad;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
    });

    drawCell(1, 1, (c, s) => {
        const cx = s / 2, cy = s / 2, r = s * 0.45;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(115,96,72,0.80)');
        grad.addColorStop(0.6, 'rgba(82,68,50,0.46)');
        grad.addColorStop(1, 'rgba(45,38,28,0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, s, s);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _eul = new THREE.Euler();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function createVfx(engine) {
    const scene = engine.scene;
    let atlas = null;
    let geo = null;
    let mat = null;
    let mesh = null;

    const pos = new Float32Array(MAX_PARTICLES * 3);
    const velLife = new Float32Array(MAX_PARTICLES * 4);
    const sizeRotFrame = new Float32Array(MAX_PARTICLES * 4);
    let head = 0;
    let count = 0;
    let budget = 9000;

    let casingMesh = null;
    const casingData = new Float32Array(MAX_CASINGS * 11);
    let casingHead = 0;
    let casingActive = 0;

    let tracerMesh = null;
    const tracerPool = [];

    const lightPool = [];
    const smokeClouds = [];
    const burningVehicles = new Map();
    const cookOffVehicles = new Map();

    const _rng = (() => {
        let s = 0xDEAD;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), s | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    })();

    function init() {
        budget = engine.quality?.profile?.particles?.budget ?? 9000;
        atlas = generateAtlas();
        const quadGeo = new THREE.PlaneGeometry(1, 1);

        geo = new THREE.InstancedBufferGeometry();
        geo.index = quadGeo.index;
        geo.setAttribute('position', quadGeo.getAttribute('position'));
        geo.setAttribute('uv', quadGeo.getAttribute('uv'));
        geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aVelLife', new THREE.InstancedBufferAttribute(velLife, 4).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aSizeRotFrame', new THREE.InstancedBufferAttribute(sizeRotFrame, 4).setUsage(THREE.DynamicDrawUsage));
        geo.instanceCount = 0;

        mat = new THREE.ShaderMaterial({
            vertexShader: PARTICLE_VERTEX,
            fragmentShader: PARTICLE_FRAGMENT,
            uniforms: {
                uAtlas: { value: atlas },
                uCells: { value: ATLAS_CELLS }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.name = 'vfx_particles';
        scene.add(mesh);

        const cGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.036, 6);
        cGeo.rotateZ(Math.PI * 0.5);
        const cMat = new THREE.MeshStandardMaterial({ color: 0xd8a838, metalness: 0.85, roughness: 0.25 });
        casingMesh = new THREE.InstancedMesh(cGeo, cMat, MAX_CASINGS);
        casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        casingMesh.frustumCulled = false;
        casingMesh.count = 0;
        casingMesh.name = 'vfx_casings';
        scene.add(casingMesh);

        const tGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.0, 6);
        tGeo.rotateX(Math.PI * 0.5);
        const tMat = new THREE.MeshBasicMaterial({ color: 0xffd24c, transparent: true, opacity: 0.96, depthWrite: false });
        tracerMesh = new THREE.InstancedMesh(tGeo, tMat, MAX_TRACERS);
        tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        tracerMesh.frustumCulled = false;
        tracerMesh.count = MAX_TRACERS;
        tracerMesh.name = 'vfx_tracers';
        _scale.set(0, 0, 0);
        _mat4.compose(_pos.set(0, -100, 0), _quat.identity(), _scale);
        for (let i = 0; i < MAX_TRACERS; i++) {
            tracerMesh.setMatrixAt(i, _mat4);
            const idx = i;
            const slot = {
                idx,
                active: false,
                ttl: 0,
                set(p, v) {
                    const spd = Math.hypot(v.x, v.y, v.z) || 1;
                    const len = Math.min(7.5, Math.max(2.2, spd * 0.015));
                    _dir.set(v.x / spd, v.y / spd, v.z / spd);
                    _quat.setFromUnitVectors(_up.set(0, 0, 1), _dir);
                    _pos.set(p.x - _dir.x * len * 0.5, p.y - _dir.y * len * 0.5, p.z - _dir.z * len * 0.5);
                    _scale.set(1, 1, len);
                    _mat4.compose(_pos, _quat, _scale);
                    tracerMesh.setMatrixAt(idx, _mat4);
                    tracerMesh.instanceMatrix.needsUpdate = true;
                },
                release() {
                    slot.active = false;
                    slot.ttl = 0;
                    _scale.set(0, 0, 0);
                    _mat4.compose(_pos.set(0, -100, 0), _quat.identity(), _scale);
                    tracerMesh.setMatrixAt(idx, _mat4);
                    tracerMesh.instanceMatrix.needsUpdate = true;
                }
            };
            tracerPool.push(slot);
        }
        scene.add(tracerMesh);

        for (let i = 0; i < MAX_LIGHTS; i++) {
            const pt = new THREE.PointLight(0xffaa33, 0, 18);
            pt.position.set(0, -100, 0);
            scene.add(pt);
            lightPool.push({ light: pt, ttl: 0, maxTtl: 0.1, peak: 0 });
        }
    }

    function spawnLight(x, y, z, color, intensity, distance, ttl) {
        const maxLights = engine.quality?.profile?.lighting?.maxDynamicLights ?? 4;
        if (maxLights <= 0) return;
        let pick = lightPool[0];
        for (let i = 0; i < Math.min(maxLights, lightPool.length); i++) {
            if (lightPool[i].ttl <= 0) {
                pick = lightPool[i];
                break;
            }
            if (lightPool[i].ttl < pick.ttl) pick = lightPool[i];
        }
        pick.light.color.setHex(color);
        pick.light.intensity = intensity;
        pick.light.distance = distance;
        pick.light.position.set(x, y, z);
        pick.ttl = ttl;
        pick.maxTtl = ttl;
        pick.peak = intensity;
    }

    function light(opts = {}) {
        const p = opts.pos || _pos;
        spawnLight(p.x || 0, p.y || 0, p.z || 0, opts.color ?? 0xffaa33, opts.intensity ?? 16, opts.distance ?? 18, opts.ttl ?? 0.14);
    }

    function emit(x, y, z, vx, vy, vz, size, rot, rotSpeed, frame) {
        const cap = Math.min(budget, MAX_PARTICLES);
        let i;
        if (count < cap) {
            i = count;
            count++;
        } else {
            i = head % cap;
            head = (head + 1) % cap;
        }
        const o3 = i * 3;
        const o4 = i * 4;
        pos[o3] = x;
        pos[o3 + 1] = y;
        pos[o3 + 2] = z;
        velLife[o4] = vx;
        velLife[o4 + 1] = vy;
        velLife[o4 + 2] = vz;
        velLife[o4 + 3] = 0;
        sizeRotFrame[o4] = size;
        sizeRotFrame[o4 + 1] = rot;
        sizeRotFrame[o4 + 2] = rotSpeed;
        sizeRotFrame[o4 + 3] = frame;
    }

    function step(dt) {
        if (!mesh) return;
        const gravity = -9.81;
        const windX = engine.wind ? engine.wind.x : 1.4;
        const windZ = engine.wind ? engine.wind.z : 0.6;

        for (let i = 0; i < count; i++) {
            const o3 = i * 3;
            const o4 = i * 4;
            const frame = sizeRotFrame[o4 + 3];
            const isSmoke = frame === FRAME_SMOKE || frame === FRAME_DUST;
            const isSpark = frame === FRAME_SPARK;

            velLife[o4 + 3] += dt;
            const life = velLife[o4 + 3];
            const maxLife = isSmoke ? 3.5 : (isSpark ? 1.5 : 2.0);
            if (life >= maxLife) {
                const last = count - 1;
                if (i !== last) {
                    const lo3 = last * 3;
                    const lo4 = last * 4;
                    pos[o3] = pos[lo3];
                    pos[o3 + 1] = pos[lo3 + 1];
                    pos[o3 + 2] = pos[lo3 + 2];
                    velLife[o4] = velLife[lo4];
                    velLife[o4 + 1] = velLife[lo4 + 1];
                    velLife[o4 + 2] = velLife[lo4 + 2];
                    velLife[o4 + 3] = velLife[lo4 + 3];
                    sizeRotFrame[o4] = sizeRotFrame[lo4];
                    sizeRotFrame[o4 + 1] = sizeRotFrame[lo4 + 1];
                    sizeRotFrame[o4 + 2] = sizeRotFrame[lo4 + 2];
                    sizeRotFrame[o4 + 3] = sizeRotFrame[lo4 + 3];
                }
                count--;
                i--;
                continue;
            }

            if (isSmoke) {
                velLife[o4] += windX * dt * 0.45;
                velLife[o4 + 2] += windZ * dt * 0.45;
                velLife[o4 + 1] += 1.4 * dt;
            } else if (isSpark) {
                velLife[o4 + 1] += gravity * 1.4 * dt;
            } else if (frame === FRAME_BLOOD) {
                velLife[o4 + 1] += gravity * 0.7 * dt;
            }

            const drag = Math.max(0, 1 - dt * (isSmoke ? 1.1 : 1.8));
            velLife[o4] *= drag;
            velLife[o4 + 1] *= (1 - dt * (isSmoke ? 0.85 : 1.4));
            velLife[o4 + 2] *= drag;

            pos[o3] += velLife[o4] * dt;
            pos[o3 + 1] += velLife[o4 + 1] * dt;
            pos[o3 + 2] += velLife[o4 + 2] * dt;

            if (pos[o3 + 1] < 0.03 && isSpark) {
                pos[o3 + 1] = 0.03;
                velLife[o4 + 1] = Math.abs(velLife[o4 + 1]) * 0.35;
                velLife[o4] *= 0.65;
                velLife[o4 + 2] *= 0.65;
            }
        }

        geo.instanceCount = count;
        geo.attributes.aOffset.needsUpdate = true;
        geo.attributes.aVelLife.needsUpdate = true;
        geo.attributes.aSizeRotFrame.needsUpdate = true;

        for (let i = 0; i < lightPool.length; i++) {
            const lp = lightPool[i];
            if (lp.ttl <= 0) continue;
            lp.ttl -= dt;
            if (lp.ttl <= 0) {
                lp.light.intensity = 0;
            } else {
                lp.light.intensity = lp.peak * (lp.ttl / lp.maxTtl);
            }
        }

        for (let i = 0; i < tracerPool.length; i++) {
            const tr = tracerPool[i];
            if (tr.active && tr.ttl > 0) {
                tr.ttl -= dt;
                if (tr.ttl <= 0) tr.release();
            }
        }

        if (casingActive > 0) {
            let drawIdx = 0;
            for (let i = 0; i < MAX_CASINGS; i++) {
                const o = i * 11;
                if (casingData[o + 9] <= 0) continue;
                casingData[o + 9] -= dt;
                if (casingData[o + 9] <= 0) {
                    casingActive = Math.max(0, casingActive - 1);
                    continue;
                }
                casingData[o + 4] -= 18.0 * dt;
                casingData[o] += casingData[o + 3] * dt;
                casingData[o + 1] += casingData[o + 4] * dt;
                casingData[o + 2] += casingData[o + 5] * dt;
                casingData[o + 6] += casingData[o + 7] * dt;
                casingData[o + 8] += casingData[o + 7] * 0.7 * dt;
                if (casingData[o + 1] <= 0.02) {
                    casingData[o + 1] = 0.02;
                    casingData[o + 4] = Math.abs(casingData[o + 4]) * 0.35;
                    casingData[o + 3] *= 0.68;
                    casingData[o + 5] *= 0.68;
                    if (casingData[o + 10] < 2) {
                        casingData[o + 10] += 1;
                        _pos.set(casingData[o], 0.02, casingData[o + 2]);
                        engine.events?.emit?.('casing:bounce', { pos: _pos });
                    }
                }
                _pos.set(casingData[o], casingData[o + 1], casingData[o + 2]);
                _eul.set(casingData[o + 6], casingData[o + 8], casingData[o + 6] * 0.5);
                _quat.setFromEuler(_eul);
                _scale.set(1, 1, 1);
                _mat4.compose(_pos, _quat, _scale);
                casingMesh.setMatrixAt(drawIdx++, _mat4);
            }
            casingMesh.count = drawIdx;
            casingMesh.instanceMatrix.needsUpdate = true;
        }

        for (let i = smokeClouds.length - 1; i >= 0; i--) {
            const sc = smokeClouds[i];
            sc.age += dt;
            if (sc.age >= sc.duration) {
                smokeClouds.splice(i, 1);
                continue;
            }
            sc.pos.x += windX * dt * 0.35;
            sc.pos.z += windZ * dt * 0.35;
            sc.emitTimer -= dt;
            if (sc.emitTimer <= 0 && sc.age < sc.duration - 2.5) {
                sc.emitTimer = 0.22;
                const ang = _rng() * Math.PI * 2;
                const d = _rng() * sc.radius * 0.65;
                emit(
                    sc.pos.x + Math.cos(ang) * d,
                    sc.pos.y + 0.4 + _rng() * 1.4,
                    sc.pos.z + Math.sin(ang) * d,
                    (_rng() - 0.5) * 1.2,
                    0.6 + _rng() * 0.8,
                    (_rng() - 0.5) * 1.2,
                    3.8 + _rng() * 4.2,
                    _rng() * 6.28,
                    (_rng() - 0.5) * 0.35,
                    FRAME_SMOKE
                );
            }
        }

        for (const [veh, st] of burningVehicles) {
            if (!veh || !veh.chassisPos) {
                burningVehicles.delete(veh);
                continue;
            }
            st.timer -= dt;
            if (st.timer <= 0) {
                st.timer = 0.08;
                emitVehicleFireStep(veh.chassisPos, st.intensity);
            }
        }

        for (const [veh, rem] of cookOffVehicles) {
            const next = rem - dt;
            if (next <= 0 || !veh || !veh.chassisPos) {
                cookOffVehicles.delete(veh);
                continue;
            }
            cookOffVehicles.set(veh, next);
            const p = veh.chassisPos;
            const rnd = _rng;
            for (let i = 0; i < 3; i++) {
                emit(
                    p.x + (rnd() - 0.5) * 0.5,
                    p.y + 1.8,
                    p.z + (rnd() - 0.5) * 0.5,
                    (rnd() - 0.5) * 4.5,
                    8.0 + rnd() * 10.0,
                    (rnd() - 0.5) * 4.5,
                    0.5 + rnd() * 0.9,
                    rnd() * 6.28,
                    (rnd() - 0.5) * 6,
                     i === 0 ? FRAME_SPARK : FRAME_FLAME
                );
            }
        }
    }

    function explosion(epicenter, opts = {}) {
        if (!epicenter) return;
        const x = epicenter.x, y = epicenter.y, z = epicenter.z;
        const r = opts.radius || 8;
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;

        spawnLight(x, y + 0.8, z, 0xff9922, Math.min(36, r * 3.8), Math.max(18, r * 3.0), 0.22);

        emit(x, y + 0.35, z, 0, 0.5, 0, Math.max(3.5, r * 0.95), 0, 0, FRAME_SHOCKWAVE);

        const coreCount = Math.ceil(14 * emission);
        for (let i = 0; i < coreCount; i++) {
            const spd = 2.0 + rnd() * 4.5;
            const ax = (rnd() - 0.5) * 2, ay = rnd() * 1.5 + 1.0, az = (rnd() - 0.5) * 2;
            emit(x + (rnd() - 0.5) * 0.5, y + rnd() * 0.8, z + (rnd() - 0.5) * 0.5,
                ax * spd, ay * spd, az * spd,
                1.2 + rnd() * 2.5, rnd() * 6.28, (rnd() - 0.5) * 3, FRAME_FLAME);
        }

        const smokeCount = Math.ceil(22 * emission);
        for (let i = 0; i < smokeCount; i++) {
            const spd = 1.5 + rnd() * 3.5;
            const ax = (rnd() - 0.5) * 2, ay = 1.5 + rnd() * 2.5, az = (rnd() - 0.5) * 2;
            emit(x + (rnd() - 0.5), y + rnd() * 0.4, z + (rnd() - 0.5),
                ax * spd, ay * spd, az * spd,
                2.0 + rnd() * 3.5, rnd() * 6.28, (rnd() - 0.5) * 1.5, FRAME_SMOKE);
        }

        const shrapnelCount = Math.ceil(18 * emission);
        for (let i = 0; i < shrapnelCount; i++) {
            const spd = 8 + rnd() * 16;
            const ax = (rnd() - 0.5) * 2, ay = rnd() * 1.2 + 0.3, az = (rnd() - 0.5) * 2;
            const len = Math.hypot(ax, ay, az) || 1;
            emit(x, y + 0.3, z,
                (ax / len) * spd, (ay / len) * spd, (az / len) * spd,
                0.08 + rnd() * 0.15, rnd() * 6.28, (rnd() - 0.5) * 20, FRAME_SPARK);
        }

        const dustCount = Math.ceil(14 * emission);
        for (let i = 0; i < dustCount; i++) {
            const ang = rnd() * Math.PI * 2;
            const spd = 3 + rnd() * r * 0.65;
            emit(x + Math.cos(ang) * 0.5, y + 0.05, z + Math.sin(ang) * 0.5,
                Math.cos(ang) * spd, 0.3 + rnd() * 0.6, Math.sin(ang) * spd,
                3.0 + rnd() * 4.0, rnd() * 6.28, (rnd() - 0.5) * 0.5, FRAME_DUST);
        }
    }

    function muzzleFlash(posOrOpts, direction, isHeavy) {
        let position = posOrOpts;
        let dir = direction;
        let heavy = isHeavy;
        if (posOrOpts && posOrOpts.pos) {
            position = posOrOpts.pos;
            dir = posOrOpts.dir || _up;
            heavy = Boolean(posOrOpts.heavy || posOrOpts.kind === 'cannon' || posOrOpts.kind === 'autocannon');
        }
        if (!position || !dir) return;
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;
        const x = position.x, y = position.y, z = position.z;
        const dx = dir.x, dy = dir.y, dz = dir.z;
        const scale = heavy ? 2.8 : 1.0;

        spawnLight(x, y, z, 0xffaa33, heavy ? 24 : 9, heavy ? 18 : 7.5, heavy ? 0.12 : 0.055);

        const gasCount = Math.ceil((heavy ? 10 : 6) * emission);
        for (let i = 0; i < gasCount; i++) {
            const spd = (4 + rnd() * 6) * scale;
            emit(x + dx * 0.08 * i, y + dy * 0.08 * i, z + dz * 0.08 * i,
                dx * spd + (rnd() - 0.5) * 2.2, dy * spd + (rnd() - 0.5) * 1.8, dz * spd + (rnd() - 0.5) * 2.2,
                (0.22 + rnd() * 0.28) * scale, rnd() * 6.28, (rnd() - 0.5) * 14, FRAME_FLAME);
        }

        const starCount = Math.ceil((heavy ? 8 : 5) * emission);
        for (let i = 0; i < starCount; i++) {
            const spd = (10 + rnd() * 18) * scale;
            const rx = (rnd() - 0.5) * 5, ry = (rnd() - 0.5) * 4, rz = (rnd() - 0.5) * 5;
            emit(x, y, z,
                dx * spd + rx, dy * spd + ry, dz * spd + rz,
                0.07 + rnd() * 0.10, rnd() * 6.28, (rnd() - 0.5) * 25, FRAME_SPARK);
        }

        if (heavy) {
            for (let i = 0; i < 6; i++) {
                const ang = rnd() * Math.PI * 2;
                emit(x + Math.cos(ang), 0.1, z + Math.sin(ang),
                    Math.cos(ang) * 4, 0.5 + rnd(), Math.sin(ang) * 4,
                    2.2 + rnd() * 2.0, rnd() * 6.28, (rnd() - 0.5), FRAME_DUST);
            }
        }
    }

    function blood(opts = {}) {
        const p = opts.pos;
        const d = opts.dir || _up;
        if (!p) return;
        const rnd = _rng;
        const amount = opts.amount || 1;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;

        const mistCount = Math.ceil(9 * amount * emission);
        for (let i = 0; i < mistCount; i++) {
            const spd = 1.4 + rnd() * 3.2;
            emit(p.x, p.y, p.z,
                -d.x * spd + (rnd() - 0.5) * 2.2, 0.4 + rnd() * 1.8, -d.z * spd + (rnd() - 0.5) * 2.2,
                0.38 + rnd() * 0.55, rnd() * 6.28, (rnd() - 0.5) * 2, FRAME_BLOOD);
        }

        if (opts.exit !== false) {
            const exitCount = Math.ceil(10 * amount * emission);
            for (let i = 0; i < exitCount; i++) {
                const spd = 3.5 + rnd() * 6.5;
                emit(p.x, p.y, p.z,
                    d.x * spd + (rnd() - 0.5) * 2.5, d.y * spd + rnd() * 1.8, d.z * spd + (rnd() - 0.5) * 2.5,
                    0.18 + rnd() * 0.26, rnd() * 6.28, (rnd() - 0.5) * 8, FRAME_BLOOD);
            }
        }
    }

    function rpgBackblast(posOrOpts, direction) {
        const position = posOrOpts && posOrOpts.pos ? posOrOpts.pos : posOrOpts;
        const dir = posOrOpts && posOrOpts.dir ? posOrOpts.dir : direction;
        if (!position || !dir) return;
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;
        const x = position.x, y = position.y, z = position.z;
        const bx = -dir.x, by = -dir.y, bz = -dir.z;

        const gasCount = Math.ceil(16 * emission);
        for (let i = 0; i < gasCount; i++) {
            const spd = 12 + rnd() * 18;
            const spread = 0.25 + rnd() * 0.35;
            emit(x + bx * 0.3, y + by * 0.3, z + bz * 0.3,
                bx * spd + (rnd() - 0.5) * spd * spread,
                by * spd + (rnd() - 0.5) * spd * spread + 1.0,
                bz * spd + (rnd() - 0.5) * spd * spread,
                0.6 + rnd() * 1.2, rnd() * 6.28, (rnd() - 0.5) * 8, FRAME_SMOKE);
        }

        const dustCount = Math.ceil(10 * emission);
        for (let i = 0; i < dustCount; i++) {
            const spd = 4 + rnd() * 10;
            emit(x + bx * 0.5, y + 0.05, z + bz * 0.5,
                bx * spd + (rnd() - 0.5) * 4, rnd() * 1.5, bz * spd + (rnd() - 0.5) * 4,
                1.5 + rnd() * 2.5, rnd() * 6.28, (rnd() - 0.5) * 2, FRAME_DUST);
        }
    }

    function armorRicochet(posOrOpts, normal) {
        const position = posOrOpts && posOrOpts.pos ? posOrOpts.pos : posOrOpts;
        const norm = (posOrOpts && posOrOpts.normal ? posOrOpts.normal : normal) || _up;
        if (!position) return;
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;
        const sparkCount = Math.ceil(((posOrOpts && posOrOpts.count) || 14) * emission);
        for (let i = 0; i < sparkCount; i++) {
            const spd = 6 + rnd() * 14;
            const rx = norm.x * spd + (rnd() - 0.5) * 8;
            const ry = norm.y * spd + rnd() * 4;
            const rz = norm.z * spd + (rnd() - 0.5) * 8;
            emit(position.x, position.y, position.z,
                rx, ry, rz,
                0.05 + rnd() * 0.09, rnd() * 6.28, (rnd() - 0.5) * 30, FRAME_SPARK);
        }
    }

    function impact(opts = {}) {
        const p = opts.pos;
        if (!p) return;
        const n = opts.normal || _up;
        const surface = opts.surface || 'dirt';
        if (opts.ricochet || surface === 'armor' || surface === 'metal') {
            armorRicochet(p, n);
            return;
        }
        if (surface === 'flesh') {
            blood({ pos: p, dir: n, amount: 1 });
            return;
        }
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;
        const cnt = Math.ceil(8 * emission);
        const frame = surface === 'concrete' ? FRAME_SMOKE : FRAME_DUST;
        for (let i = 0; i < cnt; i++) {
            const spd = 1.5 + rnd() * 4.5;
            emit(
                p.x, p.y, p.z,
                n.x * spd + (rnd() - 0.5) * 2.5,
                Math.max(0.4, n.y * spd + rnd() * 2.0),
                n.z * spd + (rnd() - 0.5) * 2.5,
                0.35 + rnd() * 0.75,
                rnd() * 6.28,
                (rnd() - 0.5) * 3,
                frame
            );
        }
    }

    function emitVehicleFireStep(position, intensity = 1) {
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;
        const x = position.x, y = position.y, z = position.z;

        const flameCount = Math.ceil(3 * intensity * emission);
        for (let i = 0; i < flameCount; i++) {
            emit(x + (rnd() - 0.5) * 1.2, y + 1.5 + rnd() * 0.6, z + (rnd() - 0.5) * 1.2,
                (rnd() - 0.5) * 1.5, 2 + rnd() * 3, (rnd() - 0.5) * 1.5,
                0.8 + rnd() * 1.5, rnd() * 6.28, (rnd() - 0.5) * 2, FRAME_FLAME);
        }

        const smokeCount = Math.ceil(3 * intensity * emission);
        for (let i = 0; i < smokeCount; i++) {
            emit(x + (rnd() - 0.5) * 1.5, y + 2.0 + rnd(), z + (rnd() - 0.5) * 1.5,
                (rnd() - 0.5) * 0.8, 3 + rnd() * 2, (rnd() - 0.5) * 0.8,
                3.0 + rnd() * 5.0, rnd() * 6.28, (rnd() - 0.5) * 0.8, FRAME_SMOKE);
        }
    }

    function vehicleFire(vehOrPos, optsOrIntensity = 1) {
        if (vehOrPos && vehOrPos.chassisPos) {
            const intensity = typeof optsOrIntensity === 'number' ? optsOrIntensity : (optsOrIntensity?.intensity || 1.2);
            burningVehicles.set(vehOrPos, { timer: 0, intensity });
            emitVehicleFireStep(vehOrPos.chassisPos, intensity);
            return;
        }
        if (vehOrPos) {
            const intensity = typeof optsOrIntensity === 'number' ? optsOrIntensity : 1;
            emitVehicleFireStep(vehOrPos, intensity);
        }
    }

    function cookOff(vehicle, seconds = 3.5) {
        if (!vehicle) return;
        cookOffVehicles.set(vehicle, seconds);
        vehicleFire(vehicle, 1.5);
    }

    function smokeScreen(posOrOpts, radius = 9) {
        let p = posOrOpts;
        let r = radius;
        let dur = 18;
        if (posOrOpts && posOrOpts.pos) {
            p = posOrOpts.pos;
            r = posOrOpts.radius || 9;
            dur = posOrOpts.duration || 18;
        }
        if (!p) return;
        smokeClouds.push({
            pos: new THREE.Vector3(p.x, p.y, p.z),
            radius: r,
            duration: dur,
            age: 0,
            emitTimer: 0
        });
        const rnd = _rng;
        const emission = engine.quality?.profile?.particles?.emission ?? 1.0;
        const puffCount = Math.ceil(36 * emission);
        for (let i = 0; i < puffCount; i++) {
            const ang = rnd() * Math.PI * 2;
            const dist = rnd() * r;
            const x = p.x + Math.cos(ang) * dist;
            const z = p.z + Math.sin(ang) * dist;
            emit(x, p.y + rnd() * 2, z,
                (rnd() - 0.5) * 1.5, 0.5 + rnd(), (rnd() - 0.5) * 1.5,
                4 + rnd() * 6, rnd() * 6.28, (rnd() - 0.5) * 0.3, FRAME_SMOKE);
        }
    }

    function smokeDensity(a, b) {
        if (!smokeClouds.length || !a || !b) return 0;
        const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
        const abLenSq = abx * abx + aby * aby + abz * abz;
        if (abLenSq < 1e-6) return 0;
        let total = 0;
        for (let i = 0; i < smokeClouds.length; i++) {
            const sc = smokeClouds[i];
            const fade = sc.age < 1.2 ? (sc.age / 1.2) : (sc.age > sc.duration - 3.0 ? Math.max(0, (sc.duration - sc.age) / 3.0) : 1.0);
            if (fade <= 0.01) continue;
            const apx = sc.pos.x - a.x, apy = (sc.pos.y + 1.5) - a.y, apz = sc.pos.z - a.z;
            const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
            const cx = a.x + abx * t - sc.pos.x;
            const cy = a.y + aby * t - (sc.pos.y + 1.5);
            const cz = a.z + abz * t - sc.pos.z;
            const dist = Math.hypot(cx, cy, cz);
            if (dist < sc.radius) {
                total += (1 - dist / sc.radius) * fade;
            }
        }
        return Math.min(1, total);
    }

    function spentCasing(posOrOpts, rightVec, playerVel) {
        let p = posOrOpts;
        let vx = 0, vy = 0, vz = 0;
        const rnd = _rng;
        if (posOrOpts && posOrOpts.pos) {
            p = posOrOpts.pos;
            const v = posOrOpts.vel || _up;
            vx = v.x; vy = v.y; vz = v.z;
        } else if (p && rightVec) {
            const spd = 3.2 + rnd() * 1.4;
            vx = rightVec.x * spd + (playerVel ? playerVel.x : 0);
            vy = rightVec.y * spd + 1.8 + rnd();
            vz = rightVec.z * spd + (playerVel ? playerVel.z : 0);
        } else {
            return;
        }
        const idx = casingHead;
        casingHead = (casingHead + 1) % MAX_CASINGS;
        const o = idx * 11;
        if (casingData[o + 9] <= 0) casingActive++;
        casingData[o] = p.x;
        casingData[o + 1] = p.y;
        casingData[o + 2] = p.z;
        casingData[o + 3] = vx;
        casingData[o + 4] = vy;
        casingData[o + 5] = vz;
        casingData[o + 6] = rnd() * 6.28;
        casingData[o + 7] = 14 + rnd() * 16;
        casingData[o + 8] = rnd() * 6.28;
        casingData[o + 9] = 2.4;
        casingData[o + 10] = 0;

        emit(p.x, p.y, p.z, vx * 0.25, vy * 0.25 + 0.4, vz * 0.25, 0.14, rnd() * 6.28, (rnd() - 0.5) * 4, FRAME_SMOKE);
    }

    function bulletTracer() {
        for (let i = 0; i < tracerPool.length; i++) {
            const slot = tracerPool[i];
            if (!slot.active) {
                slot.active = true;
                slot.ttl = 0;
                return slot;
            }
        }
        const fallback = tracerPool[0];
        fallback.active = true;
        fallback.ttl = 0;
        return fallback;
    }

    function tracer(startOrOpts, end, color) {
        const start = startOrOpts && startOrOpts.from ? startOrOpts.from : startOrOpts;
        const to = startOrOpts && startOrOpts.to ? startOrOpts.to : end;
        if (!start || !to) return;
        const dx = to.x - start.x, dy = to.y - start.y, dz = to.z - start.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 0.5) return;
        const slot = bulletTracer();
        slot.ttl = 0.065;
        _pos.copy(to);
        _dir.set(dx / len * 400, dy / len * 400, dz / len * 400);
        slot.set(_pos, _dir);
    }

    function trail(opts = {}) {
        const isRocket = opts.kind === 'rocket' || opts.kind === 'atgm';
        return {
            update(p) {
                if (!p) return;
                const rnd = _rng;
                emit(
                    p.x + (rnd() - 0.5) * 0.15,
                    p.y + (rnd() - 0.5) * 0.15,
                    p.z + (rnd() - 0.5) * 0.15,
                    (rnd() - 0.5) * 0.8,
                    0.4 + rnd() * 0.6,
                    (rnd() - 0.5) * 0.8,
                    isRocket ? (0.55 + rnd() * 0.65) : (0.25 + rnd() * 0.25),
                    rnd() * 6.28,
                    (rnd() - 0.5) * 3,
                    FRAME_SMOKE
                );
                if (isRocket) {
                    emit(p.x, p.y, p.z, 0, 0, 0, 0.32 + rnd() * 0.2, rnd() * 6.28, 0, FRAME_FLAME);
                }
            },
            stop() {}
        };
    }

    function dust(opts = {}) {
        const p = opts.pos;
        if (!p) return;
        const r = opts.radius || 1.5;
        const amt = opts.amount || 1;
        const rnd = _rng;
        const cnt = Math.ceil(6 * amt);
        for (let i = 0; i < cnt; i++) {
            const ang = rnd() * Math.PI * 2;
            emit(
                p.x + Math.cos(ang) * r * 0.4,
                p.y + 0.08,
                p.z + Math.sin(ang) * r * 0.4,
                Math.cos(ang) * (1.2 + rnd() * 2.0),
                0.3 + rnd() * 0.6,
                Math.sin(ang) * (1.2 + rnd() * 2.0),
                1.2 + rnd() * 1.8,
                rnd() * 6.28,
                (rnd() - 0.5),
                FRAME_DUST
            );
        }
    }

    function debris(opts = {}) {
        impact({ pos: opts.pos, normal: opts.normal, surface: opts.material || 'dirt' });
    }

    const mod = {
        name: 'vfx',
        explosion,
        muzzleFlash,
        blood,
        backblast: rpgBackblast,
        rpgBackblast,
        sparks: armorRicochet,
        armorRicochet,
        impact,
        vehicleFire,
        cookOff,
        smokeScreen,
        smokeClouds,
        smokeDensity,
        casing: spentCasing,
        spentCasing,
        bulletTracer,
        tracer,
        trail,
        dust,
        debris,
        light,

        install() {
            init();
            engine.events.on('quality:changed', () => {
                budget = engine.quality?.profile?.particles?.budget ?? 9000;
            });
            engine.events.on('explosion', (ev) => {
                if (ev && ev.pos) explosion(ev.pos, { kind: ev.kind, radius: ev.radius });
            });
            engine.events.on('shot', (ev) => {
                if (ev && ev.pos && ev.dir) muzzleFlash(ev.pos, ev.dir, Boolean(ev.weapon?.isExplosive));
            });
            engine.events.on('vehicle:fired', (ev) => {
                if (ev && ev.pos && ev.dir) muzzleFlash(ev.pos, ev.dir, Boolean(ev.heavy));
            });
            engine.events.on('launch', (ev) => {
                if (ev && ev.pos && ev.dir) rpgBackblast(ev.pos, ev.dir);
            });
            engine.events.on('unit:hit', (ev) => {
                if (ev && ev.pos) blood({ pos: ev.pos, dir: ev.dir || _up, exit: true, amount: ev.zone === 'HEAD' ? 1.8 : 1.0 });
            });
            engine.events.on('vehicle:hit', (ev) => {
                if (ev && ev.pos) armorRicochet(ev.pos, ev.normal || _up);
            });
            engine.events.on('vehicle:destroyed', (ev) => {
                if (ev && ev.vehicle) cookOff(ev.vehicle, 4.0);
            });
            engine.events.on('era:detonated', (ev) => {
                if (ev && ev.pos) explosion(ev.pos, { kind: 'era', radius: 3.2 });
            });
            engine.events.on('smoke:deployed', (ev) => {
                if (ev && ev.pos) smokeScreen({ pos: ev.pos, kind: ev.kind, radius: ev.radius || 9, duration: ev.duration || 18 });
            });
        },

        update(dt) {
            step(dt);
        }
    };

    return mod;
}
