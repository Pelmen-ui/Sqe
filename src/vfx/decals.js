import * as THREE from 'three';

const ATLAS_SIZE = 512;
const ATLAS_GRID = 4;
const CELL_SIZE = ATLAS_SIZE / ATLAS_GRID;

const DECAL_CONCRETE = 0;
const DECAL_METAL = 1;
const DECAL_WOOD = 2;
const DECAL_CRATER = 3;
const DECAL_HEAT = 4;
const DECAL_BLOOD_SPLAT = 5;
const DECAL_BLOOD_POOL = 6;
const DECAL_TREAD = 7;

function buildDecalAtlas() {
    const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(ATLAS_SIZE, ATLAS_SIZE)
        : Object.assign(document.createElement('canvas'), { width: ATLAS_SIZE, height: ATLAS_SIZE });
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

    function cell(c, r, fn) {
        ctx.save();
        ctx.translate(c * CELL_SIZE, r * CELL_SIZE);
        fn(ctx, CELL_SIZE);
        ctx.restore();
    }

    cell(0, 0, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        c.fillStyle = 'rgba(25, 23, 22, 0.95)';
        c.beginPath();
        c.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(180, 175, 168, 0.7)';
        c.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.2;
            c.beginPath();
            c.moveTo(cx + Math.cos(a) * s * 0.15, cy + Math.sin(a) * s * 0.15);
            c.lineTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42);
            c.stroke();
        }
    });

    cell(1, 0, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        c.fillStyle = 'rgba(10, 10, 12, 0.98)';
        c.beginPath();
        c.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(210, 220, 230, 0.85)';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
        c.stroke();
    });

    cell(2, 0, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        c.fillStyle = 'rgba(45, 28, 14, 0.95)';
        c.beginPath();
        c.ellipse(cx, cy, s * 0.12, s * 0.24, 0.4, 0, Math.PI * 2);
        c.fill();
    });

    cell(3, 0, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        const grad = c.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.48);
        grad.addColorStop(0, 'rgba(12, 10, 8, 0.95)');
        grad.addColorStop(0.45, 'rgba(35, 28, 22, 0.8)');
        grad.addColorStop(0.8, 'rgba(65, 52, 40, 0.35)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
        c.fill();
    });

    cell(0, 1, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        c.fillStyle = 'rgba(10, 8, 8, 1.0)';
        c.beginPath();
        c.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
        c.fill();
        const glow = c.createRadialGradient(cx, cy, s * 0.12, cx, cy, s * 0.36);
        glow.addColorStop(0, 'rgba(255, 120, 20, 0.95)');
        glow.addColorStop(0.5, 'rgba(220, 50, 0, 0.7)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c.fillStyle = glow;
        c.beginPath();
        c.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
        c.fill();
    });

    cell(1, 1, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        c.fillStyle = 'rgba(110, 12, 12, 0.9)';
        c.beginPath();
        c.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
        c.fill();
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
            const dist = s * 0.25 + Math.random() * s * 0.18;
            c.beginPath();
            c.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, s * (0.04 + Math.random() * 0.04), 0, Math.PI * 2);
            c.fill();
        }
    });

    cell(2, 1, (c, s) => {
        const cx = s * 0.5, cy = s * 0.5;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, s * 0.46);
        grad.addColorStop(0, 'rgba(85, 8, 8, 0.95)');
        grad.addColorStop(0.7, 'rgba(120, 14, 14, 0.88)');
        grad.addColorStop(0.95, 'rgba(140, 18, 18, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.arc(cx, cy, s * 0.46, 0, Math.PI * 2);
        c.fill();
    });

    cell(3, 1, (c, s) => {
        c.fillStyle = 'rgba(38, 30, 24, 0.82)';
        const bars = 8;
        const bh = s / (bars * 2);
        for (let i = 0; i < bars; i++) {
            c.fillRect(s * 0.15, i * bh * 2 + bh * 0.5, s * 0.7, bh);
        }
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

const DECAL_VERTEX = `
attribute float aFrame;
attribute float aHeat;
attribute float aOpacity;
varying vec2 vUv;
varying float vFrame;
varying float vHeat;
varying float vOpacity;

void main() {
    vUv = uv;
    vFrame = aFrame;
    vHeat = aHeat;
    vOpacity = aOpacity;
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const DECAL_FRAGMENT = `
uniform sampler2D uAtlas;
uniform float uGrid;
varying vec2 vUv;
varying float vFrame;
varying float vHeat;
varying float vOpacity;

void main() {
    float frame = floor(vFrame);
    float row = floor(frame / uGrid);
    float col = frame - row * uGrid;
    vec2 uv = (vec2(col, row) + vUv) / uGrid;
    vec4 tex = texture2D(uAtlas, uv);
    if (tex.a < 0.02) discard;

    vec3 colOut = tex.rgb;
    if (vHeat > 0.001) {
        vec3 heatCol = vec3(1.0, 0.45, 0.08) * vHeat * 2.5;
        colOut += heatCol;
    }
    gl_FragColor = vec4(colOut, tex.a * vOpacity);
}
`;

const _up = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _rotZ = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _n = new THREE.Vector3();
const _right = new THREE.Vector3();
const _leftPos = new THREE.Vector3();
const _rightPos = new THREE.Vector3();
const _groundPos = new THREE.Vector3();
const _negDir = new THREE.Vector3();

const MAX_BUDGET = 800;
const MAX_HEAT_SLOTS = 64;
const MAX_POOL_SLOTS = 64;
const MAX_MOVING_SLOTS = 128;

export function createDecals(engine) {
    let budget = 320;
    let atlas = null;
    let geometry = null;
    let material = null;
    let instancedMesh = null;

    let frames = null;
    let heats = null;
    let opacities = null;

    let head = 0;
    let count = 0;

    const heatDecals = new Array(MAX_HEAT_SLOTS);
    for (let i = 0; i < MAX_HEAT_SLOTS; i++) {
        heatDecals[i] = { active: false, idx: 0, remaining: 0, total: 6.0 };
    }
    let heatPtr = 0;

    const expandingPools = new Array(MAX_POOL_SLOTS);
    for (let i = 0; i < MAX_POOL_SLOTS; i++) {
        expandingPools[i] = {
            active: false,
            idx: 0,
            currentSize: 0.15,
            maxSize: 1.2,
            growTime: 8.0,
            elapsed: 0,
            pos: new THREE.Vector3(),
            quat: new THREE.Quaternion()
        };
    }
    let poolPtr = 0;

    const movingDecals = new Array(MAX_MOVING_SLOTS);
    for (let i = 0; i < MAX_MOVING_SLOTS; i++) {
        movingDecals[i] = {
            active: false,
            idx: 0,
            object: null,
            localPos: new THREE.Vector3(),
            localQuat: new THREE.Quaternion(),
            scale: new THREE.Vector3()
        };
    }
    let movingPtr = 0;

    const trackLastPos = new Map();

    function init() {
        budget = Math.min(MAX_BUDGET, engine.quality?.profile?.decals?.budget ?? 320);
        atlas = buildDecalAtlas();

        const plane = new THREE.PlaneGeometry(1, 1);
        geometry = new THREE.InstancedBufferGeometry();
        geometry.index = plane.index;
        geometry.setAttribute('position', plane.getAttribute('position'));
        geometry.setAttribute('uv', plane.getAttribute('uv'));

        frames = new Float32Array(MAX_BUDGET);
        heats = new Float32Array(MAX_BUDGET);
        opacities = new Float32Array(MAX_BUDGET).fill(1.0);

        geometry.setAttribute('aFrame', new THREE.InstancedBufferAttribute(frames, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aHeat', new THREE.InstancedBufferAttribute(heats, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(opacities, 1).setUsage(THREE.DynamicDrawUsage));

        material = new THREE.ShaderMaterial({
            vertexShader: DECAL_VERTEX,
            fragmentShader: DECAL_FRAGMENT,
            uniforms: {
                uAtlas: { value: atlas },
                uGrid: { value: ATLAS_GRID }
            },
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1.0,
            polygonOffsetUnits: -2.0
        });

        instancedMesh = new THREE.InstancedMesh(geometry, material, MAX_BUDGET);
        instancedMesh.count = 0;
        instancedMesh.frustumCulled = false;
        instancedMesh.name = 'surface_decals';
        engine.scene.add(instancedMesh);
    }

    function addDecal({ kind = 'bullet', surface = 'concrete', pos, normal, size = 0.25, object = null }) {
        if (!instancedMesh || !pos) return -1;
        const idx = head;
        head = (head + 1) % budget;
        if (count < budget) count++;

        let frameId = DECAL_CONCRETE;
        let isHeat = false;
        let isPool = false;

        if (kind === 'crater') {
            frameId = DECAL_CRATER;
        } else if (kind === 'heat') {
            frameId = DECAL_HEAT;
            isHeat = true;
        } else if (kind === 'blood_splat') {
            frameId = DECAL_BLOOD_SPLAT;
        } else if (kind === 'blood_pool') {
            frameId = DECAL_BLOOD_POOL;
            isPool = true;
        } else if (kind === 'tread') {
            frameId = DECAL_TREAD;
        } else {
            if (surface === 'metal' || surface === 'armor') frameId = DECAL_METAL;
            else if (surface === 'wood') frameId = DECAL_WOOD;
            else frameId = DECAL_CONCRETE;
        }

        frames[idx] = frameId;
        heats[idx] = isHeat ? 1.0 : 0.0;
        opacities[idx] = 1.0;

        _pos.copy(pos);
        if (normal) {
            _n.copy(normal).normalize();
            _pos.addScaledVector(_n, 0.005);
            _quat.setFromUnitVectors(_up, _n);
        } else {
            _quat.set(0, 0, 0, 1);
        }

        _rotZ.setFromAxisAngle(_axisZ, Math.random() * Math.PI * 2);
        _quat.multiply(_rotZ);
        _scale.set(size, size, size);
        _mat.compose(_pos, _quat, _scale);
        instancedMesh.setMatrixAt(idx, _mat);

        if (isHeat) {
            const hd = heatDecals[heatPtr];
            heatPtr = (heatPtr + 1) % MAX_HEAT_SLOTS;
            hd.active = true;
            hd.idx = idx;
            hd.remaining = 6.0;
            hd.total = 6.0;
        }
        if (isPool) {
            const ep = expandingPools[poolPtr];
            poolPtr = (poolPtr + 1) % MAX_POOL_SLOTS;
            ep.active = true;
            ep.idx = idx;
            ep.currentSize = size * 0.15;
            ep.maxSize = size;
            ep.growTime = 8.0;
            ep.elapsed = 0;
            ep.pos.copy(_pos);
            ep.quat.copy(_quat);
        }
        if (object && object !== engine.scene) {
            const md = movingDecals[movingPtr];
            movingPtr = (movingPtr + 1) % MAX_MOVING_SLOTS;
            md.active = true;
            md.idx = idx;
            md.object = object;
            md.localPos.copy(_pos);
            object.worldToLocal(md.localPos);
            md.localQuat.copy(object.quaternion).invert().multiply(_quat);
            md.scale.copy(_scale);
        }

        instancedMesh.count = count;
        instancedMesh.instanceMatrix.needsUpdate = true;
        geometry.attributes.aFrame.needsUpdate = true;
        geometry.attributes.aHeat.needsUpdate = true;
        geometry.attributes.aOpacity.needsUpdate = true;
        return idx;
    }

    function updateDecals(dt) {
        if (!instancedMesh) return;
        let dirtyMatrix = false;
        let dirtyHeat = false;

        for (let i = 0; i < MAX_HEAT_SLOTS; i++) {
            const hd = heatDecals[i];
            if (!hd.active) continue;
            hd.remaining -= dt;
            if (hd.remaining <= 0) {
                heats[hd.idx] = 0;
                hd.active = false;
            } else {
                heats[hd.idx] = Math.pow(hd.remaining / hd.total, 1.8);
            }
            dirtyHeat = true;
        }

        for (let i = 0; i < MAX_POOL_SLOTS; i++) {
            const ep = expandingPools[i];
            if (!ep.active) continue;
            ep.elapsed += dt;
            const progress = Math.min(1.0, ep.elapsed / ep.growTime);
            const curSize = THREE.MathUtils.lerp(ep.currentSize, ep.maxSize, Math.sqrt(progress));
            _scale.set(curSize, curSize, curSize);
            _mat.compose(ep.pos, ep.quat, _scale);
            instancedMesh.setMatrixAt(ep.idx, _mat);
            dirtyMatrix = true;
            if (progress >= 1.0) {
                ep.active = false;
            }
        }

        for (let i = 0; i < MAX_MOVING_SLOTS; i++) {
            const md = movingDecals[i];
            if (!md.active) continue;
            if (!md.object || !md.object.parent) {
                md.active = false;
                continue;
            }
            md.object.updateWorldMatrix(true, false);
            _pos.copy(md.localPos).applyMatrix4(md.object.matrixWorld);
            _quat.copy(md.object.quaternion).multiply(md.localQuat);
            _mat.compose(_pos, _quat, md.scale);
            instancedMesh.setMatrixAt(md.idx, _mat);
            dirtyMatrix = true;
        }

        if (engine.ragdollPhysics?.vehicles) {
            const vehicles = engine.ragdollPhysics.vehicles;
            for (let i = 0; i < vehicles.length; i++) {
                const veh = vehicles[i];
                if (veh.destroyed || Math.abs(veh.forwardSpeed) < 0.5) continue;
                let last = trackLastPos.get(veh.id);
                if (!last) {
                    last = new THREE.Vector3().copy(veh.chassisPos);
                    trackLastPos.set(veh.id, last);
                    continue;
                }
                if (veh.chassisPos.distanceToSquared(last) > 0.64) {
                    last.copy(veh.chassisPos);
                    _right.set(1, 0, 0).applyQuaternion(veh.chassisQuat);
                    const halfTrack = (veh.spec.halfExtents[0] || 1.5) * 0.85;

                    _leftPos.copy(veh.chassisPos).addScaledVector(_right, -halfTrack);
                    _leftPos.y = 0.01;
                    _rightPos.copy(veh.chassisPos).addScaledVector(_right, halfTrack);
                    _rightPos.y = 0.01;

                    addDecal({ kind: 'tread', pos: _leftPos, normal: _up, size: 0.9 });
                    addDecal({ kind: 'tread', pos: _rightPos, normal: _up, size: 0.9 });
                }
            }
        }

        if (dirtyMatrix) instancedMesh.instanceMatrix.needsUpdate = true;
        if (dirtyHeat) geometry.attributes.aHeat.needsUpdate = true;
    }

    const mod = {
        name: 'decals',
        add: addDecal,
        get count() {
            return count;
        },
        get mesh() {
            return instancedMesh;
        },

        install() {
            init();

            engine.events.on('impact', (ev) => {
                if (!ev || !ev.pos) return;
                const surface = ev.surface || (ev.material ? ev.material : 'concrete');
                const size = ev.energy ? Math.min(0.65, 0.15 + (ev.energy / 4000) * 0.25) : 0.2;
                addDecal({ kind: 'bullet', surface, pos: ev.pos, normal: ev.normal, size, object: ev.object });
            });

            engine.events.on('explosion', (ev) => {
                if (!ev || !ev.pos) return;
                const radius = ev.radius || 6.0;
                const size = Math.min(8.0, radius * 0.7);
                const norm = ev.normal || _up;
                addDecal({ kind: 'crater', pos: ev.pos, normal: norm, size });
            });

            engine.events.on('unit:hit', (ev) => {
                if (!ev || !ev.pos) return;
                if (ev.dir) {
                    _negDir.copy(ev.dir).negate();
                } else {
                    _negDir.copy(_up);
                }
                addDecal({ kind: 'blood_splat', pos: ev.pos, normal: _negDir, size: 0.35 + Math.random() * 0.3 });
            });

            engine.events.on('unit:killed', (ev) => {
                if (!ev || !ev.unit?.root) return;
                _groundPos.copy(ev.unit.root.position);
                _groundPos.y = 0.01;
                addDecal({ kind: 'blood_pool', pos: _groundPos, normal: _up, size: 1.2 + Math.random() * 0.6 });
            });

            engine.events.on('vehicle:hit', (ev) => {
                if (!ev || !ev.pos) return;
                if (ev.ammo?.isHeat || ev.ammo?.shapedCharge || ev.isHeat || ev.ammo?.type === 'HEAT') {
                    addDecal({ kind: 'heat', pos: ev.pos, normal: ev.normal, size: 0.28, object: ev.vehicle?.mesh });
                } else {
                    addDecal({ kind: 'bullet', surface: 'metal', pos: ev.pos, normal: ev.normal, size: 0.22, object: ev.vehicle?.mesh });
                }
            });

            engine.events.on('quality:changed', () => {
                budget = Math.min(MAX_BUDGET, engine.quality?.profile?.decals?.budget ?? 320);
                if (head >= budget) head = 0;
                if (count > budget) {
                    count = budget;
                    if (instancedMesh) instancedMesh.count = count;
                }
            });
        },

        update(dt) {
            updateDecals(dt);
        }
    };

    return mod;
}
