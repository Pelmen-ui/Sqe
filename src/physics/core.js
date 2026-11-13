import { GRAVITY, getVehicleTuning, torqueAt } from './vehicle_tuning.js';

export const SNAP = { HEADER: 8, VEH: 44, RAG: 79, BODY: 9, EVENT: 6, WHEELS: 8, PARTS: 11 };
export const CTRL_STRIDE = 16;
export const EVENT_PROP_BROKEN = 1;
export const KIND_DEBRIS = 0;
export const KIND_PROP = 1;

const G_STATIC = 0x0001;
const G_RAGDOLL = 0x0002;
const G_VEHICLE = 0x0004;
const G_DEBRIS = 0x0008;
const G_PROP = 0x0010;
const groups = (member, filter) => ((member << 16) | filter) >>> 0;
const RPM_TO_RAD = Math.PI / 30;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const RAG_PARTS = [
    ['pelvis', 0.14, 0.10, 14.0, 0.7, 1.4],
    ['torso', 0.15, 0.18, 22.0, 0.65, 1.3],
    ['head', 0.11, 0.06, 5.0, 0.5, 1.1],
    ['upperArmL', 0.06, 0.12, 3.2, 0.55, 1.0],
    ['lowerArmL', 0.05, 0.11, 2.1, 0.5, 0.9],
    ['upperArmR', 0.06, 0.12, 3.2, 0.55, 1.0],
    ['lowerArmR', 0.05, 0.11, 2.1, 0.5, 0.9],
    ['upperLegL', 0.08, 0.16, 8.5, 0.65, 1.2],
    ['lowerLegL', 0.065, 0.16, 5.0, 0.6, 1.1],
    ['upperLegR', 0.08, 0.16, 8.5, 0.65, 1.2],
    ['lowerLegR', 0.065, 0.16, 5.0, 0.6, 1.1]
];
export const RAG_PART_NAMES = RAG_PARTS.map((p) => p[0]);

export const RAG_JOINTS = [
    { name: 'spine', pi: 0, ci: 1, type: 'cone', pitchMin: -0.35, pitchMax: 0.50, yawLimit: 0.35, rollLimit: 0.25, twistLimit: 0.35 },
    { name: 'neck', pi: 1, ci: 2, type: 'cone', pitchMin: -0.45, pitchMax: 0.55, yawLimit: 0.85, rollLimit: 0.30, twistLimit: 0.30 },
    { name: 'shoulderL', pi: 1, ci: 3, type: 'cone', pitchMin: -0.5236, pitchMax: 1.7453, yawLimit: 1.4835, rollLimit: 1.4835, twistLimit: 0.5236 },
    { name: 'shoulderR', pi: 1, ci: 5, type: 'cone', pitchMin: -0.5236, pitchMax: 1.7453, yawLimit: 1.4835, rollLimit: 1.4835, twistLimit: 0.5236 },
    { name: 'elbowL', pi: 3, ci: 4, type: 'hinge', lo: 0.0, hi: 2.45, axis: 'x' },
    { name: 'elbowR', pi: 5, ci: 6, type: 'hinge', lo: 0.0, hi: 2.45, axis: 'x' },
    { name: 'hipL', pi: 0, ci: 7, type: 'cone', pitchMin: -0.3491, pitchMax: 1.7453, yawLimit: 0.7854, rollLimit: 0.7854, twistLimit: 0.35 },
    { name: 'hipR', pi: 0, ci: 9, type: 'cone', pitchMin: -0.3491, pitchMax: 1.7453, yawLimit: 0.7854, rollLimit: 0.7854, twistLimit: 0.35 },
    { name: 'kneeL', pi: 7, ci: 8, type: 'hinge', lo: 0.0, hi: 2.35, axis: 'x' },
    { name: 'kneeR', pi: 9, ci: 10, type: 'hinge', lo: 0.0, hi: 2.35, axis: 'x' }
];

const RAG_STRIDE = 10;
const RAG_BLEND = 0.35;
const RAG_SETTLE_VEL = 0.08;
const RAG_SETTLE_TIME = 1.2;
const RAG_MAX_AGE = 7.0;
const RAG_INITIAL_ANG_DAMP = 14.0;

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function quatMul(ax, ay, az, aw, bx, by, bz, bw, out) {
    out.x = aw * bx + ax * bw + ay * bz - az * by;
    out.y = aw * by - ax * bz + ay * bw + az * bx;
    out.z = aw * bz + ax * by - ay * bx + az * bw;
    out.w = aw * bw - ax * bx - ay * by - az * bz;
    const len = Math.hypot(out.x, out.y, out.z, out.w) || 1;
    out.x /= len; out.y /= len; out.z /= len; out.w /= len;
}

function quatToEulerXYZ(qx, qy, qz, qw, out) {
    const sinrCosp = 2 * (qw * qx + qy * qz);
    const cosrCosp = 1 - 2 * (qx * qx + qy * qy);
    out.x = Math.atan2(sinrCosp, cosrCosp);
    const sinp = clamp(2 * (qw * qy - qz * qx), -1, 1);
    out.y = Math.asin(sinp);
    const sinyCosp = 2 * (qw * qz + qx * qy);
    const cosyCosp = 1 - 2 * (qy * qy + qz * qz);
    out.z = Math.atan2(sinyCosp, cosyCosp);
}

function eulerXYZToQuat(rx, ry, rz, out) {
    const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
    const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
    const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
    out.x = sx * cy * cz - cx * sy * sz;
    out.y = cx * sy * cz + sx * cy * sz;
    out.z = cx * cy * sz - sx * sy * cz;
    out.w = cx * cy * cz + sx * sy * sz;
}

export function createPhysicsCore(RAPIER, options = {}) {
    const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    const events = new RAPIER.EventQueue(true);
    const now = typeof performance !== 'undefined' ? () => performance.now() : () => 0;
    const RAY_GROUPS = groups(0xffff, G_STATIC | G_VEHICLE | G_PROP);

    let hz = options.hz || 60;
    let h = 1 / hz;
    let acc = 0;
    let steps = 0;
    let stepMs = 0;
    const maxSub = options.maxSubSteps || 4;
    world.timestep = h;

    const vehicles = [];
    const vehById = new Map();
    const ragdolls = [];
    const ragById = new Map();
    const bodies = [];
    const bodyById = new Map();
    const bodyByCollider = new Map();
    const statics = new Map();
    const pending = [];

    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const _a = { x: 0, y: 0, z: 0 };
    const _b = { x: 0, y: 0, z: 0 };
    const _qRef = { x: 0, y: 0, z: 0, w: 1 };
    const _qDel = { x: 0, y: 0, z: 0, w: 1 };
    const _qNew = { x: 0, y: 0, z: 0, w: 1 };
    const _eul = { x: 0, y: 0, z: 0 };
    const ZERO = { x: 0, y: 0, z: 0 };
    const IDENT = { x: 0, y: 0, z: 0, w: 1 };
    const sN = new Float64Array(8);
    const sC = new Float64Array(24);
    const sV = new Float64Array(24);
    const sSlope = new Float64Array(8);

    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(options.groundHalf || 320, 1, options.groundHalf || 320).setFriction(0.9).setRestitution(0.05).setCollisionGroups(groups(G_STATIC, 0xffff)),
        ground
    );

    function addStatic(cmd) {
        const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(cmd.p[0], cmd.p[1], cmd.p[2]);
        if (cmd.q) desc.setRotation({ x: cmd.q[0], y: cmd.q[1], z: cmd.q[2], w: cmd.q[3] });
        const body = world.createRigidBody(desc);
        world.createCollider(
            RAPIER.ColliderDesc.cuboid(cmd.h[0], cmd.h[1], cmd.h[2])
                .setFriction(cmd.friction ?? 0.85)
                .setRestitution(cmd.restitution ?? 0.1)
                .setCollisionGroups(groups(G_STATIC, 0xffff)),
            body
        );
        statics.set(cmd.id, body);
    }

    function addVehicle(cmd) {
        const tun = getVehicleTuning(cmd.spec);
        const q = cmd.q
            ? { x: cmd.q[0], y: cmd.q[1], z: cmd.q[2], w: cmd.q[3] }
            : { x: 0, y: Math.sin((cmd.yaw || 0) * 0.5), z: 0, w: Math.cos((cmd.yaw || 0) * 0.5) };
        const ux = 2 * (q.x * q.y - q.w * q.z);
        const uy = 1 - 2 * (q.x * q.x + q.z * q.z);
        const uz = 2 * (q.y * q.z + q.w * q.x);
        const desc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(cmd.p[0] + ux * tun.originY, cmd.p[1] + uy * tun.originY, cmd.p[2] + uz * tun.originY)
            .setRotation(q)
            .setLinearDamping(0)
            .setAngularDamping(tun.angularDamping)
            .setCcdEnabled(true);
        if (cmd.lv) desc.setLinvel(cmd.lv[0], cmd.lv[1], cmd.lv[2]);
        if (cmd.av) desc.setAngvel({ x: cmd.av[0], y: cmd.av[1], z: cmd.av[2] });
        const body = world.createRigidBody(desc);
        const shape = RAPIER.ColliderDesc.convexHull(tun.hull)
            || RAPIER.ColliderDesc.cuboid(tun.hullHalf[0], tun.hullHalf[1], tun.hullHalf[2]).setTranslation(0, tun.hullCenterY, tun.hullCenterZ);
        shape.setMassProperties(
            tun.mass,
            { x: 0, y: tun.comLocalY, z: tun.comLocalZ },
            { x: tun.inertia[0], y: tun.inertia[1], z: tun.inertia[2] },
            IDENT
        ).setFriction(0.3).setRestitution(0.1).setCollisionGroups(groups(G_VEHICLE, 0xffff));
        const collider = world.createCollider(shape, body);
        const n = tun.points.length;
        const v = {
            id: cmd.id, tun, body, collider, n,
            comp: new Float32Array(n), dist: new Float32Array(n).fill(tun.rest - tun.sag), grounded: new Uint8Array(n),
            spin: new Float32Array(n),
            throttle: 0, steer: 0, brake: 0, destroyed: 0, engine: 1, trackL: 1, trackR: 1, tires: new Float32Array(8).fill(1),
            gear: 0, shift: 0, dwell: 0, rpm: tun.rpmIdle, slip: 0, torque: 0, steerAngle: 0, fwdSpeed: 0, asleep: false,
            prev: new Float32Array(7), curr: new Float32Array(7)
        };
        for (let i = 0; i < n; i++) v.comp[i] = tun.sag;
        readPose(body, v.curr);
        v.prev.set(v.curr);
        vehicles.push(v);
        vehById.set(v.id, v);
    }

    function stepVehicle(v) {
        const body = v.body;
        const tun = v.tun;
        const active = !v.destroyed && (Math.abs(v.throttle) > 0.01 || Math.abs(v.steer) > 0.01);
        if (body.isSleeping()) {
            if (!active) {
                v.rpm += ((v.destroyed ? 0 : tun.rpmIdle) - v.rpm) * Math.min(1, h * 4);
                v.slip = 0;
                v.torque = 0;
                v.fwdSpeed = 0;
                v.asleep = true;
                return;
            }
            body.wakeUp();
        }
        v.asleep = false;

        const t = body.translation();
        const q = body.rotation();
        const lv = body.linvel();
        const av = body.angvel();
        const rx = 1 - 2 * (q.y * q.y + q.z * q.z), ry = 2 * (q.x * q.y + q.w * q.z), rz = 2 * (q.x * q.z - q.w * q.y);
        const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
        const bx = 2 * (q.x * q.z + q.w * q.y), by = 2 * (q.y * q.z - q.w * q.x), bz = 1 - 2 * (q.x * q.x + q.y * q.y);
        const fx = -bx, fy = -by, fz = -bz;
        const comX = t.x + ux * tun.comLocalY + bx * tun.comLocalZ;
        const comY = t.y + uy * tun.comLocalY + by * tun.comLocalZ;
        const comZ = t.z + uz * tun.comLocalY + bz * tun.comLocalZ;
        const vF = lv.x * fx + lv.y * fy + lv.z * fz;
        const speed = Math.abs(vF);
        v.fwdSpeed = vF;

        let sumN = 0, sumNL = 0, sumNR = 0, sumND = 0, groundedCount = 0;
        ray.dir.x = -ux; ray.dir.y = -uy; ray.dir.z = -uz;
        for (let i = 0; i < v.n; i++) {
            const pt = tun.points[i];
            const flat = tun.tracked ? 0 : 1 - v.tires[i];
            const rest = tun.rest - flat * tun.tireDrop;
            const ox = t.x + rx * pt.x + ux * pt.y + bx * pt.z;
            const oy = t.y + ry * pt.x + uy * pt.y + by * pt.z;
            const oz = t.z + rz * pt.x + uz * pt.y + bz * pt.z;
            ray.origin.x = ox; ray.origin.y = oy; ray.origin.z = oz;
            const hit = world.castRay(ray, rest + tun.droop, true, undefined, RAY_GROUPS, undefined, body);
            sN[i] = 0;
            sSlope[i] = 0;
            if (!hit) {
                v.grounded[i] = 0;
                v.comp[i] = -tun.droop;
                continue;
            }
            let dist = hit.timeOfImpact;
            if (v.grounded[i] && dist < v.dist[i] - tun.climbRate * h) dist = v.dist[i] - tun.climbRate * h;
            const cx = ox - ux * dist, cy = oy - uy * dist, cz = oz - uz * dist;
            const lx = cx - comX, ly = cy - comY, lz = cz - comZ;
            const pvx = lv.x + av.y * lz - av.z * ly;
            const pvy = lv.y + av.z * lx - av.x * lz;
            const pvz = lv.z + av.x * ly - av.y * lx;
            const vUp = pvx * ux + pvy * uy + pvz * uz;
            const comp = rest - dist;
            let N = comp * tun.k - vUp * tun.c;
            if (comp > tun.sag + tun.travel) N += (comp - tun.sag - tun.travel) * tun.k * 4;
            N = clamp(N, 0, tun.nMax);
            if (v.grounded[i]) {
                const run = (pvx * fx + pvy * fy + pvz * fz) * h;
                if (Math.abs(run) > 1e-3) sSlope[i] = clamp(((v.dist[i] - dist) + vUp * h) / run, -0.45, 0.45);
            }
            v.dist[i] = dist;
            v.grounded[i] = 1;
            v.comp[i] = tun.rest - dist;
            sN[i] = N;
            sC[i * 3] = cx; sC[i * 3 + 1] = cy; sC[i * 3 + 2] = cz;
            sV[i * 3] = pvx; sV[i * 3 + 1] = pvy; sV[i * 3 + 2] = pvz;
            if (N > 0) {
                groundedCount++;
                sumN += N;
                if (pt.side === 0) sumNL += N; else sumNR += N;
                if (pt.driven) sumND += N * (tun.tracked ? 1 : v.tires[i]);
                const prop = bodyByCollider.get(hit.collider.handle);
                if (prop) {
                    if (prop.breakForce > 0 && N > prop.breakForce) breakProp(prop, N);
                    const push = Math.min(N, prop.mass * GRAVITY * 4) * h;
                    _a.x = -ux * push; _a.y = -uy * push; _a.z = -uz * push;
                    _b.x = cx; _b.y = cy; _b.z = cz;
                    prop.body.applyImpulseAtPoint(_a, _b, true);
                }
            }
        }

        const want = v.destroyed ? 0 : (v.throttle > 0.02 ? 1 : v.throttle < -0.02 ? -1 : 0);
        let braking = v.brake > 0.5;
        if (v.shift > 0) v.shift -= h;
        if (v.dwell > 0) v.dwell -= h;
        if (want > 0 && v.gear <= 0) {
            if (vF > -1.0) { v.gear = 1; v.shift = 0.12; } else braking = true;
        } else if (want < 0 && v.gear >= 0) {
            if (vF < 1.0) { v.gear = -1; v.shift = 0.12; } else braking = true;
        }
        if (v.gear > 0 && v.shift <= 0) {
            if (want > 0 && v.dwell <= 0 && v.gear < tun.gearTop.length && speed > tun.upFrac * tun.gearTop[v.gear - 1]) {
                v.gear++;
                v.shift = tun.shiftTime;
            } else if (v.gear > 1 && speed < tun.downFrac * tun.gearTop[v.gear - 2]) {
                v.gear--;
                v.shift = want > 0 ? tun.shiftTime : 0;
                v.dwell = 1.5;
            }
        }
        if (want === 0 && speed < 0.3) v.gear = 0;

        const thr = Math.abs(v.throttle);
        let drive = 0;
        let rpmTarget = v.destroyed ? 0 : tun.rpmIdle;
        v.torque = 0;
        if (!v.destroyed && v.gear !== 0) {
            const k = v.gear > 0 ? tun.gearK[v.gear - 1] : tun.reverseK;
            const rpmRaw = speed * k;
            rpmTarget = Math.max(rpmRaw, tun.rpmIdle);
            if (want !== 0 && (want > 0) === (v.gear > 0) && !braking && v.shift <= 0) {
                const rpm = Math.max(rpmRaw, tun.rpmIdle * (1 + 0.7 * thr));
                const tq = torqueAt(rpm / tun.rpmMax);
                drive = thr * tq * tun.torquePeak * k * RPM_TO_RAD * tun.eff * v.engine * (v.gear > 0 ? 1 : -1);
                v.torque = thr * tq;
                rpmTarget = rpm;
            }
        }

        let steerDF = 0;
        if (tun.tracked) {
            if (!v.destroyed && Math.abs(v.steer) > 0.02 && sumN > 0 && v.engine > 0.05) {
                const wMax = Math.min(tun.pivotRate, tun.latAccMax / Math.max(speed, 0.1));
                const wy = av.x * ux + av.y * uy + av.z * uz;
                const moment = clamp((v.steer * wMax - wy) * tun.inertia[1] * tun.steerGain, -tun.steerMoment, tun.steerMoment);
                steerDF = moment * Math.min(1, v.engine * 2) / (2 * tun.track);
                rpmTarget = Math.max(rpmTarget, tun.rpmIdle + Math.abs(v.steer) * (tun.rpmMax - tun.rpmIdle) * 0.45);
            }
        } else {
            const limit = Math.min(tun.steerMax, tun.wheelbase * tun.latAccMax / Math.max(speed * speed, 1));
            const target = v.destroyed ? 0 : v.steer * limit;
            v.steerAngle += clamp(target - v.steerAngle, -tun.steerRate * h, tun.steerRate * h);
        }
        const forceL = (drive * 0.5 - steerDF) * v.trackL;
        const forceR = (drive * 0.5 + steerDF) * v.trackR;
        const hold = !active && !braking && !v.destroyed && speed < 0.6;

        let Fx = 0, Fy = 0, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
        let asked = 0, got = 0;
        for (let i = 0; i < v.n; i++) {
            const N = sN[i];
            if (!(N > 0)) continue;
            const pt = tun.points[i];
            const mi = tun.mass * (N / sumN);
            let wfx = fx, wfy = fy, wfz = fz, wrx = rx, wry = ry, wrz = rz;
            if (pt.steer > 0 && v.steerAngle !== 0) {
                const a = v.steerAngle * pt.steer;
                const ca = Math.cos(a), sa = Math.sin(a);
                wfx = fx * ca - rx * sa; wfy = fy * ca - ry * sa; wfz = fz * ca - rz * sa;
                wrx = rx * ca + fx * sa; wry = ry * ca + fy * sa; wrz = rz * ca + fz * sa;
            }
            const pvx = sV[i * 3], pvy = sV[i * 3 + 1], pvz = sV[i * 3 + 2];
            const vLong = pvx * wfx + pvy * wfy + pvz * wfz;
            const vLat = pvx * wrx + pvy * wry + pvz * wrz;
            const dir = vLong > 0 ? 1 : -1;
            const stop = Math.abs(vLong) * mi / h;

            let driveI = 0;
            let dead = 0;
            let flat = 0;
            if (tun.tracked) {
                const sideN = pt.side === 0 ? sumNL : sumNR;
                driveI = (pt.side === 0 ? forceL : forceR) * (N / sideN);
                dead = 1 - (pt.side === 0 ? v.trackL : v.trackR);
            } else {
                flat = 1 - v.tires[i];
                if (pt.driven && sumND > 0) driveI = drive * (N * v.tires[i] / sumND);
            }

            let fLong;
            if (v.destroyed) fLong = -vLong * mi * 3.5;
            else if (braking) fLong = -dir * Math.min(tun.brakeDecel * mi, stop * 0.7);
            else if (hold) fLong = -dir * Math.min(tun.brakeDecel * mi * 0.5, stop * 0.7);
            else {
                const roll = (tun.rollRes + flat * tun.flatRoll) * N + (want === 0 ? Math.abs(vLong) * mi * tun.engineBrake : 0);
                fLong = driveI - dir * Math.min(roll, stop * 0.5);
            }
            if (dead > 0) fLong = fLong * (1 - dead) - dead * dir * Math.min(0.8 * tun.muLong * N, stop * 0.7);
            if (sSlope[i] !== 0) fLong -= clamp(N * sSlope[i], -0.6 * stop, 0.6 * stop);

            const latMax = tun.muLat * N * (1 - 0.5 * flat);
            let fLat = clamp(-vLat * mi * tun.latGain, -latMax, latMax);
            const fMax = tun.muLong * N;
            const mag = Math.hypot(fLong, fLat);
            let scale = 1;
            if (mag > fMax) {
                scale = fMax / mag;
                fLong *= scale;
                fLat *= scale;
            }
            if (driveI !== 0) {
                asked += Math.abs(driveI);
                got += Math.abs(driveI) * scale;
            }

            let wheelV = vLong;
            if (driveI !== 0 && scale < 1) wheelV += (driveI > 0 ? 1 : -1) * (1 - scale) * 8;
            else if ((braking || hold) && scale < 1) wheelV *= scale;
            if (dead > 0.5) wheelV = 0;
            v.spin[i] += wheelV / tun.wheelR * h;
            if (v.spin[i] > 6283.185 || v.spin[i] < -6283.185) v.spin[i] %= 6283.185;

            const px = ux * N + wfx * fLong + wrx * fLat;
            const py = uy * N + wfy * fLong + wry * fLat;
            const pz = uz * N + wfz * fLong + wrz * fLat;
            const lx = sC[i * 3] - comX, ly = sC[i * 3 + 1] - comY, lz = sC[i * 3 + 2] - comZ;
            Fx += px; Fy += py; Fz += pz;
            Tx += ly * pz - lz * py;
            Ty += lz * px - lx * pz;
            Tz += lx * py - ly * px;
        }

        const drag = -0.6 * tun.dragArea * speed * vF;
        Fx += fx * drag; Fy += fy * drag; Fz += fz * drag;
        if (uy < 0.3 && groundedCount < 2 && speed < 3) {
            const lever = tun.mass * GRAVITY * 1.2;
            Tx += -uz * lever;
            Tz += ux * lever;
        }
        body.resetForces(false);
        body.resetTorques(false);
        _a.x = Fx; _a.y = Fy; _a.z = Fz;
        body.addForce(_a, false);
        _b.x = Tx; _b.y = Ty; _b.z = Tz;
        body.addTorque(_b, false);

        const slip = asked > 1 ? 1 - got / asked : 0;
        v.slip += (slip - v.slip) * Math.min(1, h * 10);
        if (!v.destroyed) rpmTarget += v.slip * (tun.rpmMax - rpmTarget) * 0.5;
        v.rpm += (rpmTarget - v.rpm) * Math.min(1, h * 7);
    }

    function makeShape(shape) {
        let desc = null;
        if (shape.type === 'box') desc = RAPIER.ColliderDesc.cuboid(shape.half[0], shape.half[1], shape.half[2]);
        else if (shape.type === 'capsule') desc = RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.r);
        else if (shape.type === 'cylinder') desc = RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.r);
        else if (shape.type === 'cone') desc = RAPIER.ColliderDesc.cone(shape.halfHeight, shape.r);
        else if (shape.type === 'hull' && shape.points) desc = RAPIER.ColliderDesc.convexHull(new Float32Array(shape.points));
        if (!desc) desc = RAPIER.ColliderDesc.ball(shape.r || 0.1);
        if (shape.offset) desc.setTranslation(shape.offset[0], shape.offset[1], shape.offset[2]);
        return desc;
    }

    function addBody(cmd) {
        const desc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(cmd.p[0], cmd.p[1], cmd.p[2])
            .setRotation({ x: cmd.q[0], y: cmd.q[1], z: cmd.q[2], w: cmd.q[3] })
            .setLinearDamping(cmd.linDamp ?? 0.3)
            .setAngularDamping(cmd.angDamp ?? 0.3);
        if (cmd.lv) desc.setLinvel(cmd.lv[0], cmd.lv[1], cmd.lv[2]);
        if (cmd.av) desc.setAngvel({ x: cmd.av[0], y: cmd.av[1], z: cmd.av[2] });
        if (cmd.ccd) desc.setCcdEnabled(true);
        const body = world.createRigidBody(desc);
        const isProp = cmd.kind === KIND_PROP;
        const shape = makeShape(cmd.shape || { type: 'ball', r: 0.1 })
            .setMass(cmd.mass || 1)
            .setFriction(cmd.friction ?? 0.6)
            .setRestitution(cmd.restitution ?? 0.3)
            .setCollisionGroups(isProp
                ? groups(G_PROP, 0xffff)
                : groups(G_DEBRIS, G_STATIC | G_VEHICLE | G_DEBRIS | G_PROP));
        const entry = {
            id: cmd.id, kind: cmd.kind || KIND_DEBRIS, body, mass: cmd.mass || 1,
            breakForce: cmd.breakForce || 0, breakImpulse: cmd.breakImpulse || 0, broken: false,
            lv: cmd.lv ? [cmd.lv[0], cmd.lv[1], cmd.lv[2]] : [0, 0, 0],
            prev: new Float32Array(7), curr: new Float32Array(7)
        };
        if (entry.breakForce > 0) {
            shape.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(entry.breakForce);
        }
        const collider = world.createCollider(shape, body);
        entry.handle = collider.handle;
        if (isProp) bodyByCollider.set(collider.handle, entry);
        if (cmd.imp) body.applyImpulse({ x: cmd.imp[0], y: cmd.imp[1], z: cmd.imp[2] }, true);
        if (cmd.timp) body.applyTorqueImpulse({ x: cmd.timp[0], y: cmd.timp[1], z: cmd.timp[2] }, true);
        readPose(body, entry.curr);
        entry.prev.set(entry.curr);
        bodies.push(entry);
        bodyById.set(entry.id, entry);
    }

    function removeBody(id) {
        const entry = bodyById.get(id);
        if (!entry) return;
        bodyById.delete(id);
        bodyByCollider.delete(entry.handle);
        bodies.splice(bodies.indexOf(entry), 1);
        world.removeRigidBody(entry.body);
    }

    function breakProp(entry, magnitude) {
        if (entry.broken) return;
        entry.broken = true;
        const t = entry.body.translation();
        pending.push(EVENT_PROP_BROKEN, entry.id, t.x, t.y, t.z, magnitude);
    }

    function addRagdoll(cmd) {
        const parts = cmd.parts;
        const rnd = mulberry32((cmd.seed || 1) * 2654435761);
        const list = [];
        for (let i = 0; i < RAG_PARTS.length; i++) {
            const [, r, halfHeight, mass, linDamp] = RAG_PARTS[i];
            const o = i * RAG_STRIDE;
            const q = { x: parts[o + 3], y: parts[o + 4], z: parts[o + 5], w: parts[o + 6] };
            const desc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(parts[o], parts[o + 1], parts[o + 2])
                .setRotation(q)
                .setLinvel(cmd.lv[0], cmd.lv[1], cmd.lv[2])
                .setLinearDamping(linDamp)
                .setAngularDamping(RAG_INITIAL_ANG_DAMP)
                .setCcdEnabled(i < 3);
            const body = world.createRigidBody(desc);
            const ex = parts[o + 7], ey = parts[o + 8], ez = parts[o + 9];
            const len = Math.hypot(ex, ey, ez);
            let shape;
            if (len > 0.05) {
                shape = RAPIER.ColliderDesc.capsule(Math.max(0.02, len * 0.5 - r * 0.5), r)
                    .setTranslation(ex * 0.5, ey * 0.5, ez * 0.5)
                    .setRotation(quatFromY(ex / len, ey / len, ez / len));
            } else {
                shape = RAPIER.ColliderDesc.capsule(halfHeight, r);
            }
            shape.setMass(mass).setFriction(0.85).setRestitution(0.05)
                .setCollisionGroups(groups(G_RAGDOLL, G_STATIC | G_VEHICLE | G_PROP));
            world.createCollider(shape, body);
            list.push(body);
        }

        const restRel = new Float32Array(RAG_JOINTS.length * 4);
        for (let ji = 0; ji < RAG_JOINTS.length; ji++) {
            const jd = RAG_JOINTS[ji];
            const pi = jd.pi;
            const ci = jd.ci;
            const po = pi * RAG_STRIDE;
            const co = ci * RAG_STRIDE;
            const dx = parts[co] - parts[po], dy = parts[co + 1] - parts[po + 1], dz = parts[co + 2] - parts[po + 2];
            const anchor1 = rotateInverse(parts[po + 3], parts[po + 4], parts[po + 5], parts[po + 6], dx, dy, dz);
            const anchor2 = ZERO;

            quatMul(-parts[po + 3], -parts[po + 4], -parts[po + 5], parts[po + 6], parts[co + 3], parts[co + 4], parts[co + 5], parts[co + 6], _qRef);
            const ro = ji * 4;
            restRel[ro] = _qRef.x; restRel[ro + 1] = _qRef.y; restRel[ro + 2] = _qRef.z; restRel[ro + 3] = _qRef.w;

            let joint;
            if (jd.type === 'hinge') {
                const axisVec = jd.axis === 'x' ? { x: 1, y: 0, z: 0 } : (jd.axis === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 });
                joint = RAPIER.JointData.revolute(anchor1, anchor2, axisVec);
                joint.limitsEnabled = true;
                joint.limits = [jd.lo, jd.hi];
            } else {
                joint = RAPIER.JointData.spherical(anchor1, anchor2);
            }
            const handle = world.createImpulseJoint(joint, list[pi], list[ci], true);
            if (handle && typeof handle.setContactsEnabled === 'function') {
                handle.setContactsEnabled(false);
            }
        }

        const imp = cmd.imp;
        if (imp) {
            const hitIdx = cmd.hit >= 0 && cmd.hit < list.length ? cmd.hit : 1;
            const target = list[hitIdx];
            const mag = Math.hypot(imp[0], imp[1], imp[2]);
            if (mag > 110) {
                for (let bi = 0; bi < list.length; bi++) {
                    const w = bi === 0 ? 0.24 : bi === 1 ? 0.30 : 0.06;
                    list[bi].applyImpulse({ x: imp[0] * w, y: Math.max(4.0, imp[1] * w), z: imp[2] * w }, true);
                }
            } else if (hitIdx === 2) {
                const headVec = { x: imp[0] * 0.32, y: clamp(imp[1] * 0.15, -2.0, 2.5), z: imp[2] * 0.32 };
                if (cmd.hp) target.applyImpulseAtPoint(headVec, { x: cmd.hp[0], y: cmd.hp[1], z: cmd.hp[2] }, true);
                else target.applyImpulse(headVec, true);
                list[1].applyImpulse({ x: imp[0] * 0.55, y: -3.5, z: imp[2] * 0.55 }, true);
                list[0].applyImpulse({ x: imp[0] * 0.25, y: -5.0, z: imp[2] * 0.25 }, true);
            } else {
                const bodyVec = { x: imp[0] * 0.65, y: clamp(imp[1] * 0.22, -3.0, 4.0), z: imp[2] * 0.65 };
                if (cmd.hp) target.applyImpulseAtPoint(bodyVec, { x: cmd.hp[0], y: cmd.hp[1], z: cmd.hp[2] }, true);
                else target.applyImpulse(bodyVec, true);
                list[1].applyImpulse({ x: imp[0] * 0.38, y: -2.5, z: imp[2] * 0.38 }, true);
                list[0].applyImpulse({ x: imp[0] * 0.22, y: -4.5, z: imp[2] * 0.22 }, true);
            }
            list[0].applyTorqueImpulse({ x: (rnd() - 0.5) * 4.5, y: (rnd() - 0.5) * 3.5, z: (rnd() - 0.5) * 4.5 }, true);
        }

        const rag = {
            id: cmd.id, bodies: list, restRel, age: 0, slowTime: 0, settled: false, asleep: false, blending: true,
            prev: new Float32Array(RAG_PARTS.length * 7), curr: new Float32Array(RAG_PARTS.length * 7)
        };
        readRagdoll(rag);
        rag.prev.set(rag.curr);
        ragdolls.push(rag);
        ragById.set(rag.id, rag);
    }

    function removeRagdoll(id) {
        const rag = ragById.get(id);
        if (!rag) return;
        ragById.delete(id);
        ragdolls.splice(ragdolls.indexOf(rag), 1);
        for (const body of rag.bodies) world.removeRigidBody(body);
    }

    function enforceRagdollJointLimits(rag) {
        if (rag.settled || rag.asleep) return;
        const bodiesList = rag.bodies;
        const restRel = rag.restRel;
        for (let ji = 0; ji < RAG_JOINTS.length; ji++) {
            const jd = RAG_JOINTS[ji];
            const pBody = bodiesList[jd.pi];
            const cBody = bodiesList[jd.ci];
            const qp = pBody.rotation();
            const qc = cBody.rotation();
            const ro = ji * 4;
            quatMul(qp.x, qp.y, qp.z, qp.w, restRel[ro], restRel[ro + 1], restRel[ro + 2], restRel[ro + 3], _qRef);
            quatMul(-_qRef.x, -_qRef.y, -_qRef.z, _qRef.w, qc.x, qc.y, qc.z, qc.w, _qDel);
            if (_qDel.w < 0) {
                _qDel.x = -_qDel.x; _qDel.y = -_qDel.y; _qDel.z = -_qDel.z; _qDel.w = -_qDel.w;
            }
            quatToEulerXYZ(_qDel.x, _qDel.y, _qDel.z, _qDel.w, _eul);
            let rx = _eul.x, ry = _eul.y, rz = _eul.z;
            let clamped = false;
            if (jd.type === 'hinge') {
                const nx = clamp(rx, jd.lo, jd.hi);
                if (Math.abs(nx - rx) > 1e-4 || Math.abs(ry) > 0.08 || Math.abs(rz) > 0.08) {
                    rx = nx;
                    ry = clamp(ry, -0.05, 0.05);
                    rz = clamp(rz, -0.05, 0.05);
                    clamped = true;
                }
            } else {
                const nx = clamp(rx, jd.pitchMin, jd.pitchMax);
                const ny = clamp(ry, -jd.yawLimit, jd.yawLimit);
                const rLim = jd.rollLimit ?? jd.twistLimit ?? 0.35;
                const nz = clamp(rz, -rLim, rLim);
                if (nx !== rx || ny !== ry || nz !== rz) {
                    rx = nx; ry = ny; rz = nz;
                    clamped = true;
                }
            }
            if (clamped) {
                eulerXYZToQuat(rx, ry, rz, _qDel);
                quatMul(_qRef.x, _qRef.y, _qRef.z, _qRef.w, _qDel.x, _qDel.y, _qDel.z, _qDel.w, _qNew);
                cBody.setRotation(_qNew, false);
                const avP = pBody.angvel();
                const avC = cBody.angvel();
                cBody.setAngvel({
                    x: avP.x + (avC.x - avP.x) * 0.25,
                    y: avP.y + (avC.y - avP.y) * 0.25,
                    z: avP.z + (avC.z - avP.z) * 0.25
                }, false);
            }
        }
    }

    function freezeRagdollBodies(rag) {
        rag.settled = true;
        for (const body of rag.bodies) {
            body.setLinvel(ZERO, false);
            body.setAngvel(ZERO, false);
            body.sleep();
        }
    }

    function stepRagdoll(rag) {
        rag.age += h;
        if (rag.blending) {
            const f = Math.max(0, 1 - rag.age / RAG_BLEND);
            const baseDamp = RAG_INITIAL_ANG_DAMP * f;
            for (let i = 0; i < rag.bodies.length; i++) {
                rag.bodies[i].setAngularDamping(RAG_PARTS[i][5] + baseDamp);
            }
            if (f === 0) rag.blending = false;
        }
        enforceRagdollJointLimits(rag);
        if (!rag.settled) {
            if (rag.age >= RAG_MAX_AGE) {
                freezeRagdollBodies(rag);
                return;
            }
            let allSlow = true;
            for (const body of rag.bodies) {
                if (body.isSleeping()) continue;
                const lv = body.linvel();
                const speed = Math.hypot(lv.x, lv.y, lv.z);
                if (speed > RAG_SETTLE_VEL) {
                    allSlow = false;
                    break;
                }
            }
            if (allSlow && rag.age > RAG_BLEND) {
                rag.slowTime += h;
                if (rag.slowTime >= RAG_SETTLE_TIME) {
                    freezeRagdollBodies(rag);
                }
            } else {
                rag.slowTime = 0;
            }
        }
    }

    function readRagdoll(rag) {
        let asleep = true;
        for (let i = 0; i < rag.bodies.length; i++) {
            const body = rag.bodies[i];
            if (body.isSleeping()) continue;
            asleep = false;
            const t = body.translation();
            const r = body.rotation();
            const o = i * 7;
            rag.curr[o] = t.x; rag.curr[o + 1] = t.y; rag.curr[o + 2] = t.z;
            rag.curr[o + 3] = r.x; rag.curr[o + 4] = r.y; rag.curr[o + 5] = r.z; rag.curr[o + 6] = r.w;
        }
        rag.asleep = asleep;
    }

    function readPose(body, out) {
        const t = body.translation();
        const r = body.rotation();
        out[0] = t.x; out[1] = t.y; out[2] = t.z;
        out[3] = r.x; out[4] = r.y; out[5] = r.z; out[6] = r.w;
    }

    function quatFromY(x, y, z) {
        if (y < -0.9999) return { x: 1, y: 0, z: 0, w: 0 };
        const w = 1 + y;
        const len = Math.hypot(z, 0, -x, w);
        return { x: z / len, y: 0, z: -x / len, w: w / len };
    }

    function rotateInverse(qx, qy, qz, qw, x, y, z) {
        const cx = -qx, cy = -qy, cz = -qz;
        const tx = 2 * (cy * z - cz * y), ty = 2 * (cz * x - cx * z), tz = 2 * (cx * y - cy * x);
        return {
            x: x + qw * tx + cy * tz - cz * ty,
            y: y + qw * ty + cz * tx - cx * tz,
            z: z + qw * tz + cx * ty - cy * tx
        };
    }

    function blast(cmd) {
        const [ex, ey, ez] = cmd.p;
        const radius = cmd.r;
        const force = cmd.f;
        const push = (body, reach, gain, lift, cap, atCentre) => {
            const p = body.translation();
            const dx = p.x - ex, dy = p.y - ey, dz = p.z - ez;
            const dist = Math.hypot(dx, dy, dz);
            if (dist >= reach || dist < 0.01) return;
            let mag = force * Math.pow(1 - dist / reach, 1.45) * gain;
            if (cap > 0) mag = Math.min(mag, cap);
            body.wakeUp();
            const vec = { x: (dx / dist) * mag, y: ((dy / dist) + lift) * mag, z: (dz / dist) * mag };
            if (atCentre) body.applyImpulseAtPoint(vec, { x: ex, y: ey, z: ez }, true);
            else body.applyImpulse(vec, true);
        };
        for (const rag of ragdolls) {
            for (const body of rag.bodies) push(body, radius, 0.48, 0.72, 0, false);
            rag.settled = false;
            rag.slowTime = 0;
            rag.age = Math.min(rag.age, 4);
        }
        for (const v of vehicles) push(v.body, radius * 1.4, 380, 0.65, 0, true);
        for (const b of bodies) push(b.body, radius * 1.2, 40, 0.5, b.mass * 12, false);
    }

    function exec(cmd) {
        switch (cmd.t) {
            case 'cfg':
                if (cmd.hz) {
                    hz = clamp(cmd.hz, 30, 120);
                    h = 1 / hz;
                    world.timestep = h;
                }
                break;
            case 'static': addStatic(cmd); break;
            case 'staticRemove': {
                const body = statics.get(cmd.id);
                if (body) {
                    statics.delete(cmd.id);
                    world.removeRigidBody(body);
                }
                break;
            }
            case 'veh': addVehicle(cmd); break;
            case 'vehRemove': {
                const v = vehById.get(cmd.id);
                if (v) {
                    vehById.delete(cmd.id);
                    vehicles.splice(vehicles.indexOf(v), 1);
                    world.removeRigidBody(v.body);
                }
                break;
            }
            case 'vehImpulse': {
                const v = vehById.get(cmd.id);
                if (!v) break;
                v.body.wakeUp();
                const vec = { x: cmd.i[0], y: cmd.i[1], z: cmd.i[2] };
                if (cmd.p) v.body.applyImpulseAtPoint(vec, { x: cmd.p[0], y: cmd.p[1], z: cmd.p[2] }, true);
                else v.body.applyImpulse(vec, true);
                break;
            }
            case 'vehRecoil': {
                const v = vehById.get(cmd.id);
                if (!v) break;
                const t = v.body.translation();
                const q = v.body.rotation();
                const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
                const lift = v.tun.hullCenterY + v.tun.hullHalf[1] * 0.8;
                v.body.wakeUp();
                v.body.applyImpulseAtPoint(
                    { x: -cmd.d[0] * cmd.m, y: -cmd.d[1] * cmd.m, z: -cmd.d[2] * cmd.m },
                    { x: t.x + ux * lift, y: t.y + uy * lift, z: t.z + uz * lift },
                    true
                );
                break;
            }
            case 'body': addBody(cmd); break;
            case 'bodyRemove': removeBody(cmd.id); break;
            case 'bodyImpulse': {
                const b = bodyById.get(cmd.id);
                if (!b) break;
                const vec = { x: cmd.i[0], y: cmd.i[1], z: cmd.i[2] };
                if (cmd.p) b.body.applyImpulseAtPoint(vec, { x: cmd.p[0], y: cmd.p[1], z: cmd.p[2] }, true);
                else b.body.applyImpulse(vec, true);
                break;
            }
            case 'rag': addRagdoll(cmd); break;
            case 'ragRemove': removeRagdoll(cmd.id); break;
            case 'blast': blast(cmd); break;
            default: break;
        }
    }

    function applyControls(ctrl, count) {
        for (let i = 0; i < count; i++) {
            const o = i * CTRL_STRIDE;
            const v = vehById.get(ctrl[o]);
            if (!v) continue;
            v.throttle = clamp(ctrl[o + 1], -1, 1);
            v.steer = clamp(ctrl[o + 2], -1, 1);
            v.brake = ctrl[o + 3];
            v.destroyed = ctrl[o + 4] > 0.5 ? 1 : 0;
            v.engine = clamp(ctrl[o + 5], 0, 1);
            v.trackL = clamp(ctrl[o + 6], 0, 1);
            v.trackR = clamp(ctrl[o + 7], 0, 1);
            for (let k = 0; k < 8; k++) v.tires[k] = clamp(ctrl[o + 8 + k], 0, 1);
        }
    }

    function stepFixed() {
        for (const v of vehicles) {
            v.prev.set(v.curr);
            stepVehicle(v);
        }
        for (const b of bodies) b.prev.set(b.curr);
        for (const rag of ragdolls) {
            rag.prev.set(rag.curr);
            stepRagdoll(rag);
        }
        world.step(events);
        events.drainContactForceEvents((ev) => {
            const first = bodyByCollider.get(ev.collider1());
            const second = bodyByCollider.get(ev.collider2());
            const magnitude = ev.maxForceMagnitude();
            if (first && first.breakForce > 0 && magnitude > first.breakForce) breakProp(first, magnitude);
            if (second && second.breakForce > 0 && magnitude > second.breakForce) breakProp(second, magnitude);
        });
        for (const v of vehicles) {
            if (!v.asleep) readPose(v.body, v.curr);
        }
        for (const b of bodies) {
            if (b.body.isSleeping()) continue;
            readPose(b.body, b.curr);
            if (b.breakImpulse > 0 && !b.broken) {
                const lv = b.body.linvel();
                const jolt = Math.hypot(lv.x - b.lv[0], lv.y - b.lv[1] + GRAVITY * h, lv.z - b.lv[2]) * b.mass;
                b.lv[0] = lv.x; b.lv[1] = lv.y; b.lv[2] = lv.z;
                if (jolt > b.breakImpulse) breakProp(b, jolt);
            }
        }
        for (const rag of ragdolls) {
            enforceRagdollJointLimits(rag);
            readRagdoll(rag);
        }
        steps++;
    }

    function writePose(out, o, prev, curr, po, alpha) {
        const beta = 1 - alpha;
        out[o] = prev[po] * beta + curr[po] * alpha;
        out[o + 1] = prev[po + 1] * beta + curr[po + 1] * alpha;
        out[o + 2] = prev[po + 2] * beta + curr[po + 2] * alpha;
        const dot = prev[po + 3] * curr[po + 3] + prev[po + 4] * curr[po + 4] + prev[po + 5] * curr[po + 5] + prev[po + 6] * curr[po + 6];
        const s = dot < 0 ? -alpha : alpha;
        const x = prev[po + 3] * beta + curr[po + 3] * s;
        const y = prev[po + 4] * beta + curr[po + 4] * s;
        const z = prev[po + 5] * beta + curr[po + 5] * s;
        const w = prev[po + 6] * beta + curr[po + 6] * s;
        const len = Math.hypot(x, y, z, w) || 1;
        out[o + 3] = x / len; out[o + 4] = y / len; out[o + 5] = z / len; out[o + 6] = w / len;
    }

    function writeSnapshot(out, alpha) {
        const cap = out.length;
        let o = SNAP.HEADER;
        let nVeh = 0, nRag = 0, nBody = 0, nEv = 0;
        for (const v of vehicles) {
            if (o + SNAP.VEH > cap) break;
            out[o] = v.id;
            writePose(out, o + 1, v.prev, v.curr, 0, alpha);
            const qx = out[o + 4], qy = out[o + 5], qz = out[o + 6], qw = out[o + 7];
            const drop = v.tun.originY;
            out[o + 1] -= 2 * (qx * qy - qw * qz) * drop;
            out[o + 2] -= (1 - 2 * (qx * qx + qz * qz)) * drop;
            out[o + 3] -= 2 * (qy * qz + qw * qx) * drop;
            if (v.asleep) {
                out.fill(0, o + 8, o + 14);
            } else {
                const lv = v.body.linvel();
                const av = v.body.angvel();
                out[o + 8] = lv.x; out[o + 9] = lv.y; out[o + 10] = lv.z;
                out[o + 11] = av.x; out[o + 12] = av.y; out[o + 13] = av.z;
            }
            out[o + 14] = v.gear;
            out[o + 15] = v.rpm;
            out[o + 16] = v.slip;
            out[o + 17] = v.fwdSpeed;
            out[o + 18] = v.torque;
            out[o + 19] = (v.shift > 0 ? 1 : 0) | (v.asleep ? 2 : 0);
            for (let i = 0; i < SNAP.WHEELS; i++) {
                const w = o + 20 + i * 3;
                if (i < v.n) {
                    out[w] = v.comp[i];
                    out[w + 1] = v.grounded[i];
                    out[w + 2] = v.spin[i];
                } else {
                    out[w] = 0; out[w + 1] = 0; out[w + 2] = 0;
                }
            }
            o += SNAP.VEH;
            nVeh++;
        }
        for (const rag of ragdolls) {
            if (o + SNAP.RAG > cap) break;
            out[o] = rag.id;
            out[o + 1] = (rag.settled ? 1 : 0) | (rag.asleep ? 2 : 0);
            for (let i = 0; i < SNAP.PARTS; i++) writePose(out, o + 2 + i * 7, rag.prev, rag.curr, i * 7, alpha);
            o += SNAP.RAG;
            nRag++;
        }
        for (const b of bodies) {
            if (o + SNAP.BODY > cap) break;
            out[o] = b.id;
            writePose(out, o + 1, b.prev, b.curr, 0, alpha);
            out[o + 8] = b.body.isSleeping() ? 1 : 0;
            o += SNAP.BODY;
            nBody++;
        }
        for (let i = 0; i + SNAP.EVENT <= pending.length && o + SNAP.EVENT <= cap; i += SNAP.EVENT) {
            for (let k = 0; k < SNAP.EVENT; k++) out[o + k] = pending[i + k];
            o += SNAP.EVENT;
            nEv++;
        }
        pending.length = 0;
        out[0] = steps;
        out[1] = alpha;
        out[2] = nVeh;
        out[3] = nRag;
        out[4] = nBody;
        out[5] = nEv;
        out[6] = stepMs;
        out[7] = hz;
        return o;
    }

    function frame(cmds, ctrl, ctrlCount, dt, out) {
        const t0 = now();
        if (cmds) for (let i = 0; i < cmds.length; i++) exec(cmds[i]);
        if (ctrl && ctrlCount) applyControls(ctrl, ctrlCount);
        acc += Math.min(dt, 0.1);
        let n = 0;
        while (acc >= h && n < maxSub) {
            stepFixed();
            acc -= h;
            n++;
        }
        if (acc >= h) acc = 0;
        stepMs = now() - t0;
        return out ? writeSnapshot(out, acc / h) : 0;
    }

    return {
        frame,
        exec,
        get steps() { return steps; },
        get hz() { return hz; },
        counts: () => ({ vehicles: vehicles.length, ragdolls: ragdolls.length, bodies: bodies.length, statics: statics.size }),
        dispose() {
            events.free();
            world.free();
        }
    };
}
