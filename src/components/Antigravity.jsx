/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const AntigravityInner = ({
  count = 300,
  magnetRadius = 10,
  ringRadius = 10,
  waveSpeed = 0.4,
  waveAmplitude = 1,
  particleSize = 2,
  lerpSpeed = 0.1,
  color = '#FF9FFC',
  autoAnimate = false,
  particleVariance = 1,
  rotationSpeed = 0,
  depthFactor = 1,
  pulseSpeed = 3,
  particleShape = 'capsule',
  fieldStrength = 10
}) => {
  const meshRef = useRef(null);
  const { viewport, invalidate } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastMouseMoveTime = useRef(0);
  const virtualMouse = useRef({ x: 0, y: 0 });

  const particles = useMemo(() => {
    const temp = [];
    const width = viewport.width || 100;
    const height = viewport.height || 100;

    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;

      const x = (Math.random() - 0.5) * width;
      const y = (Math.random() - 0.5) * height;
      const z = (Math.random() - 0.5) * 20;

      const randomRadiusOffset = (Math.random() - 0.5) * 2;

      temp.push({
        t,
        speed,
        mx: x,
        my: y,
        mz: z,
        cx: x,
        cy: y,
        cz: z,
        randomRadiusOffset
      });
    }
    return temp;
  }, [count, viewport.width, viewport.height]);

  useEffect(() => {
    const intervalId = window.setInterval(invalidate, 1000 / 30);
    return () => window.clearInterval(intervalId);
  }, [invalidate]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { viewport: v, pointer: m } = state;
    const frameScale = Math.min(delta * 60, 2);
    const now = Date.now();

    const mouseDist = Math.hypot(m.x - lastMousePos.current.x, m.y - lastMousePos.current.y);

    if (mouseDist > 0.001) {
      lastMouseMoveTime.current = now;
      lastMousePos.current.x = m.x;
      lastMousePos.current.y = m.y;
    }

    let destX = (m.x * v.width) / 2;
    let destY = (m.y * v.height) / 2;

    if (autoAnimate && now - lastMouseMoveTime.current > 2000) {
      const time = state.clock.getElapsedTime();
      destX = Math.sin(time * 0.5) * (v.width / 4);
      destY = Math.cos(time * 0.5 * 2) * (v.height / 4);
    }

    const smoothFactor = 1 - Math.pow(0.95, frameScale);
    virtualMouse.current.x += (destX - virtualMouse.current.x) * smoothFactor;
    virtualMouse.current.y += (destY - virtualMouse.current.y) * smoothFactor;

    const targetX = virtualMouse.current.x;
    const targetY = virtualMouse.current.y;

    const globalRotation = state.clock.getElapsedTime() * rotationSpeed;
    const particleLerp = 1 - Math.pow(1 - lerpSpeed, frameScale);
    const orientToPointer = particleShape !== 'box';

    particles.forEach((particle, i) => {
      let { t, speed, mx, my, mz, cz, randomRadiusOffset } = particle;

      t = particle.t += (speed / 2) * frameScale;

      const projectionFactor = 1 - cz / 50;
      const projectedTargetX = targetX * projectionFactor;
      const projectedTargetY = targetY * projectionFactor;

      const dx = mx - projectedTargetX;
      const dy = my - projectedTargetY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let targetPosX = mx;
      let targetPosY = my;
      let targetPosZ = mz * depthFactor;

      if (dist < magnetRadius) {
        const angle = Math.atan2(dy, dx) + globalRotation;

        const wave = Math.sin(t * waveSpeed + angle) * (0.5 * waveAmplitude);
        const deviation = randomRadiusOffset * (5 / (fieldStrength + 0.1));

        const currentRingRadius = ringRadius + wave + deviation;

        targetPosX = projectedTargetX + currentRingRadius * Math.cos(angle);
        targetPosY = projectedTargetY + currentRingRadius * Math.sin(angle);
        targetPosZ = mz * depthFactor + Math.sin(t) * (waveAmplitude * depthFactor);
      }

      particle.cx += (targetPosX - particle.cx) * particleLerp;
      particle.cy += (targetPosY - particle.cy) * particleLerp;
      particle.cz += (targetPosZ - particle.cz) * particleLerp;

      dummy.position.set(particle.cx, particle.cy, particle.cz);

      if (orientToPointer) {
        dummy.lookAt(projectedTargetX, projectedTargetY, particle.cz);
        dummy.rotateX(Math.PI / 2);
      }

      const currentDistToMouse = Math.hypot(
        particle.cx - projectedTargetX,
        particle.cy - projectedTargetY
      );

      const distFromRing = Math.abs(currentDistToMouse - ringRadius);
      let scaleFactor = 1 - distFromRing / 10;

      scaleFactor = Math.max(0, Math.min(1, scaleFactor));

      const finalScale = scaleFactor * (0.8 + Math.sin(t * pulseSpeed) * 0.2 * particleVariance) * particleSize;
      dummy.scale.set(finalScale, finalScale, finalScale);

      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      {particleShape === 'capsule' && <capsuleGeometry args={[0.1, 0.4, 4, 8]} />}
      {particleShape === 'sphere' && <sphereGeometry args={[0.2, 16, 16]} />}
      {particleShape === 'box' && <boxGeometry args={[0.3, 0.3, 0.3]} />}
      {particleShape === 'tetrahedron' && <tetrahedronGeometry args={[0.3]} />}
      <meshBasicMaterial color={color} />
    </instancedMesh>
  );
};

const Antigravity = ({ eventSource, eventPrefix = 'client', ...props }) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 50], fov: 35 }}
      dpr={[1, 1.25]}
      frameloop="demand"
      eventSource={eventSource}
      eventPrefix={eventPrefix}
      gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
      fallback={<div className="antigravity__fallback" aria-hidden="true" />}
    >
      <AntigravityInner {...props} />
    </Canvas>
  );
};

export default Antigravity;
