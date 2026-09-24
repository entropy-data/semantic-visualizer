// Where an edge runs. FloatingEdge draws from this, and the label placement reads it to know where on
// the drawn line a label can go, so the two never disagree about an edge's path.

export function getNodeRect(node) {
  const w = node.measured?.width ?? node.width ?? 150;
  const h = node.measured?.height ?? node.height ?? 40;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    w,
    h,
    cx: node.internals.positionAbsolute.x + w / 2,
    cy: node.internals.positionAbsolute.y + h / 2,
  };
}

function getIntersection(rect, targetX, targetY, padding) {
  const { cx, cy, w, h } = rect;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = w / 2 + padding;
  const halfH = h / 2 + padding;

  const scaleX = Math.abs(dx) < 0.001 ? Infinity : halfW / Math.abs(dx);
  const scaleY = Math.abs(dy) < 0.001 ? Infinity : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}

// Compute a control point offset perpendicular to the line between two points
function getCurveOffset(sourceRect, targetRect, index, total) {
  if (total <= 1) return 0;
  // Scale offset relative to distance between nodes (min 60px, max 30% of distance)
  const dx = targetRect.cx - sourceRect.cx;
  const dy = targetRect.cy - sourceRect.cy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const spacing = Math.max(60, Math.min(dist * 0.3, 120));
  const centered = index - (total - 1) / 2;
  return centered * spacing;
}

/**
 * An edge's path and default label point. `pointAt(t)` gives the point a fraction t along the drawn
 * path with the unit normal there, for trying other label spots; a self-loop has none, since its
 * label already sits clear of the loop, and `labelAlign` says which side of its point the label hangs.
 */
export function edgeGeometry(sourceRect, targetRect, source, target, parallel = { index: 0, total: 1 }) {
  // A relationship from a concept to itself (Person "parent of" Person): the centre-to-centre
  // geometry below collapses to a point, so draw a loop off a corner instead. Successive self-loops
  // on one node take the next corner clockwise (an inverse pair lands on two corners, so their
  // labels stay apart) and grow once all four corners are taken.
  if (source === target) {
    return { ...selfLoopPath(sourceRect, parallel.index), pointAt: null };
  }

  const offset = getCurveOffset(sourceRect, targetRect, parallel.index, parallel.total);

  // For straight lines (no parallel edges), use direct path
  if (offset === 0) {
    const sp = getIntersection(sourceRect, targetRect.cx, targetRect.cy, 2);
    const tp = getIntersection(targetRect, sourceRect.cx, sourceRect.cy, 6);
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      path: `M ${sp.x} ${sp.y} L ${tp.x} ${tp.y}`,
      labelX: (sp.x + tp.x) / 2,
      labelY: (sp.y + tp.y) / 2,
      labelAlign: [-0.5, -0.5],
      pointAt: (t) => ({ x: sp.x + dx * t, y: sp.y + dy * t, nx: -dy / len, ny: dx / len }),
    };
  }

  // Curved path: compute a control point offset perpendicular to the center line
  const midX = (sourceRect.cx + targetRect.cx) / 2;
  const midY = (sourceRect.cy + targetRect.cy) / 2;

  // Perpendicular direction — use consistent direction regardless of edge direction
  // Always compute from the node with the smaller ID to avoid flipped perpendiculars
  const flip = source > target;
  const dx = flip ? (sourceRect.cx - targetRect.cx) : (targetRect.cx - sourceRect.cx);
  const dy = flip ? (sourceRect.cy - targetRect.cy) : (targetRect.cy - sourceRect.cy);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;

  const ctrlX = midX + perpX * offset;
  const ctrlY = midY + perpY * offset;

  // Intersect from source center toward the control point direction (approximate)
  const sp = getIntersection(sourceRect, ctrlX, ctrlY, 2);
  const tp = getIntersection(targetRect, ctrlX, ctrlY, 6);

  // A point on the quadratic bezier, and its tangent for the normal
  const pointAt = (t) => {
    const u = 1 - t;
    const tx = 2 * u * (ctrlX - sp.x) + 2 * t * (tp.x - ctrlX);
    const ty = 2 * u * (ctrlY - sp.y) + 2 * t * (tp.y - ctrlY);
    const tl = Math.hypot(tx, ty) || 1;
    return {
      x: u * u * sp.x + 2 * u * t * ctrlX + t * t * tp.x,
      y: u * u * sp.y + 2 * u * t * ctrlY + t * t * tp.y,
      nx: -ty / tl,
      ny: tx / tl,
    };
  };
  const mid = pointAt(0.5);

  return {
    path: `M ${sp.x} ${sp.y} Q ${ctrlX} ${ctrlY} ${tp.x} ${tp.y}`,
    labelX: mid.x,
    labelY: mid.y,
    labelAlign: [-0.5, -0.5],
    pointAt,
  };
}

// A teardrop loop that leaves one side of the node and arrives back on the same side a little
// further along, with the arrowhead pointing into the node. Anchors sit on the node's actual
// outline: entity pills are fully rounded, so a point off the side's centre line lies inset from
// the bounding box by the circle's sagitta; on a square-cornered card that inset is negligible.
// Successive self-loops take the next side clockwise (right, bottom, left, top), and grow once all
// four sides are taken, so an inverse pair never shares a side.
function selfLoopPath(rect, index) {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  const d = Math.min(10, r * 0.5);              // half the distance between the two anchors
  const size = 44 + Math.floor(index / 4) * 18; // how far the loop reaches out
  // `align` is the label's offset from its point, as fractions of its own width and height.
  const sides = [
    { u: { x: 1, y: 0 }, p: { x: 0, y: 1 }, half: w / 2, round: true,  align: [0, -0.5] },    // right
    { u: { x: 0, y: 1 }, p: { x: -1, y: 0 }, half: h / 2, round: false, align: [-0.5, 0] },   // bottom
    { u: { x: -1, y: 0 }, p: { x: 0, y: -1 }, half: w / 2, round: true,  align: [-1, -0.5] }, // left
    { u: { x: 0, y: -1 }, p: { x: 1, y: 0 }, half: h / 2, round: false, align: [-0.5, -1] },  // top
  ];
  const { u, p, half, round, align } = sides[index % 4];
  // The outline's inset from the bounding box at perpendicular offset t: a rounded side is a
  // circle of radius r, a flat side is straight.
  const inset = (t) => (round ? r - Math.sqrt(Math.max(0, r * r - t * t)) : 0);
  const onSide = (t) => ({
    x: cx + u.x * (half - inset(t)) + p.x * t,
    y: cy + u.y * (half - inset(t)) + p.y * t,
  });
  const sp = onSide(-d);
  const tpOn = onSide(d);
  const tp = { x: tpOn.x + u.x * 6, y: tpOn.y + u.y * 6 }; // room for the arrowhead
  const p1 = { x: sp.x + u.x * size - p.x * size * 0.9, y: sp.y + u.y * size - p.y * size * 0.9 };
  const p2 = { x: tp.x + u.x * size + p.x * size * 0.9, y: tp.y + u.y * size + p.y * size * 0.9 };
  // The loop's outer apex is the bezier point at t=0.5; the label sits just beyond it, anchored
  // on the side facing the node so it never covers the loop.
  const apexX = (sp.x + 3 * p1.x + 3 * p2.x + tp.x) / 8;
  const apexY = (sp.y + 3 * p1.y + 3 * p2.y + tp.y) / 8;
  return {
    path: `M ${sp.x} ${sp.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${tp.x} ${tp.y}`,
    labelX: apexX + u.x * 4,
    labelY: apexY + u.y * 4,
    labelAlign: align,
  };
}
