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

function labelDivStyle(x, y, labelStyle, labelBgStyle, labelBgPadding) {
  return {
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
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
