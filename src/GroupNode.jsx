import React, { useContext, useMemo } from 'react';
import { Handle, Position, useStore } from '@xyflow/react';
import { GroupActionsContext } from './GroupActionsContext';

const hiddenHandleStyle = { visibility: 'hidden', width: 6, height: 6 };

const LEAF_W = 180;
const LEAF_H = 56;
// The offset curve lies exactly CORNER_RADIUS away from the raw hull — that
// doubles as both the padding between children and curve, and the arc radius
// at every corner. Larger → rounder & more padded; smaller → tighter.
const CORNER_RADIUS = 72;

// Groups use orange as their accent. Expanded hulls render with a barely-there
// tint so children pop; collapsed pills use the standard (full-strength) orange
// to read as a substantial container.
const GROUP_COLOR = '#f97316';              // orange-500
const GROUP_HULL_FILL = 'rgba(249, 115, 22, 0.06)';    // orange-500 @ 6%
const GROUP_HULL_STROKE = 'rgba(249, 115, 22, 0.28)';  // orange-500 @ 28%
const GROUP_HULL_FILL_DIMMED = 'rgba(249, 115, 22, 0.03)';
const GROUP_HULL_STROKE_DIMMED = 'rgba(249, 115, 22, 0.12)';
const GROUP_PILL_BG = '#fff7ed';            // orange-50
const GROUP_PILL_BG_DIMMED = '#fffbf5';     // orange-50 lighter
const GROUP_PILL_BORDER_DIMMED = '#fed7aa'; // orange-200

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
// distance ≥ r from every point of the hull. Outward normal for screen-space
// coords is (dy, -dx) / |edge|.
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

// Plus / minus icons rendered as inline SVG — crisper than unicode glyphs
// and consistent across platforms.
const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="5" y1="10" x2="15" y2="10" />
    <line x1="10" y1="5" x2="10" y2="15" />
  </svg>
);
const CollapseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="5" y1="10" x2="15" y2="10" />
  </svg>
);

const iconButtonStyle = (dimmed) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 6,
  background: '#fff',
  border: `1px solid ${dimmed ? '#e2e8f0' : '#cbd5e1'}`,
  color: dimmed ? '#94a3b8' : '#475569',
  cursor: 'pointer',
  padding: 0,
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  pointerEvents: 'auto',
  flexShrink: 0,
});

// Collapsed-group pill: a substantial card making clear this is a container,
// not a leaf node. Contains a type tag, label, member count, and expand button.
function CollapsedPill({ data, onToggle }) {
  const dimmed = data.dimmed;
  const count = data.memberCount;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 16px',
        borderRadius: 16,
        background: dimmed ? GROUP_PILL_BG_DIMMED : GROUP_PILL_BG,
        border: `2px solid ${dimmed ? GROUP_PILL_BORDER_DIMMED : GROUP_COLOR}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        boxSizing: 'border-box',
        opacity: dimmed ? 0.5 : 1,
        userSelect: 'none',
        transition: 'opacity 0.2s, background 0.2s, border-color 0.2s',
        gap: 6,
      }}
    >
      {/* Handles: React Flow requires source + target handles for edges to
          render. FloatingEdge computes the actual attach points from the node
          rect, so these are hidden visually. */}
      <Handle type="target" position={Position.Top} id="top" style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hiddenHandleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={hiddenHandleStyle} />

      {/* Type + expand button row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: dimmed ? '#fdba74' : GROUP_COLOR,
        }}>
          Group
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onToggle}
          onMouseDown={(e) => e.stopPropagation()}
          title="Expand group"
          aria-label="Expand group"
          style={iconButtonStyle(dimmed)}
        >
          <ExpandIcon />
        </button>
      </div>

      {/* Label */}
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: dimmed ? '#94a3b8' : '#1e293b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}>
        {data.label}
      </div>

      {/* Member count footer */}
      {count > 0 && (
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke={dimmed ? '#cbd5e1' : '#94a3b8'} strokeWidth="2">
            <rect x="2.5" y="3.5" width="15" height="5" rx="1" />
            <rect x="2.5" y="11.5" width="15" height="5" rx="1" />
          </svg>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: dimmed ? '#94a3b8' : '#64748b',
          }}>
            {count} {count === 1 ? 'member' : 'members'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function GroupNode({ id, data }) {
  const { toggleCollapse, collapsedSet } = useContext(GroupActionsContext);
  const collapsed = collapsedSet.has(id);

  const handleToggle = (e) => {
    e.stopPropagation();
    toggleCollapse(id);
  };

  // Subscribe to child positions even when collapsed — we want the hull to be
  // ready immediately when the user expands, without one frame of flicker.
  const childKey = useStore(useMemo(() => makeChildKeySelector(id), [id]));

  const { pathD, labelPos } = useMemo(() => {
    if (collapsed) return { pathD: '', labelPos: null };
    const rects = decodeRects(childKey);
    if (rects.length === 0) return { pathD: '', labelPos: null };
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

    // Place the badge INSIDE the hull polygon (and therefore always inside the
    // offset curve): horizontal center over the hull's bbox, vertical position
    // on the upper-hull edge at that x, with a small inset so it sits just
    // below the top edge rather than above it.
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of hull) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const centerX = (minX + maxX) / 2;

    // Walk hull edges and find the upper-boundary y at x=centerX. For a
    // convex polygon exactly two edges intersect any vertical line; the
    // upper one has the smaller y.
    let topEdgeY = maxY;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      if (a.x === b.x) continue;
      if ((centerX - a.x) * (centerX - b.x) > 0) continue;
      const t = (centerX - a.x) / (b.x - a.x);
      const y = a.y + t * (b.y - a.y);
      if (y < topEdgeY) topEdgeY = y;
    }

    // Badge sits in the padding zone between the hull polygon (children's
    // top edge) and the offset curve's top. Midway through that zone keeps
    // it clearly inside the visible group boundary yet above the topmost
    // child so it never overlaps a member node.
    return {
      pathD: roundedHullPath(hull, CORNER_RADIUS),
      labelPos: { x: centerX, y: topEdgeY - CORNER_RADIUS / 2 },
    };
  }, [childKey, collapsed]);

  const dimmed = data.dimmed;

  if (collapsed) {
    return <CollapsedPill data={data} onToggle={handleToggle} />;
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Handle type="target" position={Position.Top} id="top" style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hiddenHandleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={hiddenHandleStyle} />
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        <path
          d={pathD}
          fill={dimmed ? GROUP_HULL_FILL_DIMMED : GROUP_HULL_FILL}
          stroke={dimmed ? GROUP_HULL_STROKE_DIMMED : GROUP_HULL_STROKE}
          strokeWidth={1.5}
          opacity={dimmed ? 0.5 : 1}
          style={{ transition: 'opacity 0.2s' }}
        />
      </svg>
      {labelPos && (
        <div
          style={{
            position: 'absolute',
            left: labelPos.x,
            top: labelPos.y,
            transform: 'translate(-50%, -50%)',
            background: 'rgba(255,255,255,0.95)',
            padding: '3px 8px 3px 4px',
            borderRadius: 14,
            border: `1px solid ${dimmed ? '#fed7aa' : GROUP_COLOR}`,
            userSelect: 'none',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={handleToggle}
            onMouseDown={(e) => e.stopPropagation()}
            title="Collapse group"
            aria-label="Collapse group"
            style={iconButtonStyle(dimmed)}
          >
            <CollapseIcon />
          </button>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: dimmed ? '#94a3b8' : '#475569',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}>
            {data.label}
          </span>
        </div>
      )}
    </div>
  );
}
