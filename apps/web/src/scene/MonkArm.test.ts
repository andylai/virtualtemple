import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { poseMonkArm, type MonkArmRefs } from './MonkArm';

const chain = (): MonkArmRefs => ({
  upper: { current: new Group() },
  fore: { current: new Group() },
  palm: { current: new Group() },
});

describe('procedural arm rig', () => {
  it('keeps both shoulders fixed through the entire greeting', () => {
    const arm = chain();
    poseMonkArm(arm, -1, 0, 0);
    const shoulder = arm.upper.current!.position.clone();
    for (let amount = 0; amount <= 1; amount += 0.1) {
      poseMonkArm(arm, -1, amount, 0);
      expect(arm.upper.current!.position.toArray()).toEqual(shoulder.toArray());
    }
  });

  it('meets upright palms at the chest, in front of the robe', () => {
    const left = chain();
    const right = chain();
    poseMonkArm(left, -1, 1, 0);
    poseMonkArm(right, 1, 1, 0);
    const l = left.palm.current!;
    const r = right.palm.current!;
    expect(r.position.x - l.position.x).toBeCloseTo(0.05);
    expect(l.position.y).toBeCloseTo(r.position.y);
    expect(l.position.z).toBeLessThan(-0.25);
    expect(l.position.y).toBeGreaterThan(left.fore.current!.position.y);
    expect(l.rotation.x).toBe(0);
  });

  it('joins each sleeve exactly to the next joint without gaps', () => {
    const arm = chain();
    for (const together of [0, 0.5, 1]) {
      poseMonkArm(arm, 1, together, 0.3);
      arm.upper.current!.updateMatrixWorld();
      arm.fore.current!.updateMatrixWorld();
      const elbow = arm.upper.current!.localToWorld(new Vector3(0, -1, 0));
      const wrist = arm.fore.current!.localToWorld(new Vector3(0, -1, 0));
      expect(elbow.distanceTo(arm.fore.current!.position)).toBeLessThan(1e-8);
      expect(wrist.distanceTo(arm.palm.current!.position)).toBeLessThan(1e-8);
    }
  });

  it('keeps the greeting still as the last walking swing fades', () => {
    const arm = chain();
    poseMonkArm(arm, 1, 1, 0);
    const wrist = arm.palm.current!.position.clone();
    poseMonkArm(arm, 1, 1, 0.4);
    expect(arm.palm.current!.position.toArray()).toEqual(wrist.toArray());
  });
});
