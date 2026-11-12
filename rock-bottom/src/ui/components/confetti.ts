import { prefersReducedMotion } from '../dom';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  wobble: number;
  colour: string;
  round: boolean;
}

const COLOURS = ['#ffd24a', '#fff1b8', '#f7b500', '#ffffff', '#4f8cff', '#9fc2ff'];

/**
 * Fires confetti over the whole screen from both lower corners.
 * `intensity` scales the number of pieces; the jackpot uses a bigger burst.
 */
export function fireConfetti(intensity = 1): void {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  let width = 0;
  let height = 0;
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const count = Math.round(Math.min(260, 90 + width / 6) * intensity);
  const power = Math.min(1.25, Math.max(0.75, height / 800));
  const pieces: Piece[] = Array.from({ length: count }, (_, index) => {
    const fromLeft = index % 2 === 0;
    const angle = (fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3) + (Math.random() - 0.5) * 0.9;
    const speed = (9 + Math.random() * 13) * power;
    return {
      x: fromLeft ? -10 : width + 10,
      y: height * (0.72 + Math.random() * 0.2),
      vx: Math.cos(angle) * speed * (0.6 + width / 1600),
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 8,
      spin: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI * 2,
      wobble: Math.random() * Math.PI * 2,
      colour: COLOURS[index % COLOURS.length],
      round: index % 5 === 0,
    };
  });

  const started = performance.now();
  const lifetime = 4200 + 1200 * intensity;
  let previous = started;

  const frame = (now: number) => {
    const delta = Math.min(2.5, (now - previous) / 16.67);
    previous = now;
    const age = now - started;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, Math.min(1, (lifetime - age) / 900));

    for (const piece of pieces) {
      piece.vy += 0.24 * delta;
      piece.vx *= 1 - 0.012 * delta;
      piece.vy *= 1 - 0.008 * delta;
      piece.wobble += 0.12 * delta;
      piece.x += (piece.vx + Math.sin(piece.wobble) * 1.2) * delta;
      piece.y += piece.vy * delta;
      piece.angle += piece.spin * delta;

      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.fillStyle = piece.colour;
      if (piece.round) {
        context.beginPath();
        context.arc(0, 0, piece.size / 2.4, 0, Math.PI * 2);
        context.fill();
      } else {
        // Squash the height to fake the piece tumbling in 3D.
        context.fillRect(-piece.size / 2, (-piece.size / 4) * Math.cos(piece.wobble), piece.size, (piece.size / 2) * Math.cos(piece.wobble) || 1);
      }
      context.restore();
    }

    if (age < lifetime) {
      requestAnimationFrame(frame);
    } else {
      window.removeEventListener('resize', resize);
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
