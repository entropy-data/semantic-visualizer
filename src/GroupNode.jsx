import React, { useMemo } from 'react';
import { useStore } from '@xyflow/react';

const LEAF_W = 180;
const LEAF_H = 56;
// The offset curve lies exactly CORNER_RADIUS away from the raw hull — that
// doubles as both the padding between children and curve, and the arc radius
// at every corner. Larger → rounder & more padded; smaller → tighter.
const CORNER_RADIUS = 72;

// Andrew's monotone chain. Returns hull in CCW order.
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const n = pts.length;
  if (n <= 1) return pts.slice();
  const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
  const build = (arr) => {
    const stack = [];
    for (const p of arr) {
      while (stack.length >= 2 && cross(stack[stack.length - 2], stack[stack.length - 1], p) <= 0) stack.pop();
      stack.push(p);
    }
    return stack;
  };
  const lower = build(pts);
  const upper = build(pts.slice().reverse());
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Offset-polygon path: Minkowski sum of the convex hull with a disk of radius r.
// Each hull edge becomes a straight segment parallel to it, offset outward by r;
// each hull vertex becomes a circular arc of radius r connecting the neighboring
// offset segments. Result: smooth convex closed curve with no cusps, always at
// distance ≥ r from every point of the hull. Assumes CCW-order points from
// Andrew's monotone chain (which is clockwise in screen-space Y-down coords —
// outward normal is (dy, -dx) / |edge|).
function roundedHullPath(hull, r) {
  const n = hull.length;
  if (n === 0) return '';
  if (n === 1) {
    const p = hull[0];
    return `M ${(p.x - r).toFixed(2)} ${p.y.toFixed(2)} ` +
      `A ${r} ${r} 0 1 1 ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} ` +
      `A ${r} ${r} 0 1 1 ${(p.x - r).toFixed(2)} ${p.y.toFixed(2)} Z`;
  }
  if (n === 2) {
    const a = hull[0], b = hull[1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len;
    const a1 = { x: a.x + nx * r, y: a.y + ny * r };
    const b1 = { x: b.x + nx * r, y: b.y + ny * r };
    const a2 = { x: a.x - nx * r, y: a.y - ny * r };
    const b2 = { x: b.x - nx * r, y: b.y - ny * r };
    return `M ${a1.x.toFixed(2)} ${a1.y.toFixed(2)} ` +
      `L ${b1.x.toFixed(2)} ${b1.y.toFixed(2)} ` +
      `A ${r} ${r} 0 0 1 ${b2.x.toFixed(2)} ${b2.y.toFixed(2)} ` +
      `L ${a2.x.toFixed(2)} ${a2.y.toFixed(2)} ` +
      `A ${r} ${r} 0 0 1 ${a1.x.toFixed(2)} ${a1.y.toFixed(2)} Z`;
  }

  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    edges.push({ a, b, nx: dy / len, ny: -dx / len });
  }

  let d = '';
  for (let i = 0; i < n; i++) {
    const e = edges[i];
    const next = edges[(i + 1) % n];
    const segStart = { x: e.a.x + e.nx * r, y: e.a.y + e.ny * r };
    const segEnd = { x: e.b.x + e.nx * r, y: e.b.y + e.ny * r };
    const arcEnd = { x: next.a.x + next.nx * r, y: next.a.y + next.ny * r };

    if (i === 0) d += `M ${segStart.x.toFixed(2)} ${segStart.y.toFixed(2)}`;
    d += ` L ${segEnd.x.toFixed(2)} ${segEnd.y.toFixed(2)}`;
    d += ` A ${r} ${r} 0 0 1 ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}`;
  }
  return d + ' Z';
}

// Encode child geometry as a stable string. Using a primitive selector result
// avoids re-render loops from returning a fresh array on every store tick.
const makeChildKeySelector = (id) => (s) => {
  const parts = [];
  s.nodeLookup.forEach((n) => {
    if (n.parentId !== id) return;
    const w = n.measured?.width ?? n.width ?? n.style?.width ?? LEAF_W;
    const h = n.measured?.height ?? n.height ?? n.style?.height ?? LEAF_H;
    parts.push(`${n.position.x.toFixed(1)},${n.position.y.toFixed(1)},${w},${h}`);
  });
  parts.sort();
  return parts.join('|');
};

function decodeRects(key) {
  if (!key) return [];
  return key.split('|').map((chunk) => {
    const [x, y, w, h] = chunk.split(',').map(Number);
    return { x, y, w, h };
  });
}

export default function GroupNode({ id, data }) {
  const childKey = useStore(useMemo(() => makeChildKeySelector(id), [id]));

  const { pathD, labelPos } = useMemo(() => {
    const rects = decodeRects(childKey);
    if (rects.length === 0) return { pathD: '', labelPos: null };
    // Hull is computed from the raw child-bbox corners; the CORNER_RADIUS
    // offset in roundedHullPath provides both padding and rounded corners.
    const corners = [];
    for (const r of rects) {
      corners.push(
        { x: r.x,         y: r.y },
        { x: r.x + r.w,   y: r.y },
        { x: r.x + r.w,   y: r.y + r.h },
        { x: r.x,         y: r.y + r.h },
      );
    }
    const hull = convexHull(corners);

    // Label sits just below the top of the offset curve (= hull_min_y - r).
    let minY = Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of hull) {
      if (p.y < minY) minY = p.y;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }

    return {
      pathD: roundedHullPath(hull, CORNER_RADIUS),
      labelPos: { x: (minX + maxX) / 2, y: minY - CORNER_RADIUS + 15 },
    };
  }, [childKey]);

  const dimmed = data.dimmed;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'all' }}>
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        <path
          d={pathD}
          fill={dimmed ? 'rgba(248, 250, 252, 0.4)' : 'rgba(241, 245, 249, 0.55)'}
          stroke={dimmed ? '#e2e8f0' : '#cbd5e1'}
          strokeWidth={1.5}
          opacity={dimmed ? 0.5 : 1}
          style={{ transition: 'opacity 0.2s' }}
        />
        {labelPos && (
          <text
            x={labelPos.x}
            y={labelPos.y}
            textAnchor="middle"
            style={{
              fontSize: 12,
              fontWeight: 600,
              fill: dimmed ? '#94a3b8' : '#475569',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {data.label}
          </text>
        )}
      </svg>
    </div>
  );
}
