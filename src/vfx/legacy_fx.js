import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _right = new THREE.Vector3();

export const legacyFxMethods = {
    spawnBrassCasing() {
        if (this.vfx && typeof this.vfx.spentCasing === 'function') {
            _v1.set(0.18, -0.09, -0.35);
            _v1.applyMatrix4(this.camera.matrixWorld);
            _right.set(1, 0.45, 0.1).applyQuaternion(this.camera.quaternion).normalize();
            this.vfx.spentCasing(_v1, _right, this.playerVelocity);
        }
    },

    spawnTracerBeam(startPos, endPos, hexColor) {
        if (this.vfx && typeof this.vfx.tracer === 'function') {
            this.vfx.tracer(startPos, endPos, hexColor);
        }
    },

    spawnImpactParticles(pos, normal, hexColor, count = 12) {
        if (!this.vfx) return;
        if (hexColor === 0x9e0b0b && typeof this.vfx.blood === 'function') {
            _v2.copy(normal).negate();
            this.vfx.blood({ pos, dir: _v2, amount: count > 12 ? 2 : 1 });
            return;
        }
        if ((hexColor === 0xff6611 || hexColor === 0xff4400) && typeof this.vfx.armorRicochet === 'function') {
            this.vfx.armorRicochet(pos, normal);
            return;
        }
        if (typeof this.vfx.impact === 'function') {
            this.vfx.impact({ pos, normal, surface: hexColor === 0x222222 ? 'concrete' : 'dirt' });
        }
    },

    updateEffects(dt) {
        if (this.muzzleLight.intensity > 0) {
            this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 95.0);
        }

        for (let i = this.dynamicLights.length - 1; i >= 0; i--) {
            const dl = this.dynamicLights[i];
            dl.ttl -= dt;
            if (dl.ttl <= 0) {
                this.scene.remove(dl.light);
                this.dynamicLights.splice(i, 1);
            } else {
                dl.light.intensity = 24.0 * (dl.ttl / dl.maxTtl);
            }
        }
    },
};
