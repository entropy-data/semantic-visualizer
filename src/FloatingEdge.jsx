import React, { useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, ViewportPortal, useInternalNode } from '@xyflow/react';
import { getNodeRect, edgeGeometry } from './edgeGeometry';
import { EdgeLabelContext } from './EdgeLabelContext';

export default function FloatingEdge({
  id, source, target, label, style, data, markerEnd,
  labelStyle, labelBgStyle, labelBgPadding,
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { placements, revealed } = useContext(EdgeLabelContext);

  if (!sourceNode || !targetNode) return null;

  const geo = edgeGeometry(getNodeRect(sourceNode), getNodeRect(targetNode), source, target, data?.parallel);

  // The placement moves a label to free space on its edge (see labelPlacement.js). A label with no
  // free spot is left out until its edge or one of its concepts is hovered or selected, and then
  // drawn above the concepts, since wherever it goes it overlaps something.
  const placement = placements?.get(id);
  const hidden = placement?.hidden === true;
  let labelElement = null;
  if (label && (!hidden || revealed.has(id))) {
    const placed = placement && !hidden;
    const [ax, ay] = placed ? [-0.5, -0.5] : geo.labelAlign;
    const div = (
      <div style={labelDivStyle(
        placed ? placement.x : geo.labelX,
        placed ? placement.y : geo.labelY,
        labelStyle, labelBgStyle, labelBgPadding,
        `translate(${ax * 100}%, ${ay * 100}%)`,
        hidden,
      )}>
        {label}
      </div>
    );
    labelElement = hidden
      ? <ViewportPortal>{div}</ViewportPortal>
      : <EdgeLabelRenderer>{div}</EdgeLabelRenderer>;
  }

  const endLabels = data?.endLabels && geo.ends ? (
    <EdgeLabelRenderer>
      <div style={endLabelStyle(geo.ends.start, labelStyle)}>{data.endLabels[0]}</div>
      <div style={endLabelStyle(geo.ends.end, labelStyle)}>{data.endLabels[1]}</div>
    </EdgeLabelRenderer>
  ) : null;

  return (
    <>
      <BaseEdge id={id} path={geo.path} style={style} markerEnd={markerEnd} />
      {labelElement}
      {endLabels}
    </>
  );
}

// A multiplicity mark sits just off the concept, beside the line rather than on it, so it neither
// covers the arrowhead nor reads as part of the relationship's name. Always on the same side of the
// line as seen from its concept, so both marks of an edge mirror each other.
const END_ALONG = 16;
const END_ASIDE = 8;

function endLabelStyle(end, labelStyle) {
  const x = end.x + end.dx * END_ALONG - end.dy * END_ASIDE;
  const y = end.y + end.dy * END_ALONG + end.dx * END_ASIDE;
  return {
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    pointerEvents: 'none',
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
    color: labelStyle?.fill ?? '#64748b',
    background: 'rgba(255, 255, 255, 0.9)',
    padding: '1px 2px',
    borderRadius: 3,
  };
}

function labelDivStyle(x, y, labelStyle, labelBgStyle, labelBgPadding, anchor, raised) {
  return {
    position: 'absolute',
    transform: `${anchor} translate(${x}px, ${y}px)`,
    pointerEvents: 'none',
    fontSize: labelStyle?.fontSize ?? 10,
    fontWeight: labelStyle?.fontWeight ?? 500,
    color: labelStyle?.fill ?? '#64748b',
    background: labelBgStyle?.fill ?? '#fff',
    // A revealed label sits on top of whatever it overlaps, so it is drawn opaque and lifted.
    opacity: raised ? 1 : (labelBgStyle?.fillOpacity ?? 0.9),
    boxShadow: raised ? '0 1px 3px rgba(15, 23, 42, 0.2)' : undefined,
    padding: `${labelBgPadding?.[1] ?? 2}px ${labelBgPadding?.[0] ?? 4}px`,
    borderRadius: 4,
  };
}
