// M3 Expressive motion scheme: physics-based springs, exported to CSS as
// `linear()` easing curves with matching durations.
//   spatial = position/size/shape (may overshoot)   effects = colour/opacity (no overshoot)

const SPRINGS = {
  'fast-spatial':    { damping: 0.6, stiffness: 800 },
  'default-spatial': { damping: 0.8, stiffness: 380 },
  'slow-spatial':    { damping: 0.8, stiffness: 200 },
  'fast-effects':    { damping: 1, stiffness: 3800 },
  'default-effects': { damping: 1, stiffness: 1600 },
  'slow-effects':    { damping: 1, stiffness: 800 },
};

function springPosition(damping, stiffness) {
  const w0 = Math.sqrt(stiffness);
  if (damping < 1) {
    const wd = w0 * Math.sqrt(1 - damping * damping);
    return (t) => 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + (damping * w0 / wd) * Math.sin(wd * t));
  }
  return (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

export function springCurve({ damping, stiffness }, samples = 48) {
  const x = springPosition(damping, stiffness);
  let settle = 0;
  for (let t = 0; t < 4; t += 1 / 500) if (Math.abs(x(t) - 1) > 0.002) settle = t;
  const duration = Math.max(80, Math.round(settle * 1000));
  const pts = Array.from({ length: samples + 1 }, (_, i) => (i === samples ? 1 : +x((settle * i) / samples).toFixed(4)));
  return { easing: `linear(${pts.join(', ')})`, duration };
}

export function installMotion(root = document.documentElement) {
  for (const [name, spec] of Object.entries(SPRINGS)) {
    const { easing, duration } = springCurve(spec);
    root.style.setProperty(`--md-spring-${name}`, easing);
    root.style.setProperty(`--md-spring-${name}-dur`, `${duration}ms`);
  }
}
