import React from 'react';
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react';

function getNodeRect(node) {
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

export default function FloatingEdge({
  id, source, target, label, style, data, markerEnd,
  labelStyle, labelBgStyle, labelBgPadding,
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const sourceRect = getNodeRect(sourceNode);
  const targetRect = getNodeRect(targetNode);

  const parallel = data?.parallel || { index: 0, total: 1 };

  // A relationship from a concept to itself (Person "parent of" Person): the centre-to-centre
  // geometry below collapses to a point, so draw a loop off a corner instead. Successive self-loops
  // on one node take the next corner clockwise (an inverse pair lands on two corners, so their
  // labels stay apart) and grow once all four corners are taken.
  if (source === target) {
    const { path, labelX, labelY, labelAnchor } = selfLoopPath(sourceRect, parallel.index);
    return (
      <>
        <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
        {label && (
          <EdgeLabelRenderer>
            <div style={labelDivStyle(labelX, labelY, labelStyle, labelBgStyle, labelBgPadding, labelAnchor)}>
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  const offset = getCurveOffset(sourceRect, targetRect, parallel.index, parallel.total);

  // For straight lines (no parallel edges), use direct path
  if (offset === 0) {
    const sp = getIntersection(sourceRect, targetRect.cx, targetRect.cy, 2);
    const tp = getIntersection(targetRect, sourceRect.cx, sourceRect.cy, 6);
    const path = `M ${sp.x} ${sp.y} L ${tp.x} ${tp.y}`;
    const labelX = (sp.x + tp.x) / 2;
    const labelY = (sp.y + tp.y) / 2;

    return (
      <>
        <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
        {label && (
          <EdgeLabelRenderer>
            <div style={labelDivStyle(labelX, labelY, labelStyle, labelBgStyle, labelBgPadding)}>
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
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

  const path = `M ${sp.x} ${sp.y} Q ${ctrlX} ${ctrlY} ${tp.x} ${tp.y}`;

  // Label position: point on the quadratic bezier at t=0.5
  const labelX = 0.25 * sp.x + 0.5 * ctrlX + 0.25 * tp.x;
  const labelY = 0.25 * sp.y + 0.5 * ctrlY + 0.25 * tp.y;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div style={labelDivStyle(labelX, labelY, labelStyle, labelBgStyle, labelBgPadding)}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
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
  const sides = [
    { u: { x: 1, y: 0 }, p: { x: 0, y: 1 }, half: w / 2, round: true,  anchor: 'translate(0, -50%)' },     // right
    { u: { x: 0, y: 1 }, p: { x: -1, y: 0 }, half: h / 2, round: false, anchor: 'translate(-50%, 0)' },    // bottom
    { u: { x: -1, y: 0 }, p: { x: 0, y: -1 }, half: w / 2, round: true,  anchor: 'translate(-100%, -50%)' }, // left
    { u: { x: 0, y: -1 }, p: { x: 1, y: 0 }, half: h / 2, round: false, anchor: 'translate(-50%, -100%)' }, // top
  ];
  const { u, p, half, round, anchor } = sides[index % 4];
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
    labelAnchor: anchor,
  };
}

function labelDivStyle(x, y, labelStyle, labelBgStyle, labelBgPadding, anchor = 'translate(-50%, -50%)') {
  return {
    position: 'absolute',
    transform: `${anchor} translate(${x}px, ${y}px)`,
    pointerEvents: 'none',
    fontSize: labelStyle?.fontSize ?? 10,
    fontWeight: labelStyle?.fontWeight ?? 500,
    color: labelStyle?.fill ?? '#64748b',
    background: labelBgStyle?.fill ?? '#fff',
    opacity: labelBgStyle?.fillOpacity ?? 0.9,
    padding: `${labelBgPadding?.[1] ?? 2}px ${labelBgPadding?.[0] ?? 4}px`,
    borderRadius: 4,
  };
}
