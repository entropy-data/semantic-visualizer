import { getNodeRect, edgeGeometry } from './edgeGeometry';

// Label placement: each relationship label goes to the first spot on its own edge that clears every
// concept and every label placed before it. The middle comes first, then spots stepping out towards
// either end, then the same spots just beside the line. The last fifth at each end is left alone,
// where a label would read as belonging to the concept rather than to the relationship.
const STOPS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
const SIDES = [0, 1, -1];
const NODE_MARGIN = 3;
const LABEL_MARGIN = 2;
const CELL = 128;

const overlaps = (a, b, m) =>
  a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

// Boxes bucketed on a coarse grid, so a query only looks at its neighbours rather than at every box.
class BoxGrid {
  constructor() {
    this.cells = new Map();
  }

  forCells(box, margin, fn) {
    const x0 = Math.floor((box.x - margin) / CELL);
    const x1 = Math.floor((box.x + box.w + margin) / CELL);
    const y0 = Math.floor((box.y - margin) / CELL);
    const y1 = Math.floor((box.y + box.h + margin) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        if (fn(`${gx},${gy}`)) return true;
      }
    }
    return false;
  }

  insert(box) {
    this.forCells(box, 0, (key) => {
      const cell = this.cells.get(key);
      if (cell) cell.push(box);
      else this.cells.set(key, [box]);
      return false;
    });
  }

  hits(box, margin) {
    return this.forCells(box, margin, (key) => (this.cells.get(key) || []).some((b) => overlaps(box, b, margin)));
  }
}

/**
 * Measures a label chip the way FloatingEdge draws it: the text in the canvas's own font, plus the
 * chip's padding. The font family is the one the labels inherit from the host page.
 */
export function makeLabelMeasurer(fontFamily) {
  const ctx = document.createElement('canvas').getContext('2d');
  const widths = new Map();
  return (text, fontSize, fontWeight, padX, padY) => {
    const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const key = `${font}|${text}`;
    let width = widths.get(key);
    if (width === undefined) {
      ctx.font = font;
      width = ctx.measureText(text).width;
      widths.set(key, width);
    }
    return { w: Math.ceil(width) + 2 * padX, h: Math.ceil(fontSize * 1.25) + 2 * padY };
  };
}

/**
 * Picks a spot for every edge label. Returns a map from edge id to `{ x, y, hidden }` (the label's
 * centre), or null while nodes are still unmeasured, in which case labels stay where FloatingEdge
 * puts them by default. A label with no free spot is `hidden` at its default point, to be shown on
 * hover or selection.
 *
 * Changed relationships choose first, since the diff is what a reviewer reads, and dimmed ones last.
 * Within that, the edge with the fewest free spots chooses first, so a crowded edge is not left
 * without a spot because a roomier one took it.
 */
export function placeEdgeLabels(edges, nodeLookup, measure) {
  const concepts = new BoxGrid();
  for (const node of nodeLookup.values()) {
    // A group is drawn as a hull around its members; a label inside it covers nothing.
    if (node.type === 'group' || node.hidden) continue;
    if (!node.measured?.width) return null;
    const r = getNodeRect(node);
    concepts.insert({ x: r.x, y: r.y, w: r.w, h: r.h });
  }

  const labels = new BoxGrid();
  const items = [];
  edges.forEach((edge, index) => {
    if (!edge.label || edge.hidden) return;
    const sourceNode = nodeLookup.get(edge.source);
    const targetNode = nodeLookup.get(edge.target);
    if (!sourceNode || !targetNode) return;

    const size = measure(
      String(edge.label),
      edge.labelStyle?.fontSize ?? 10,
      edge.labelStyle?.fontWeight ?? 500,
      edge.labelBgPadding?.[0] ?? 4,
      edge.labelBgPadding?.[1] ?? 2,
    );
    const geo = edgeGeometry(getNodeRect(sourceNode), getNodeRect(targetNode), edge.source, edge.target, edge.data?.parallel);

    // A self-loop's label already sits outside its loop; it only has to be kept clear of.
    if (!geo.pointAt) {
      const [ax, ay] = geo.labelAlign;
      labels.insert({ x: geo.labelX + ax * size.w, y: geo.labelY + ay * size.h, w: size.w, h: size.h });
      return;
    }

    const candidates = [];
    for (const side of SIDES) {
      for (const t of STOPS) {
        const p = geo.pointAt(t);
        // Stepping aside by the chip's own extent across the line puts it beside the line, not on it.
        const off = side * (Math.abs(p.nx) * size.w / 2 + Math.abs(p.ny) * size.h / 2 + 3);
        const cx = p.x + p.nx * off;
        const cy = p.y + p.ny * off;
        const box = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h, cx, cy };
        if (!concepts.hits(box, NODE_MARGIN)) candidates.push(box);
      }
    }
    items.push({
      id: edge.id,
      index,
      rank: edge.data?.dimmed ? 2 : (edge.data?.diff ? 0 : 1),
      candidates,
      fallback: { x: geo.labelX, y: geo.labelY },
    });
  });

  items.sort((a, b) => a.rank - b.rank || a.candidates.length - b.candidates.length || a.index - b.index);

  const placements = new Map();
  items.forEach((item) => {
    const box = item.candidates.find((c) => !labels.hits(c, LABEL_MARGIN));
    if (box) {
      labels.insert(box);
      placements.set(item.id, { x: box.cx, y: box.cy, hidden: false });
    } else {
      placements.set(item.id, { ...item.fallback, hidden: true });
    }
  });
  return placements;
}
