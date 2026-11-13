import * as THREE from 'three';
import { STATS } from '../../stats.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _S = new THREE.Vector3();
const _E = new THREE.Vector3();
const _W = new THREE.Vector3();
const _T = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _Ek = new THREE.Vector3();
const _gripWorld = new THREE.Vector3();
const _guardWorld = new THREE.Vector3();
const _wristTgt = new THREE.Vector3();
const _poleR = new THREE.Vector3();
const _poleL = new THREE.Vector3();
const _knuckleDirR = new THREE.Vector3();
const _knuckleDirL = new THREE.Vector3();
const _palmWorldR = new THREE.Vector3();
const _palmWorldL = new THREE.Vector3();
const _vSide = new THREE.Vector3();
const _negPalm = new THREE.Vector3();
const _basisM4 = new THREE.Matrix4();
const _basisQuat = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _scale = new THREE.Vector3();

const DEG = Math.PI / 180;
const DEADZONE_RAD = 2.2 * DEG;
const DEADZONE_ADS_RAD = 0.55 * DEG;
const DEADZONE_RETURN = 5.5;
const IK_EPSILON = 1e-6;

const SIGHT_FOV_MULT = {
    ak12: 0.86,
    m4a1: 0.86,
    ak74m: 0.88,
    rpg7: 0.72
};

const WEAPON_SOCKETS = {
    ak12: {
        grip: [0.0, 0.055, 0.075],
        gripDir: [0.0, -0.92, -0.38],
        palmR: [-1.0, 0.0, 0.0],
        handguard: [0.0, 0.110, 0.015],
        guardDir: [0.0, 0.35, -0.94],
        palmL: [0.35, 0.90, 0.25]
    },
    m4a1: {
        grip: [0.0, 0.055, 0.075],
        gripDir: [0.0, -0.92, -0.38],
        palmR: [-1.0, 0.0, 0.0],
        handguard: [0.0, 0.110, 0.015],
        guardDir: [0.0, 0.35, -0.94],
        palmL: [0.35, 0.90, 0.25]
    },
    ak74m: {
        grip: [0.0, 0.055, 0.075],
        gripDir: [0.0, -0.92, -0.38],
        palmR: [-1.0, 0.0, 0.0],
        handguard: [0.0, 0.110, 0.015],
        guardDir: [0.0, 0.35, -0.94],
        palmL: [0.35, 0.90, 0.25]
    },
    rpg7: {
        grip: [0.111, 0.045, -0.075],
        gripDir: [0.0, -0.96, -0.28],
        palmR: [-1.0, 0.0, 0.0],
        handguard: [0.111, 0.045, 0.115],
        guardDir: [0.0, -0.96, -0.28],
        palmL: [1.0, 0.0, 0.0]
    }
};

function worldPos(bone, out) {
    bone.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(bone.matrixWorld);
}

function worldQuat(bone, out) {
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(_v1, out, _scale);
    return out;
}

function setWorldQuat(bone, qw) {
    const parent = bone.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    parent.matrixWorld.decompose(_v1, _qp, _scale);
    bone.quaternion.copy(_qp.invert()).multiply(qw);
    bone.updateMatrixWorld(true);
}

function aimBone(bone, child, target) {
    worldPos(bone, _v1);
    worldPos(child, _v2);
    _v3.subVectors(_v2, _v1).normalize();
    _d.subVectors(target, _v1);
    if (_d.lengthSq() < 1e-10) return;
    _d.normalize();
    _qs.setFromUnitVectors(_v3, _d);
    worldQuat(bone, _qw);
    _qw.premultiply(_qs);
    setWorldQuat(bone, _qw);
}

export function solveTwoBoneIK(upper, lower, hand, targetPos, poleVec) {
    if (!upper || !lower || !hand) return 0;
    worldPos(upper, _S);
    worldPos(lower, _E);
    worldPos(hand, _W);
    const l1 = _S.distanceTo(_E);
    const l2 = _E.distanceTo(_W);
    if (l1 < IK_EPSILON || l2 < IK_EPSILON) return 0;
    _d.subVectors(targetPos, _S);
    const dist = _d.length();
    if (dist < IK_EPSILON) return 0;
    const dc = Math.min((l1 + l2) * 0.998, Math.max(Math.abs(l1 - l2) + 0.008, dist));
    _d.multiplyScalar(1 / dist);
    _T.copy(_S).addScaledVector(_d, dc);
    const along = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    _pv.copy(poleVec);
    _pv.addScaledVector(_d, -_pv.dot(_d));
    if (_pv.lengthSq() < IK_EPSILON) _pv.set(0, -1, 0).addScaledVector(_d, _d.y);
    _pv.normalize();
    _Ek.copy(_S).addScaledVector(_d, along).addScaledVector(_pv, h);
    aimBone(upper, lower, _Ek);
    aimBone(lower, hand, _T);
    return Math.max(0, dist - dc);
}

function orientHandBasis(hand, knuckleDir, palmNormal, isLeft) {
    if (!hand) return;
    if (isLeft) {
        _negPalm.copy(palmNormal).negate();
        _vSide.crossVectors(_negPalm, knuckleDir).normalize();
        _basisM4.makeBasis(_negPalm, knuckleDir, _vSide);
    } else {
        _vSide.crossVectors(palmNormal, knuckleDir).normalize();
        _basisM4.makeBasis(palmNormal, knuckleDir, _vSide);
    }
    _basisQuat.setFromRotationMatrix(_basisM4);
    setWorldQuat(hand, _basisQuat);
}

function curlFingers(hand, curlAmount, isLeft, isRpg) {
    if (!hand || typeof hand.traverse !== 'function') return;
    const sign = isLeft ? 1 : -1;
    hand.traverse((b) => {
        if (!b.isBone || b === hand) return;
        const n = b.name || '';
        b.rotation.x = 0;
        b.rotation.y = 0;
        if (n.includes('Middle') || n.includes('Ring') || n.includes('Pinky')) {
            b.rotation.z = sign * curlAmount;
        } else if (n.includes('Index1')) {
            b.rotation.z = sign * curlAmount * (isRpg ? 0.85 : 0.40);
        } else if (n.includes('Index2') || n.includes('Index3')) {
            b.rotation.z = sign * curlAmount * (isRpg ? 0.90 : 0.60);
        } else if (n.includes('Thumb1')) {
            b.rotation.set(0.12, isLeft ? -0.18 : 0.18, isLeft ? -0.38 : 0.38);
        } else if (n.includes('Thumb2')) {
            b.rotation.z = isLeft ? -0.28 : 0.28;
        }
    });
}

export function createArms(engine) {
    let armGroup = null;
    let armModel = null;
    let shoulderL = null;
    let elbowL = null;
    let wristL = null;
    let shoulderR = null;
    let elbowR = null;
    let wristR = null;
    let restUpperR = new THREE.Quaternion();
    let restLowerR = new THREE.Quaternion();
    let restHandR = new THREE.Quaternion();
    let restUpperL = new THREE.Quaternion();
    let restLowerL = new THREE.Quaternion();
    let restHandL = new THREE.Quaternion();
    let builtFaction = null;
    let armsReady = false;

    let deadzoneYaw = 0;
    let deadzonePitch = 0;
    let aimBlend = 0;

    let reloadPhase = 0;
    let reloadTimer = 0;
    let reloadTotal = 0;
    let boltClicked = false;
    let switchPhase = 0;
    let switchTimer = 0;
    let magCheckTimer = 0;
    let recoilElbowKick = 0;
    let recoilWristPitch = 0;

    const leftHandAnimOffset = new THREE.Vector3();
    const weaponAnimPos = new THREE.Vector3();
    const weaponAnimRot = new THREE.Euler();
    let propWarheadMesh = null;

    function cullNonArmGeometry(root) {
        if (!root || typeof root.traverse !== 'function') return;
        root.traverse((o) => {
            if (!o.isMesh && !o.isSkinnedMesh) return;
            o.frustumCulled = false;
            o.castShadow = false;
            o.receiveShadow = false;
            o.renderOrder = 80;
            const n = o.name || '';
            const isArm = (n.includes('11006') || n.includes('12007') || n.includes('Gloves') || n.includes('glove')) &&
                          !n.includes('LOD');
            o.visible = Boolean(isArm);
        });
    }

    function buildArmsFromModel(modelKey) {
        let inst = null;
        if (engine.assets && typeof engine.assets.instantiateSkinned === 'function') {
            inst = engine.assets.instantiateSkinned(modelKey, 1.95);
        } else if (typeof engine.instantiateSkinnedModel === 'function') {
            inst = engine.instantiateSkinnedModel(modelKey, 1.95);
        }
        const root = inst && inst.model ? inst.model : inst;
        if (!root || typeof root.traverse !== 'function') return null;
        cullNonArmGeometry(root);
        return root;
    }

    function ensurePropWarhead() {
        if (propWarheadMesh) return;
        const wState = engine.weaponStates['rpg7'];
        if (!wState || !wState.meshGroup) return;
        const g = new THREE.Group();
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.042, 0.22, 10),
            new THREE.MeshStandardMaterial({ color: 0x4b5738, roughness: 0.65, metalness: 0.3 })
        );
        cone.rotation.x = -Math.PI * 0.5;
        const tail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8),
            new THREE.MeshStandardMaterial({ color: 0x3b442c, roughness: 0.7, metalness: 0.25 })
        );
        tail.rotation.x = Math.PI * 0.5;
        tail.position.z = 0.20;
        g.add(cone);
        g.add(tail);
        g.visible = false;
        wState.meshGroup.add(g);
        propWarheadMesh = g;
    }

    function initArms() {
        const faction = engine.playerFaction || 'RU';
        if (armsReady && builtFaction === faction) return;

        if (armGroup && armGroup.parent) {
            armGroup.parent.remove(armGroup);
        }

        const modelKey = faction === 'RU' ? 'soldier_ru' : 'soldier_ua';
        armModel = buildArmsFromModel(modelKey);
        if (!armModel) return;

        armGroup = new THREE.Group();
        armGroup.name = 'fp_arms_rig';
        armModel.rotation.y = Math.PI;
        armModel.position.set(0, 0, 0);
        armGroup.add(armModel);

        shoulderR = null; elbowR = null; wristR = null;
        shoulderL = null; elbowL = null; wristL = null;
        const isFinger = (n) => n.includes('Index') || n.includes('Thumb') || n.includes('Middle') || n.includes('Ring') || n.includes('Pinky');

        armModel.traverse((o) => {
            if (!o.isBone) return;
            const n = o.name || '';
            if (n.includes('RightArm') && !n.includes('Fore') && !shoulderR) shoulderR = o;
            else if (n.includes('RightForeArm') && !elbowR) elbowR = o;
            else if (n.includes('RightHand') && !isFinger(n) && !wristR) wristR = o;
            else if (n.includes('LeftArm') && !n.includes('Fore') && !shoulderL) shoulderL = o;
            else if (n.includes('LeftForeArm') && !elbowL) elbowL = o;
            else if (n.includes('LeftHand') && !isFinger(n) && !wristL) wristL = o;
        });

        armGroup.updateMatrixWorld(true);
        if (shoulderR && shoulderL) {
            shoulderR.getWorldPosition(_v1);
            shoulderL.getWorldPosition(_v2);
            armGroup.worldToLocal(_v1);
            armGroup.worldToLocal(_v2);
            _v3.addVectors(_v1, _v2).multiplyScalar(0.5);
            armModel.position.sub(_v3);
            armGroup.updateMatrixWorld(true);
        }

        engine.camera.add(armGroup);
        armGroup.position.set(0, -0.26, 0.08);

        if (shoulderR && elbowR && wristR) {
            restUpperR.copy(shoulderR.quaternion);
            restLowerR.copy(elbowR.quaternion);
            restHandR.copy(wristR.quaternion);
        }
        if (shoulderL && elbowL && wristL) {
            restUpperL.copy(shoulderL.quaternion);
            restLowerL.copy(elbowL.quaternion);
            restHandL.copy(wristL.quaternion);
        }

        ensurePropWarhead();

        builtFaction = faction;
        armsReady = Boolean(shoulderR && elbowR && wristR);
    }

    function updateDeadzone(dt) {
        if (!engine.isStarted) return;
        const limit = engine.isAiming ? DEADZONE_ADS_RAD : DEADZONE_RAD;
        deadzoneYaw = Math.max(-limit, Math.min(limit, deadzoneYaw));
        deadzonePitch = Math.max(-limit, Math.min(limit, deadzonePitch));
        const decay = Math.exp(-DEADZONE_RETURN * dt);
        deadzoneYaw *= decay;
        deadzonePitch *= decay;
        recoilElbowKick *= Math.exp(-14.0 * dt);
        recoilWristPitch *= Math.exp(-16.0 * dt);
    }

    function consumeLookDelta(yawDelta, pitchDelta) {
        const limit = engine.isAiming ? DEADZONE_ADS_RAD : DEADZONE_RAD;
        const nextYaw = deadzoneYaw + yawDelta * 0.48;
        const nextPitch = deadzonePitch + pitchDelta * 0.48;
        deadzoneYaw = Math.max(-limit, Math.min(limit, nextYaw));
        deadzonePitch = Math.max(-limit, Math.min(limit, nextPitch));
        const bodyShare = engine.isAiming ? 0.94 : 0.78;
        const overflowYaw = nextYaw - deadzoneYaw;
        const overflowPitch = nextPitch - deadzonePitch;
        return {
            bodyYaw: yawDelta * bodyShare + overflowYaw,
            bodyPitch: pitchDelta * bodyShare + overflowPitch
        };
    }

    function updateReload(dt) {
        const key = engine.loadoutKeys[engine.currentWeaponIdx];
        const wState = engine.weaponStates[key];
        leftHandAnimOffset.set(0, 0, 0);
        weaponAnimPos.set(0, 0, 0);
        weaponAnimRot.set(0, 0, 0);
        if (propWarheadMesh) propWarheadMesh.visible = false;

        if (magCheckTimer > 0) {
            magCheckTimer = Math.max(0, magCheckTimer - dt);
            const s = Math.sin((1 - magCheckTimer / 0.85) * Math.PI);
            weaponAnimRot.z += s * 0.34;
            weaponAnimRot.x += s * 0.12;
            weaponAnimPos.y += s * 0.025;
            leftHandAnimOffset.set(0.02 * s, -0.09 * s, 0.11 * s);
        }

        if (!wState || !wState.reloading) {
            reloadPhase = 0;
            reloadTimer = 0;
            boltClicked = false;
            return;
        }

        if (reloadPhase === 0) {
            reloadPhase = wState.reloadState === 'DRY_RELOAD' ? 2 : 1;
            reloadTotal = Math.max(0.1, wState.reloadTotal);
            reloadTimer = 0;
            boltClicked = false;
        }

        reloadTimer += dt;
        const p = Math.min(1, reloadTimer / reloadTotal);

        if (key === 'rpg7') {
            const env = Math.sin(p * Math.PI);
            weaponAnimRot.x -= env * 0.22;
            weaponAnimRot.z += env * 0.18;
            weaponAnimPos.y -= env * 0.06;
            if (p < 0.30) {
                const k = p / 0.30;
                leftHandAnimOffset.set(-0.06 * k, -0.22 * k, 0.10 * k);
            } else if (p < 0.82) {
                const k = (p - 0.30) / 0.52;
                const slideZ = -0.32 + k * 0.20;
                leftHandAnimOffset.set(0.0, 0.05, slideZ);
                if (propWarheadMesh) {
                    propWarheadMesh.visible = true;
                    propWarheadMesh.position.set(0.0, 0.085, -0.62 + k * 0.24);
                }
            } else {
                const k = 1 - (p - 0.82) / 0.18;
                leftHandAnimOffset.set(0.0, 0.04 * k, -0.12 * k);
            }
            return;
        }

        if (reloadPhase === 1) {
            const env = Math.sin(p * Math.PI);
            weaponAnimRot.z += env * 0.32;
            weaponAnimRot.x += env * 0.14;
            weaponAnimPos.y -= Math.sin(p * Math.PI * 2) * 0.022;
            if (p < 0.25) {
                const k = p / 0.25;
                leftHandAnimOffset.set(0.0, -0.09 * k, 0.10 * k);
            } else if (p < 0.55) {
                const k = (p - 0.25) / 0.30;
                const dip = Math.sin(k * Math.PI);
                leftHandAnimOffset.set(-0.05 * dip, -0.09 - 0.20 * dip, 0.10 + 0.06 * dip);
            } else if (p < 0.82) {
                const k = (p - 0.55) / 0.27;
                const seat = Math.sin(k * Math.PI);
                leftHandAnimOffset.set(0.0, -0.09 + 0.03 * seat, 0.10);
                if (k > 0.7 && !boltClicked) {
                    boltClicked = true;
                    engine.sound?.playReloadClick?.(620);
                }
            } else {
                const k = 1 - (p - 0.82) / 0.18;
                leftHandAnimOffset.set(0.0, -0.09 * k, 0.10 * k);
            }
        } else {
            if (p < 0.68) {
                const sub = p / 0.68;
                const env = Math.sin(sub * Math.PI);
                weaponAnimRot.z += env * 0.34;
                weaponAnimRot.x += env * 0.16;
                if (sub < 0.35) {
                    const k = sub / 0.35;
                    leftHandAnimOffset.set(0.0, -0.09 * k, 0.10 * k);
                } else if (sub < 0.75) {
                    const k = (sub - 0.35) / 0.40;
                    const dip = Math.sin(k * Math.PI);
                    leftHandAnimOffset.set(-0.06 * dip, -0.09 - 0.22 * dip, 0.10 + 0.06 * dip);
                } else {
                    leftHandAnimOffset.set(0.0, -0.08, 0.10);
                }
            } else {
                const boltP = (p - 0.68) / 0.32;
                const rack = Math.sin(boltP * Math.PI);
                weaponAnimRot.z -= rack * 0.22;
                weaponAnimPos.z += rack * 0.04;
                leftHandAnimOffset.set(0.035 * rack, 0.025 * rack, (0.12 + 0.06 * rack) * rack);
                if (boltP > 0.55 && !boltClicked) {
                    boltClicked = true;
                    engine.sound?.playReloadClick?.(690);
                    engine.posSpring?.applyImpulse?.(0, -0.4, 0.6);
                }
            }
        }
    }

    function updateWeaponSwitch(dt) {
        if (switchPhase === 0) return;
        switchTimer += dt;
        const total = 0.42;
        const progress = Math.min(1, switchTimer / total);

        if (progress < 0.5) {
            const down = Math.sin(progress * Math.PI);
            weaponAnimPos.y -= down * 0.20;
            weaponAnimRot.x -= down * 0.34;
            weaponAnimRot.z += down * 0.16;
        } else {
            const up = Math.sin((progress - 0.5) * Math.PI);
            weaponAnimPos.y -= (1 - up) * 0.12;
            weaponAnimRot.x -= (1 - up) * 0.20;
        }

        if (progress >= 1.0) {
            switchPhase = 0;
            switchTimer = 0;
        }
    }

    function updateIK() {
        if (!armsReady) initArms();
        if (!armsReady || !shoulderR || !elbowR || !wristR) return;

        const key = engine.loadoutKeys[engine.currentWeaponIdx];
        const wState = engine.weaponStates[key];
        if (!wState || !wState.meshGroup) return;

        const sock = WEAPON_SOCKETS[key] || WEAPON_SOCKETS.ak12;

        armGroup.position.set(0, -0.26, 0.08);
        armGroup.rotation.set(0, 0, 0);

        shoulderR.quaternion.copy(restUpperR);
        elbowR.quaternion.copy(restLowerR);
        wristR.quaternion.copy(restHandR);
        if (shoulderL && elbowL && wristL) {
            shoulderL.quaternion.copy(restUpperL);
            elbowL.quaternion.copy(restLowerL);
            wristL.quaternion.copy(restHandL);
        }
        armGroup.updateWorldMatrix(true, true);
        wState.meshGroup.updateWorldMatrix(true, false);

        _gripWorld.set(
            sock.grip[0],
            sock.grip[1] - recoilWristPitch * 0.015,
            sock.grip[2] + recoilElbowKick * 0.025
        ).applyMatrix4(wState.meshGroup.matrixWorld);

        _knuckleDirR.set(sock.gripDir[0], sock.gripDir[1], sock.gripDir[2])
            .transformDirection(wState.meshGroup.matrixWorld).normalize();

        _palmWorldR.set(sock.palmR[0], sock.palmR[1], sock.palmR[2])
            .transformDirection(wState.meshGroup.matrixWorld).normalize();

        _wristTgt.copy(_gripWorld)
            .addScaledVector(_knuckleDirR, -0.075)
            .addScaledVector(_palmWorldR, -0.025);

        _poleR.set(0.35, -0.45 - recoilElbowKick * 0.12, 0.10)
            .applyQuaternion(engine.camera.quaternion);
        solveTwoBoneIK(shoulderR, elbowR, wristR, _wristTgt, _poleR);
        orientHandBasis(wristR, _knuckleDirR, _palmWorldR, false);
        curlFingers(wristR, 0.68, false, key === 'rpg7');

        if (shoulderL && elbowL && wristL) {
            _guardWorld.set(
                sock.handguard[0] + leftHandAnimOffset.x,
                sock.handguard[1] + leftHandAnimOffset.y,
                sock.handguard[2] + leftHandAnimOffset.z
            ).applyMatrix4(wState.meshGroup.matrixWorld);

            _knuckleDirL.set(sock.guardDir[0], sock.guardDir[1], sock.guardDir[2])
                .transformDirection(wState.meshGroup.matrixWorld).normalize();

            _palmWorldL.set(sock.palmL[0], sock.palmL[1], sock.palmL[2])
                .transformDirection(wState.meshGroup.matrixWorld).normalize();

            _wristTgt.copy(_guardWorld)
                .addScaledVector(_knuckleDirL, -0.075)
                .addScaledVector(_palmWorldL, -0.025);

            _poleL.set(-0.35, -0.45 - recoilElbowKick * 0.10, 0.10)
                .applyQuaternion(engine.camera.quaternion);
            solveTwoBoneIK(shoulderL, elbowL, wristL, _wristTgt, _poleL);
            orientHandBasis(wristL, _knuckleDirL, _palmWorldL, true);
            const isReloading = wState.reloading || magCheckTimer > 0;
            curlFingers(wristL, isReloading ? 0.32 : (key === 'rpg7' ? 0.70 : 0.55), true, key === 'rpg7');
        }
    }

    function updateAimFov(dt) {
        const key = engine.loadoutKeys[engine.currentWeaponIdx];
        const targetBlend = (engine.isAiming && !engine.weaponStates[key]?.reloading && switchPhase === 0) ? 1.0 : 0.0;
        aimBlend += (targetBlend - aimBlend) * Math.min(1.0, dt * 9.5);
        const smoothAim = aimBlend * aimBlend * (3.0 - 2.0 * aimBlend);

        const fovMult = SIGHT_FOV_MULT[key] || 0.88;
        const targetFov = engine.baseFov * (1.0 + (fovMult - 1.0) * smoothAim);
        if (Math.abs(engine.camera.fov - targetFov) > 0.01) {
            engine.camera.fov = targetFov;
            engine.camera.updateProjectionMatrix();
        }
    }

    const mod = {
        name: 'arms',

        install() {
            engine.events.on('game:started', () => {
                initArms();
            });

            engine.events.on('shot', (ev) => {
                if (!ev || !ev.isPlayer) return;
                const key = engine.loadoutKeys[engine.currentWeaponIdx];
                const wStat = STATS.WEAPONS[key];
                if (!wStat) return;
                const adsMult = engine.isAiming ? 0.55 : 1.0;
                recoilElbowKick = Math.min(1.0, recoilElbowKick + wStat.recoilKickBack * 12.0 * adsMult);
                recoilWristPitch = Math.min(1.0, recoilWristPitch + wStat.recoilPitch * 8.0 * adsMult);
            });
        },

        onStart() {
            initArms();
        },

        update(dt) {
            updateDeadzone(dt);
            updateReload(dt);
            updateWeaponSwitch(dt);

            engine.viewmodelRoot.position.add(weaponAnimPos);
            engine.viewmodelRoot.rotation.x += weaponAnimRot.x + deadzonePitch;
            engine.viewmodelRoot.rotation.y += weaponAnimRot.y + deadzoneYaw;
            engine.viewmodelRoot.rotation.z += weaponAnimRot.z;
            engine.viewmodelRoot.updateMatrixWorld(true);

            updateIK();
            updateAimFov(dt);
        },

        getAimRay(outOrigin, outDir) {
            engine.camera.getWorldPosition(outOrigin);
            outDir.set(0, 0, -1).applyQuaternion(engine.camera.quaternion);
            const pitchOff = deadzonePitch + engine.rotSpring.position.x * 0.35;
            const yawOff = deadzoneYaw + engine.rotSpring.position.y * 0.35;
            if (Math.abs(yawOff) > 1e-4 || Math.abs(pitchOff) > 1e-4) {
                _eul.set(pitchOff, yawOff, 0, 'YXZ');
                _q2.setFromEuler(_eul);
                outDir.applyQuaternion(_q2);
            }
            outDir.normalize();
        },

        applyMouseDeadzone(dx, dy) {
            const sens = (engine.isAiming ? 0.0013 * engine.settings.get('adsSensitivity') : 0.0021) * engine.settings.get('mouseSensitivity');
            return consumeLookDelta(-dx * sens, -dy * sens);
        },

        triggerSwitch() {
            switchPhase = 1;
            switchTimer = 0;
        },

        triggerMagCheck() {
            magCheckTimer = 0.85;
        },

        get deadzoneYaw() { return deadzoneYaw; },
        get deadzonePitch() { return deadzonePitch; },
        get aimBlend() { return aimBlend; }
    };

    return mod;
}
