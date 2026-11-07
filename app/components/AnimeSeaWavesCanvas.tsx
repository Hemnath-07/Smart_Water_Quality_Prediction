'use client';

import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  pulseSpeed: number;
  phase: number;
}

export function AnimeSeaWavesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    // Particle pool for falling wave spray & water droplets
    const particles: Particle[] = [];
    const maxParticles = 90;

    const spawnSpray = (x: number, y: number, upward = true) => {
      if (particles.length > maxParticles) return;
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const angle = upward ? (-Math.PI * 0.5 + (Math.random() - 0.5) * 1.2) : (Math.random() * Math.PI * 2);
        const speed = 1.8 + Math.random() * 4.5;
        const colors = ['#ffffff', '#bae6fd', '#7dd3fc', '#38bdf8', '#e0f2fe'];
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed + (Math.random() - 0.3) * 1.5,
          vy: Math.sin(angle) * speed - 0.5,
          radius: 1.2 + Math.random() * 3.2,
          alpha: 0.85 + Math.random() * 0.15,
          decay: 0.012 + Math.random() * 0.018,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    // Shimmering water sparkles (anime light motes)
    const sparkles: Sparkle[] = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: height * 0.45 + Math.random() * (height * 0.55),
      size: 1 + Math.random() * 3.5,
      alpha: Math.random(),
      pulseSpeed: 0.02 + Math.random() * 0.035,
      phase: Math.random() * Math.PI * 2,
    }));

    let t = 0;

    const render = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      // ── 1. Anime Twilight Sea Sky Gradient ────────────────────────────────
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, '#040b17');     // Midnight deep sky
      skyGrad.addColorStop(0.35, '#071830');  // Twilight ocean horizon
      skyGrad.addColorStop(0.65, '#0a2544');  // Deep sea swell base
      skyGrad.addColorStop(1, '#031024');     // Abyssal deep
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Distant horizon glow line
      const horizonY = height * 0.48;
      const glowGrad = ctx.createRadialGradient(width * 0.5, horizonY, 20, width * 0.5, horizonY, width * 0.7);
      glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
      glowGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.08)');
      glowGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, horizonY - 140, width, 280);

      // ── 2. Layer 1: Distant Deep Sea Wave Swell ──────────────────────────
      ctx.save();
      const wave1Y = height * 0.54;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) {
        const y = wave1Y +
          Math.sin(x * 0.0035 + t * 0.9) * 24 +
          Math.cos(x * 0.007 + t * 0.6) * 12;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      const grad1 = ctx.createLinearGradient(0, wave1Y - 40, 0, height);
      grad1.addColorStop(0, 'rgba(12, 53, 94, 0.85)');
      grad1.addColorStop(1, 'rgba(4, 20, 42, 0.95)');
      ctx.fillStyle = grad1;
      ctx.fill();
      ctx.restore();

      // ── 3. Layer 2: Mid-ground Surging Ocean Swell ───────────────────────
      ctx.save();
      const wave2Y = height * 0.64;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 6) {
        const y = wave2Y +
          Math.sin(x * 0.005 - t * 1.3) * 36 +
          Math.sin(x * 0.012 + t * 1.8) * 16 +
          Math.cos(x * 0.002 + t * 0.8) * 20;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      const grad2 = ctx.createLinearGradient(0, wave2Y - 60, 0, height);
      grad2.addColorStop(0, 'rgba(14, 116, 178, 0.75)');
      grad2.addColorStop(0.4, 'rgba(7, 65, 115, 0.9)');
      grad2.addColorStop(1, 'rgba(3, 24, 52, 0.98)');
      ctx.fillStyle = grad2;
      ctx.fill();
      ctx.restore();

      // ── 4. Layer 3: Main Anime Falling & Crashing Wave ───────────────────
      // Inspired by Japanese anime water/Hokusai wave curling physics
      ctx.save();
      const wave3Y = height * 0.74;
      const points: { x: number; y: number }[] = [];

      ctx.beginPath();
      ctx.moveTo(0, height);

      for (let x = 0; x <= width; x += 5) {
        // Asymmetric wave shape: steep falling front, gentle back slope
        const wavePhase = (x * 0.004 + t * 1.6);
        const swell = Math.sin(wavePhase);
        // Sharpen the wave peaks like anime wave crests
        const peakedSwell = Math.pow(Math.max(0, swell), 1.6) * 62 - Math.pow(Math.max(0, -swell), 1.2) * 28;
        const ripple = Math.sin(x * 0.02 - t * 2.5) * 8;
        const y = wave3Y - peakedSwell + ripple;
        points.push({ x, y });
        ctx.lineTo(x, y);

        // Spawn falling spray at high crests
        if (peakedSwell > 48 && Math.random() < 0.25) {
          spawnSpray(x, y - 4, true);
        }
      }

      ctx.lineTo(width, height);
      ctx.closePath();

      const grad3 = ctx.createLinearGradient(0, wave3Y - 80, 0, height);
      grad3.addColorStop(0, '#0ea5e9');        // Vibrant anime cyan wave face
      grad3.addColorStop(0.2, '#0284c7');      // Cerulean blue body
      grad3.addColorStop(0.55, '#034574');     // Deep indigo water volume
      grad3.addColorStop(1, '#021832');        // Shadow under swell
      ctx.fillStyle = grad3;
      ctx.fill();

      // ── 5. Anime White Foam Crest Ribbons (Falling Wave Crest) ───────────
      // Draw curling white and cyan foam along the falling wave edge
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Froth highlights & curling wave foam claws
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < points.length; i += 7) {
        const pt = points[i];
        const isCrest = pt.y < wave3Y - 22;
        if (isCrest) {
          // Anime curl droplet
          const clawHeight = 8 + Math.sin(i * 0.3 + t * 4) * 7;
          ctx.beginPath();
          ctx.ellipse(pt.x, pt.y - 2, 4 + Math.sin(i + t) * 2, clawHeight, -0.2, 0, Math.PI * 2);
          ctx.fill();

          // Falling foam tendrils
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.quadraticCurveTo(pt.x + 8, pt.y + 12, pt.x + 4, pt.y + 22);
          ctx.stroke();
        }
      }
      ctx.restore();

      // ── 6. Layer 4: Fore-shore Churning Surf & Swirling Foam ──────────────
      ctx.save();
      const wave4Y = height * 0.88;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 6) {
        const y = wave4Y +
          Math.sin(x * 0.007 + t * 2.2) * 22 +
          Math.cos(x * 0.015 - t * 1.5) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();

      const grad4 = ctx.createLinearGradient(0, wave4Y - 30, 0, height);
      grad4.addColorStop(0, 'rgba(56, 189, 248, 0.85)'); // Bright seafoam
      grad4.addColorStop(0.3, 'rgba(14, 165, 233, 0.9)');
      grad4.addColorStop(1, 'rgba(4, 24, 52, 0.98)');
      ctx.fillStyle = grad4;
      ctx.fill();

      // Foam lace ribbons on front surf
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 10) {
        const y = wave4Y +
          Math.sin(x * 0.007 + t * 2.2) * 22 +
          Math.cos(x * 0.015 - t * 1.5) * 10;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Floating anime foam bubbles / circles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      for (let x = 20; x < width; x += 65) {
        const bubbleY = wave4Y + Math.sin(x + t * 2) * 14 + 18;
        ctx.beginPath();
        ctx.arc(x + Math.sin(t + x) * 12, bubbleY, 3 + (x % 5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ── 7. Render & Update Falling Wave Spray & Droplets ──────────────────
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.14; // Gravity pulling spray droplets downward
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.y > height) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── 8. Render Anime Water Sparkles (Ghibli Shimmer Motes) ──────────────
      for (const sp of sparkles) {
        sp.phase += sp.pulseSpeed;
        const alpha = 0.2 + (Math.sin(sp.phase) + 1) * 0.4;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur = 10;

        // Draw 4-point anime sparkle star
        const r = sp.size;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - r * 2.2);
        ctx.lineTo(sp.x + r * 0.5, sp.y - r * 0.5);
        ctx.lineTo(sp.x + r * 2.2, sp.y);
        ctx.lineTo(sp.x + r * 0.5, sp.y + r * 0.5);
        ctx.lineTo(sp.x, sp.y + r * 2.2);
        ctx.lineTo(sp.x - r * 0.5, sp.y + r * 0.5);
        ctx.lineTo(sp.x - r * 2.2, sp.y);
        ctx.lineTo(sp.x - r * 0.5, sp.y - r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
