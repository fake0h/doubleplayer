// Wireframe humanoid with volumetric (capsule) limbs and simple procedural animation.
import * as THREE from 'three';

function limb(radius, length, mat, fillMat) {
  const geo = new THREE.CapsuleGeometry(radius, length, 4, 10);
  const g = new THREE.Group();
  const wire = new THREE.Mesh(geo, mat);
  const fill = new THREE.Mesh(geo, fillMat);
  // capsule is centered; shift so the group origin is the top joint
  wire.position.y = fill.position.y = -(length / 2 + radius * 0.6);
  g.add(fill, wire);
  g.userData.meshes = [fill, wire];
  return g;
}

// Muscle levels 0..5 (one per win in a streak). Values are girth multipliers.
const MUSCLE = {
  upperArm: 0.26,   // biceps grow the most
  foreArm: 0.17,
  thigh: 0.14,
  shin: 0.09,
  chestW: 0.14,
  chestD: 0.12,
  shoulder: 0.05,  // shoulders spread wider (meters per level)
  neck: 0.18,
  height: 0.02,
};
export const MAX_MUSCLE = 5;

export class WireBody {
  constructor(color) {
    this.color = new THREE.Color(color);
    this.mat = new THREE.MeshBasicMaterial({ color: this.color, wireframe: true, transparent: true, opacity: 0.95 });
    this.fillMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.08, depthWrite: false });
    const m = this.mat, f = this.fillMat;

    this.root = new THREE.Group();          // positioned at the feet
    this.hips = new THREE.Group();
    this.hips.position.y = 0.98;
    this.root.add(this.hips);

    // torso: pelvis + chest
    const pelvisGeo = new THREE.SphereGeometry(0.2, 12, 8);
    pelvisGeo.scale(1.15, 0.7, 0.8);
    this.hips.add(new THREE.Mesh(pelvisGeo, m), new THREE.Mesh(pelvisGeo, f));

    this.spine = new THREE.Group();
    this.spine.position.y = 0.08;
    this.hips.add(this.spine);
    const chestGeo = new THREE.CapsuleGeometry(0.21, 0.32, 5, 12);
    chestGeo.scale(1.15, 1, 0.75);
    const chestW = new THREE.Mesh(chestGeo, m), chestF = new THREE.Mesh(chestGeo, f);
    chestW.position.y = chestF.position.y = 0.3;
    this.spine.add(chestW, chestF);
    this.chest = [chestW, chestF];

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8, 1), m);
    neck.position.y = 0.66;
    this.spine.add(neck);
    this.neck = neck;
    this.head = new THREE.Group();
    this.head.position.y = 0.84;
    const headGeo = new THREE.SphereGeometry(0.15, 14, 10);
    headGeo.scale(0.9, 1.1, 1);
    this.head.add(new THREE.Mesh(headGeo, m), new THREE.Mesh(headGeo, f));
    // visor so you can see which way they face
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    visor.position.set(0, 0.02, -0.14);
    this.head.add(visor);
    this.spine.add(this.head);

    // arms
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.31 * side, 0.55, 0);
      const upper = limb(0.075, 0.22, m, f);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.34;
      upper.add(elbow);
      const fore = limb(0.065, 0.2, m, f);
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.31;
      fore.add(hand);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), m);
      hand.add(fist);
      this.spine.add(shoulder);
      return { shoulder, elbow, hand, upper, fore, side };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // legs
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.12 * side, -0.05, 0);
      const thigh = limb(0.095, 0.3, m, f);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      thigh.add(knee);
      const shin = limb(0.08, 0.3, m, f);
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26, 2, 1, 2), m);
      foot.position.set(0, -0.45, -0.06);
      shin.add(foot);
      this.hips.add(hip);
      return { hip, knee, thigh, shin };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    this.walkPhase = 0;
    this.attackT = 0;      // 0..1 progress of a swing
    this.attackKind = null;
    this.held = null;
    this.flashT = 0;

    // muscles
    this.muscle = 0;          // current (animated) level
    this.muscleTarget = 0;
    this.glow = null;         // built the first time someone hits max level
    this.applyMuscle(0);
  }

  setMuscle(level) {
    this.muscleTarget = Math.max(0, Math.min(MAX_MUSCLE, level));
  }

  applyMuscle(L) {
    const girth = (parts, k) => {
      for (const mesh of parts) mesh.scale.set(1 + k * L, 1, 1 + k * L);
    };
    for (const arm of [this.armL, this.armR]) {
      girth(arm.upper.userData.meshes, MUSCLE.upperArm);
      girth(arm.fore.userData.meshes, MUSCLE.foreArm);
      arm.shoulder.position.x = (0.31 + MUSCLE.shoulder * L) * arm.side;
    }
    for (const leg of [this.legL, this.legR]) {
      girth(leg.thigh.userData.meshes, MUSCLE.thigh);
      girth(leg.shin.userData.meshes, MUSCLE.shin);
    }
    for (const c of this.chest) c.scale.set(1 + MUSCLE.chestW * L, 1 + 0.03 * L, 1 + MUSCLE.chestD * L);
    this.neck.scale.set(1 + MUSCLE.neck * L, 1, 1 + MUSCLE.neck * L);
    this.root.scale.setScalar(1 + MUSCLE.height * L);
  }

  buildGlow() {
    // additive halo shells around every body part + a light that travels with the player
    this.glowMat = new THREE.MeshBasicMaterial({
      color: this.color.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    const shells = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.material === this.fillMat) shells.push(o);
    });
    for (const o of shells) {
      const shell = new THREE.Mesh(o.geometry, this.glowMat);
      shell.scale.setScalar(1.35);
      o.add(shell);
    }
    this.glowLight = new THREE.PointLight(this.color, 0, 7);
    this.glowLight.position.y = 1.2;
    this.root.add(this.glowLight);
    // ring of energy at the feet
    this.glowRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 40),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glowRing.rotation.x = -Math.PI / 2;
    this.glowRing.position.y = 0.05;
    this.root.add(this.glowRing);
    this.glow = true;
  }

  updateMuscleAndGlow(dt) {
    if (Math.abs(this.muscle - this.muscleTarget) > 0.001) {
      // grow/shrink smoothly over about half a second
      this.muscle += (this.muscleTarget - this.muscle) * Math.min(1, dt * 5);
      if (Math.abs(this.muscle - this.muscleTarget) < 0.01) this.muscle = this.muscleTarget;
      this.applyMuscle(this.muscle);
    }
    const glowing = this.muscle > MAX_MUSCLE - 0.3;
    if (glowing && !this.glow) this.buildGlow();
    if (this.glow) {
      const t = performance.now() / 1000;
      const on = glowing ? 1 : 0;
      const pulse = 0.5 + Math.sin(t * 4) * 0.5;
      this.glowMat.opacity += ((0.22 + pulse * 0.18) * on - this.glowMat.opacity) * Math.min(1, dt * 4);
      this.glowLight.intensity = on * (3 + pulse * 3);
      this.glowRing.material.opacity = on * (0.35 + pulse * 0.4);
      this.glowRing.scale.setScalar(1 + pulse * 0.25);
      this.fillMat.opacity = this.flashT > 0 ? this.fillMat.opacity : 0.08 + on * 0.12;
    }
  }

  setWeapon(mesh, kind) {
    if (this.held) this.armR.hand.remove(this.held);
    this.held = mesh;
    this.heldKind = kind;
    if (mesh) {
      // weapon models point along +Y; melee blades stick forward out of the fist,
      // guns continue along the arm.
      mesh.rotation.set(kind === 'melee' ? -Math.PI / 2 : Math.PI, 0, 0);
      this.armR.hand.add(mesh);
    }
  }

  swing(kind) { this.attackT = 1; this.attackKind = kind; }
  flash() { this.flashT = 1; }

  update(dt, moving, pitch = 0, downed = false) {
    this.updateMuscleAndGlow(dt);
    const speed = moving ? 9 : 0;
    this.walkPhase += dt * speed;
    const s = Math.sin(this.walkPhase) * (moving ? 0.7 : 0);
    const idle = Math.sin(performance.now() / 600) * 0.03;

    this.legL.hip.rotation.x = s;
    this.legR.hip.rotation.x = -s;
    this.legL.knee.rotation.x = Math.max(0, -s) * 1.1;
    this.legR.knee.rotation.x = Math.max(0, s) * 1.1;
    this.armL.shoulder.rotation.x = -s * 0.8;
    this.armL.elbow.rotation.x = -0.25;
    this.hips.position.y = 0.98 + Math.abs(Math.cos(this.walkPhase)) * (moving ? 0.05 : 0) + idle;
    this.spine.rotation.x = moving ? -0.08 : 0;
    this.head.rotation.x = -pitch * 0.5;

    // right arm: aims when holding a ranged weapon, otherwise swings
    const armR = this.armR;
    if (this.held && this.heldKind !== 'melee') {
      armR.shoulder.rotation.set(Math.PI / 2 + pitch, 0, 0);
      armR.elbow.rotation.x = 0;
      if (this.attackT > 0) armR.shoulder.rotation.x += this.attackT * 0.35; // recoil
    } else if (this.attackT > 0) {
      // overhead swing: raised then slashing down/forward
      const p = 1 - this.attackT;
      const ang = p < 0.3 ? THREE.MathUtils.lerp(0, 2.6, p / 0.3) : THREE.MathUtils.lerp(2.6, 0.4, (p - 0.3) / 0.7);
      armR.shoulder.rotation.set(ang, 0, -0.2);
      armR.elbow.rotation.x = -0.3;
    } else {
      armR.shoulder.rotation.set(this.held ? 0.5 + s * 0.3 : s * 0.8, 0, 0);
      armR.elbow.rotation.x = this.held ? -0.6 : -0.25;
    }
    this.attackT = Math.max(0, this.attackT - dt * 3.2);

    // knocked out: lie down
    const targetRot = downed ? -Math.PI / 2 : 0;
    this.root.rotation.x += (targetRot - this.root.rotation.x) * Math.min(1, dt * 6);

    // hit flash
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 4);
      this.mat.color.copy(this.color).lerp(new THREE.Color(0xff0000), this.flashT);
      this.fillMat.opacity = 0.08 + this.flashT * 0.5;
      this.fillMat.color.copy(this.mat.color);
    }
  }
}
