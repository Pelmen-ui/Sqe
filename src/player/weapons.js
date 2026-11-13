import * as THREE from 'three';
import { STATS } from '../../stats.js';

const _shotPos = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();

export const playerWeaponMethods = {
    setupViewmodelMeshes() {
        for (const key of this.loadoutKeys) {
            const wStat = STATS.WEAPONS[key];
            const wState = this.weaponStates[key];
            wState.heat = 0;
            wState.jammed = false;
            wState.fireMode = 'AUTO';
            wState.semiFired = false;
            wState.burstRemaining = 0;

            const group = new THREE.Group();
            const model = this.instantiateStaticModel(wStat.modelKey, wStat.scale);
            model.rotation.set(wStat.rotOffset[0], wStat.rotOffset[1], wStat.rotOffset[2]);
            if (key === 'rpg7') {
                model.traverse((o) => {
                    if (o.name && (o.name.includes('Cylinder_2') || o.name.includes('LOD'))) o.visible = false;
                    if (o.isMesh && o.name === 'Cube_4_Mat_0') {
                        const loadedGeom = o.geometry;
                        const emptyGeom = loadedGeom.clone();
                        const pos = loadedGeom.attributes.position;
                        const idx = loadedGeom.index;
                        if (idx) {
                            const newIndices = [];
                            for (let i = 0; i < idx.count; i += 3) {
                                const a = idx.getX(i);
                                const b = idx.getX(i + 1);
                                const c = idx.getX(i + 2);
                                const isRocket = (pos.getX(a) > 0.40 || pos.getX(b) > 0.40 || pos.getX(c) > 0.40);
                                if (!isRocket) {
                                    newIndices.push(a, b, c);
                                }
                            }
                            emptyGeom.setIndex(newIndices);
                        }
                        emptyGeom.computeBoundingBox();
                        emptyGeom.computeBoundingSphere();
                        wState.rpgMesh = o;
                        wState.loadedGeom = loadedGeom;
                        wState.emptyGeom = emptyGeom;
                    }
                });
            }
            group.add(model);
            group.visible = (key === this.loadoutKeys[this.currentWeaponIdx]);
            this.viewmodelRoot.add(group);
            wState.meshGroup = group;
        }
    },

    syncRpgRocketMesh() {
        const wState = this.weaponStates['rpg7'];
        if (!wState || !wState.rpgMesh) return;
        wState.rpgMesh.geometry = (wState.mag > 0) ? wState.loadedGeom : wState.emptyGeom;
    },

    switchWeapon(index) {
        if (index < 0 || index >= this.loadoutKeys.length) return;
        this.currentWeaponIdx = index;
        const activeKey = this.loadoutKeys[this.currentWeaponIdx];
        for (const k of this.loadoutKeys) {
            const st = this.weaponStates[k];
            if (st.meshGroup) st.meshGroup.visible = (k === activeKey);
        }
        this.syncRpgRocketMesh();
        if (this.arms && typeof this.arms.triggerSwitch === 'function') {
            this.arms.triggerSwitch();
        }
        this.posSpring.applyImpulse(0, -1.2, 0.6);
        this.rotSpring.applyImpulse(-1.8, 0, 0.8);
        this.sound.playReloadClick(520);
        this.updateWeaponHUD();
    },

    toggleFireSelector() {
        const key = this.loadoutKeys[this.currentWeaponIdx];
        const wState = this.weaponStates[key];
        if (!wState || key === 'rpg7') return;

        if (key === 'ak12') {
            if (!wState.fireMode || wState.fireMode === 'AUTO') wState.fireMode = 'SEMI';
            else if (wState.fireMode === 'SEMI') wState.fireMode = 'BURST';
            else wState.fireMode = 'AUTO';
        } else {
            wState.fireMode = (wState.fireMode === 'SEMI') ? 'AUTO' : 'SEMI';
        }
        this.sound.playReloadClick(820);
        this.updateWeaponHUD();
    },

    performTactileMagazineCheck() {
        const key = this.loadoutKeys[this.currentWeaponIdx];
        const wStat = STATS.WEAPONS[key];
        const wState = this.weaponStates[key];
        if (!wState) return;

        const ratio = wState.mag / Math.max(1, wStat.magCapacity);
        let msg = 'ПОЧТИ ПУСТ';
        if (ratio > 0.75) msg = 'ПОЧТИ ПОЛНЫЙ';
        else if (ratio > 0.35) msg = 'ОКОЛО ПОЛОВИНЫ';

        if (typeof this.notify === 'function') {
            this.notify(`МАГАЗИН: ${msg}`);
        }
        if (this.arms && typeof this.arms.triggerMagCheck === 'function') {
            this.arms.triggerMagCheck();
        }
        this.sound.playReloadClick(480);
        this.posSpring.applyImpulse(0.3, -0.8, 0.2);
    },

    triggerTacticalReload() {
        const key = this.loadoutKeys[this.currentWeaponIdx];
        const wStat = STATS.WEAPONS[key];
        const wState = this.weaponStates[key];

        if (wState.jammed) {
            wState.jammed = false;
            wState.heat = Math.max(0, wState.heat - 0.45);
            this.sound.playReloadClick(650);
            this.posSpring.applyImpulse(0, 0.8, -0.4);
            this.rotSpring.applyImpulse(1.2, -0.2, -0.6);
            this.updateWeaponHUD();
            return;
        }

        if (wState.reloading || wState.reserve <= 0) return;

        const maxPossible = wState.chambered ? wStat.magCapacity + 1 : wStat.magCapacity;
        if (wState.mag >= maxPossible) return;

        wState.reloading = true;
        if (wState.mag > 0) {
            wState.reloadState = 'TACTICAL_RELOAD';
            wState.reloadTotal = wStat.tacticalReloadTime;
            wState.chambered = true;
            wState.mag -= 1;
        } else {
            wState.reloadState = 'DRY_RELOAD';
            wState.reloadTotal = wStat.dryReloadTime;
            wState.chambered = false;
        }
        wState.reloadTimer = wState.reloadTotal;
        this.sound.playReloadClick(440);
        this.posSpring.applyImpulse(0, -1.6, 0.4);
        this.rotSpring.applyImpulse(-2.4, 0.6, 1.4);
        this.updateWeaponHUD();
    },

    updateReloadStateMachine(dt) {
        const key = this.loadoutKeys[this.currentWeaponIdx];
        const wStat = STATS.WEAPONS[key];
        const wState = this.weaponStates[key];

        if (wState.heat > 0) {
            wState.heat = Math.max(0, wState.heat - dt * 0.08);
        }

        if (!this.isFiring) {
            wState.semiFired = false;
            wState.burstRemaining = 0;
        }

        if (!wState.reloading) return;

        wState.reloadTimer -= dt;
        if (wState.reloadTimer <= 0) {
            const needed = wStat.magCapacity - wState.mag;
            const take = Math.min(needed, wState.reserve);
            wState.mag += take;
            wState.reserve -= take;

            if (wState.chambered && wState.reserve > 0) {
                wState.mag += 1;
                wState.reserve -= 1;
            } else if (!wState.chambered && wState.mag > 0) {
                wState.chambered = true;
            }

            wState.reloading = false;
            wState.reloadState = 'READY';
            this.syncRpgRocketMesh();
            this.sound.playReloadClick(760);
            this.posSpring.applyImpulse(0, 0.9, -0.5);
            this.rotSpring.applyImpulse(1.5, -0.3, -0.9);
            this.updateWeaponHUD();
        }
    },

    tryFireCurrentWeapon() {
        if (this.fpvMode.active || this.playerVehicleState.role === 'DRIVER') return;
        if (this.modifier('canFire') <= 0) return;
        const key = this.loadoutKeys[this.currentWeaponIdx];
        const wStat = STATS.WEAPONS[key];
        const wState = this.weaponStates[key];
        if (wState.reloading) return;

        if (wState.jammed) {
            this.sound.playReloadClick(260);
            return;
        }

        if (wState.fireMode === 'SEMI' && wState.semiFired) {
            return;
        }
        if (wState.fireMode === 'BURST' && wState.semiFired && wState.burstRemaining <= 0) {
            return;
        }

        const now = performance.now() * 0.001;
        const interval = 60.0 / wStat.rpm;
        if (now - wState.lastFireTime < interval) return;

        if (wState.mag <= 0) {
            wState.chambered = false;
            this.sound.playReloadClick(310);
            this.triggerTacticalReload();
            return;
        }

        wState.lastFireTime = now;
        wState.mag -= 1;
        if (wState.mag === 0) wState.chambered = false;

        if (wState.fireMode === 'SEMI') {
            wState.semiFired = true;
        } else if (wState.fireMode === 'BURST') {
            if (!wState.semiFired) {
                wState.semiFired = true;
                wState.burstRemaining = 1;
            } else {
                wState.burstRemaining = Math.max(0, wState.burstRemaining - 1);
            }
        }

        wState.heat = Math.min(1.0, (wState.heat || 0) + 0.012);
        if (wState.heat > 0.82 && Math.random() < (wState.heat - 0.8) * 0.35) {
            wState.jammed = true;
            this.events.emit('weapon:overheat', { weapon: key });
        }

        this.syncRpgRocketMesh();
        this.updateWeaponHUD();

        this.getAimRay(_shotPos, _shotDir);
        _muzzlePos.copy(_shotPos).addScaledVector(_shotDir, 0.72);
        _muzzlePos.y -= 0.08;
        this.sound.playGunshot(0, wStat.isExplosive);
        this.events.emit('shot', {
            pos: _muzzlePos,
            dir: _shotDir,
            weapon: wStat,
            shooter: null,
            isPlayer: true,
            faction: this.playerFaction
        });
        this.muzzleLight.intensity = wStat.isExplosive ? 12.0 : 6.5;

        const adsMult = (this.isAiming ? 0.58 : 1.0) * this.modifier('recoil');
        this.posSpring.applyImpulse(
            (Math.random() - 0.5) * 0.45 * adsMult,
            wStat.recoilRise * 28.0 * adsMult,
            wStat.recoilKickBack * 42.0 * adsMult
        );
        this.rotSpring.applyImpulse(
            wStat.recoilPitch * 32.0 * adsMult,
            (Math.random() - 0.5) * wStat.recoilYaw * 48.0 * adsMult,
            (Math.random() - 0.5) * wStat.recoilRoll * 40.0 * adsMult
        );

        this.pitch = Math.min(1.35, this.pitch + wStat.recoilPitch * 0.19 * adsMult);
        this.yaw += (Math.random() - 0.5) * wStat.recoilYaw * 0.25 * adsMult;

        if (!wStat.isExplosive) {
            this.spawnBrassCasing();
            this.performBallisticRaycast(wStat);
        } else {
            this.launchRpgRocket(wStat);
        }
    },

    updateViewmodelTransform(dt, bobX = 0, bobY = 0) {
        this.posSpring.update(dt);
        this.rotSpring.update(dt);

        const activeKey = this.loadoutKeys[this.currentWeaponIdx];
        const wStat = STATS.WEAPONS[activeKey];
        const wState = this.weaponStates[activeKey];
        const targetAds = (this.isAiming && !(wState && wState.reloading)) ? 1.0 : 0.0;
        if (typeof this.adsAlpha !== 'number') this.adsAlpha = 0.0;
        this.adsAlpha += (targetAds - this.adsAlpha) * Math.min(1.0, dt * 9.5);
        const s = this.adsAlpha * this.adsAlpha * (3.0 - 2.0 * this.adsAlpha);

        const bx = wStat.hipPos[0] + (wStat.adsPos[0] - wStat.hipPos[0]) * s;
        const by = wStat.hipPos[1] + (wStat.adsPos[1] - wStat.hipPos[1]) * s;
        const bz = wStat.hipPos[2] + (wStat.adsPos[2] - wStat.hipPos[2]) * s;
        const bobScale = 0.45 * (1.0 - s * 0.72);

        this.viewmodelRoot.position.set(
            bx + bobX * bobScale + this.posSpring.position.x - this.smoothYawVel * 0.11 * (1.0 - s * 0.65),
            by + bobY * bobScale + this.posSpring.position.y + this.smoothPitchVel * 0.11 * (1.0 - s * 0.65),
            bz + this.posSpring.position.z
        );
        const hipYaw = -0.025 * (1.0 - s);
        const hipPitch = -0.015 * (1.0 - s);
        this.viewmodelRoot.rotation.set(
            this.rotSpring.position.x + hipPitch,
            this.rotSpring.position.y + hipYaw,
            this.rotSpring.position.z - this.currentLean * 0.15
        );
    },
};
