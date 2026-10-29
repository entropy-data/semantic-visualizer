// Where every concept goes. Kept out of App so it can be run and measured on its own: it takes React
// Flow nodes and edges and reads only ids, types, labels, properties and the relationship type.
//
// The force layout is deterministic: the same graph always comes out the same, so "Auto layout" puts
// back the one arrangement rather than rolling a new one each click. The steps, per connected part:
//   1. start from a spectral layout, which already keeps neighbours together and few lines crossing;
//   2. run d3-force with collision on each concept's actual box rather than a circle, and a force
//      keeping concepts off relationship lines they are not part of;
//   3. swap concepts pairwise wherever that removes crossings, then let the forces settle again;
//   4. remove any overlap left, and pack the parts into a block close to the canvas's shape.
// Every relationship type is laid out alike.
import { forceSimulation, forceLink, forceManyBody, forceX, forceY } from 'd3-force';

// Group container sizing constants. GROUP_PADDING must be ≥ the visualizer's
// CORNER_RADIUS (see GroupNode.jsx) so the offset hull stays inside the
// group's bounding box and neighbor hulls don't overlap.
const GROUP_PADDING = 78;
const GROUP_LABEL_HEIGHT = 28;
// Collapsed groups render as a pill of this size — see CollapsedPill in GroupNode.
// Intentionally larger than leaf nodes so a collapsed group reads as a substantial
// container, not a simple element.
const COLLAPSED_PILL_WIDTH = 320;
const COLLAPSED_PILL_HEIGHT = 110;

// ERD-mode entity nodes embed properties inline. Sizing here must roughly match
// EntityNode's rendered box so groups don't clip or overlap their children.
const ERD_ENTITY_WIDTH = 240;
const ERD_HEADER_HEIGHT = 40; // accent bar + header
const ERD_ROW_HEIGHT = 27;
const ERD_MAX_VISIBLE_PROPS = 8;

const PILL_HEIGHT = 38;

// The layout runs before anything is drawn, so a concept's size is estimated from its text. Erring
// wide costs a little space; erring narrow puts concepts on top of each other.
export function estimateLeafSize(node, entityMode) {
  const label = String(node.data?.label ?? '');
  if (entityMode && (node.type === 'entity' || node.type === 'metric')) {
    const properties = node.data?.properties || [];
    const rows = properties.length === 0 ? 1 : Math.min(properties.length, ERD_MAX_VISIBLE_PROPS);
    const widest = properties.slice(0, ERD_MAX_VISIBLE_PROPS)
      .reduce((max, p) => Math.max(max, String(p.name ?? '').length + String(p.type ?? '').length), 0);
    return {
      width: Math.round(Math.max(ERD_ENTITY_WIDTH, 70 + label.length * 8, 80 + widest * 7)),
      height: ERD_HEADER_HEIGHT + rows * ERD_ROW_HEIGHT,
    };
  }
  // KnowledgeNode's pill: padding, border, icon and gap, then the name in 13px semibold, then
  // whatever badges follow the name.
  let width = 54 + label.length * 7.6;
  if (node.data?.foreignNamespace) width += 22 + String(node.data.foreignNamespace).length * 6.5;
  if (node.data?.diff || node.data?.changedPropertyCount > 0) width += 56;
  if (node.data?.consumers?.total > 0) width += 36;
  if (node.data?.unresolved) width += 56;
  return { width: Math.round(width), height: PILL_HEIGHT };
}

// LCG random source for d3-force, which otherwise calls Math.random to separate coinciding nodes
// and would make the same graph come out differently each time.
function seededRandom(seed) {
  let s = (((seed | 0) * 1664525 + 1013904223) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// --- Forces -------------------------------------------------------------------------------------

// Collision on each node's box. d3's forceCollide only knows circles, and a circle around a long
// pill either leaves a wide empty ring or lets the next pill sit on its name. Pairs are found by
// sweeping along x, so this stays close to linear.
function forceRectCollide(padding) {
  let nodes = [];
  function force() {
    const items = nodes.map((n) => ({ n, left: n.x + n.vx - n.hw }));
    items.sort((a, b) => a.left - b.left);
    for (let i = 0; i < items.length; i++) {
      const a = items[i].n;
      const right = a.x + a.vx + a.hw + padding;
      for (let j = i + 1; j < items.length && items[j].left < right; j++) {
        const b = items[j].n;
        const dx = (b.x + b.vx) - (a.x + a.vx);
        const dy = (b.y + b.vy) - (a.y + a.vy);
        const ox = a.hw + b.hw + padding - Math.abs(dx);
        const oy = a.hh + b.hh + padding - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // Out along whichever axis is the shorter way out.
        if (ox < oy) {
          const push = (dx < 0 ? -1 : 1) * ox * 0.5;
          a.vx -= push;
          b.vx += push;
        } else {
          const push = (dy < 0 ? -1 : 1) * oy * 0.5;
          a.vy -= push;
          b.vy += push;
        }
      }
    }
  }
  force.initialize = (n) => { nodes = n; };
  return force;
}

// Keeps concepts off relationship lines they take no part in: a line running under a concept reads
// as if the concept were one of its ends. The concept moves off the line, the line's ends a little
// the other way. Concepts are bucketed on a grid and each line only looks at the buckets it runs
// through, and it acts on every third tick only, three times as hard, which keeps it affordable on
// large graphs.
const CLEARANCE_CELL = 128;
const CLEARANCE_EVERY = 3;

function forceEdgeClearance(links, margin) {
  let byId = new Map();
  let nodes = [];
  let tick = 0;
  function force(alpha) {
    if (tick++ % CLEARANCE_EVERY !== 0) return;
    const grid = new Map();
    nodes.forEach((n) => {
      const x0 = Math.floor((n.x - n.hw - margin) / CLEARANCE_CELL);
      const x1 = Math.floor((n.x + n.hw + margin) / CLEARANCE_CELL);
      const y0 = Math.floor((n.y - n.hh - margin) / CLEARANCE_CELL);
      const y1 = Math.floor((n.y + n.hh + margin) / CLEARANCE_CELL);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const key = gx * 65536 + gy;
          if (grid.has(key)) grid.get(key).push(n);
          else grid.set(key, [n]);
        }
      }
    });
    links.forEach((l) => {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      const ex = t.x - s.x;
      const ey = t.y - s.y;
      const len2 = ex * ex + ey * ey;
      if (len2 < 1) return;
      const len = Math.sqrt(len2);
      const nx = -ey / len;
      const ny = ex / len;
      const seen = new Set([s, t]);
      const steps = Math.ceil(len / (CLEARANCE_CELL / 2));
      for (let k = 0; k <= steps; k++) {
        const key = Math.floor((s.x + ex * k / steps) / CLEARANCE_CELL) * 65536
          + Math.floor((s.y + ey * k / steps) / CLEARANCE_CELL);
        (grid.get(key) || []).forEach((n) => {
          if (seen.has(n)) return;
          seen.add(n);
          const u = ((n.x - s.x) * ex + (n.y - s.y) * ey) / len2;
          if (u <= 0.02 || u >= 0.98) return;
          const dist = (n.x - s.x) * nx + (n.y - s.y) * ny;
          const needed = Math.abs(nx) * (n.hw + margin) + Math.abs(ny) * (n.hh + margin);
          if (Math.abs(dist) >= needed) return;
          const push = (needed - Math.abs(dist)) * (dist < 0 ? -1 : 1) * alpha * 1.5 * CLEARANCE_EVERY;
          n.vx += nx * push;
          n.vy += ny * push;
          s.vx -= nx * push * (1 - u) * 0.3;
          s.vy -= ny * push * (1 - u) * 0.3;
          t.vx -= nx * push * u * 0.3;
          t.vy -= ny * push * u * 0.3;
        });
      }
    });
  }
  force.initialize = (n) => { nodes = n; byId = new Map(n.map((node) => [node.id, node])); };
  return force;
}

// --- Placement steps ----------------------------------------------------------------------------

// Spectral starting positions (Koren, "Drawing graphs by eigenvectors"): the two smoothest
// eigenvectors of the graph's random walk put neighbours close and spread the rest, which a force
// simulation then only has to refine. Starting from a circle instead leaves it untangling, which it
// rarely finishes, and gives a different tangle for every starting order.
function spectralCoordinates(ids, links) {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const neighbours = ids.map(() => []);
  links.forEach((l) => {
    neighbours[index.get(l.source)].push(index.get(l.target));
    neighbours[index.get(l.target)].push(index.get(l.source));
  });
  const degree = neighbours.map((list) => Math.max(list.length, 1));
  const random = seededRandom(n);
  const found = [new Float64Array(n).fill(1)];
  for (let k = 0; k < 2; k++) {
    let u = Float64Array.from({ length: n }, () => random() - 0.5);
    for (let iteration = 0; iteration < 400; iteration++) {
      found.forEach((v) => {
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i++) {
          num += u[i] * degree[i] * v[i];
          den += v[i] * degree[i] * v[i];
        }
        const c = num / den;
        for (let i = 0; i < n; i++) u[i] -= c * v[i];
      });
      const next = new Float64Array(n);
      let norm = 0;
      for (let i = 0; i < n; i++) {
        let sum = 0;
        neighbours[i].forEach((j) => { sum += u[j]; });
        next[i] = 0.5 * (u[i] + sum / degree[i]);
        norm += next[i] * next[i];
      }
      norm = Math.sqrt(norm) || 1;
      let dot = 0;
      for (let i = 0; i < n; i++) {
        next[i] /= norm;
        dot += next[i] * u[i];
      }
      u = next;
      if (dot > 1 - 1e-10) break;
    }
    found.push(u);
  }
  return [found[1], found[2]];
}

function segmentsCross(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = orient(a, b, c);
  const d2 = orient(a, b, d);
  const d3 = orient(c, d, a);
  const d4 = orient(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Force layouts settle in a local minimum, often with two concepts each on the wrong side of the
// other. Trying pairs in swapped places, and keeping a swap whenever fewer lines cross, undoes most
// of those. A swap that buys its fewer crossings with much longer lines is not kept: a line around
// the whole drawing crosses little and reads worse than the crossing it avoids. `canSwap` says which
// pairs to try, `fits` whether the swapped places are still free.
// The work is capped by a count of line pairs compared rather than by time, so a large graph stops
// early but always at the same point, and comes out the same every time.
const CROSSING_BUDGET = 4000000;

function reduceCrossings(simNodes, links, canSwap, fits = () => true) {
  if (simNodes.length < 4) return;
  let work = 0;
  const incident = new Map(simNodes.map((n) => [n.id, []]));
  links.forEach((l, i) => {
    incident.get(l.source).push(i);
    incident.get(l.target).push(i);
  });
  const byId = new Map(simNodes.map((n) => [n.id, n]));
  // Each link's bounding box, so pairs that cannot cross are skipped without the full test.
  const bounds = (i) => {
    const s = byId.get(links[i].source);
    const t = byId.get(links[i].target);
    return { minX: Math.min(s.x, t.x), maxX: Math.max(s.x, t.x), minY: Math.min(s.y, t.y), maxY: Math.max(s.y, t.y) };
  };
  const boxes = links.map((_, i) => bounds(i));
  const rebox = (linkIds) => linkIds.forEach((i) => { boxes[i] = bounds(i); });
  const lengthOf = (linkIds) => linkIds.reduce((sum, i) => {
    const s = byId.get(links[i].source);
    const t = byId.get(links[i].target);
    return sum + Math.hypot(s.x - t.x, s.y - t.y);
  }, 0);
  const crossingsAt = (linkIds) => {
    let count = 0;
    work += linkIds.length * links.length;
    linkIds.forEach((i) => {
      const link = links[i];
      const mine = boxes[i];
      for (let j = 0; j < links.length; j++) {
        if (i === j) continue;
        const other = links[j];
        if (other.source === link.source || other.source === link.target
          || other.target === link.source || other.target === link.target) continue;
        const theirs = boxes[j];
        if (mine.maxX < theirs.minX || theirs.maxX < mine.minX || mine.maxY < theirs.minY || theirs.maxY < mine.minY) continue;
        if (segmentsCross(byId.get(link.source), byId.get(link.target), byId.get(other.source), byId.get(other.target))) count++;
      }
    });
    return count;
  };
  const candidates = [];
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      if (canSwap(simNodes[i], simNodes[j])) candidates.push([simNodes[i], simNodes[j]]);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    candidates.forEach(([a, b]) => {
      if (work > CROSSING_BUDGET) return;
      const touched = [...new Set([...incident.get(a.id), ...incident.get(b.id)])];
      if (touched.length === 0) return;
      const before = crossingsAt(touched);
      if (before === 0) return;
      const lengthBefore = lengthOf(touched);
      [a.x, b.x, a.y, b.y] = [b.x, a.x, b.y, a.y];
      rebox(touched);
      if (crossingsAt(touched) < before && lengthOf(touched) <= lengthBefore * 1.2 && fits(a, b)) {
        improved = true;
      } else {
        [a.x, b.x, a.y, b.y] = [b.x, a.x, b.y, a.y];
        rebox(touched);
      }
    });
    if (!improved) break;
  }
}

// Whatever overlap the simulation leaves (it trades overlap off against the other forces) is taken
// out at the end by moving each pair apart the shorter way.
function removeOverlaps(simNodes, padding) {
  for (let round = 0; round < 200; round++) {
    let moved = false;
    const sorted = simNodes.slice().sort((a, b) => (a.x - a.hw) - (b.x - b.hw));
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (b.x - b.hw >= a.x + a.hw + padding) break;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = a.hw + b.hw + padding - Math.abs(dx);
        const oy = a.hh + b.hh + padding - Math.abs(dy);
        if (ox <= 0.5 || oy <= 0.5) continue;
        moved = true;
        if (ox < oy) {
          const push = (dx < 0 ? -1 : 1) * (ox / 2 + 0.5);
          a.x -= push;
          b.x += push;
        } else {
          const push = (dy < 0 ? -1 : 1) * (oy / 2 + 0.5);
          a.y -= push;
          b.y += push;
        }
      }
    }
    if (!moved) break;
  }
}

// Lays out one connected part. Returns centre positions.
function layoutComponent(ids, links, sizeOf, entityMode) {
  if (ids.length === 1) return { [ids[0]]: { x: 0, y: 0 } };

  const n = ids.length;
  const large = n > 50;
  const padding = entityMode ? 40 : 24;
  const baseLength = entityMode ? 160 : 140;
  // forceLink hands this its own copy of the link, with the ends resolved to nodes.
  const idOf = (end) => (typeof end === 'object' ? end.id : end);
  const linkLength = (l) => baseLength + (sizeOf(idOf(l.source)).width + sizeOf(idOf(l.target)).width) / 4;

  // d3's default strength, 1 / the smaller end's link count, with links counted by weight.
  const weighted = new Map(ids.map((id) => [id, 0]));
  links.forEach((l) => {
    weighted.set(l.source, weighted.get(l.source) + l.weight);
    weighted.set(l.target, weighted.get(l.target) + l.weight);
  });
  const linkStrength = (l) => Math.min(1, l.weight
    / Math.min(weighted.get(idOf(l.source)), weighted.get(idOf(l.target))));

  // Spectral start, scaled to roughly the size the forces will settle at.
  const [sx, sy] = spectralCoordinates(ids, links);
  const meanLength = links.reduce((sum, l) => sum + linkLength(l), 0) / (links.length || 1);
  const spread = Math.sqrt(n) * meanLength * 0.7;
  const scale = (v) => {
    let min = Infinity;
    let max = -Infinity;
    v.forEach((x) => { min = Math.min(min, x); max = Math.max(max, x); });
    const range = max - min || 1;
    return (x) => ((x - min) / range - 0.5) * spread;
  };
  const toX = scale(sx);
  const toY = scale(sy);
  const simNodes = ids.map((id, i) => ({
    id,
    hw: sizeOf(id).width / 2,
    hh: sizeOf(id).height / 2,
    // A golden-angle nudge keeps concepts the spectral layout puts on the same spot apart.
    x: toX(sx[i]) + Math.cos(i * 2.39996) * 4,
    y: toY(sy[i]) + Math.sin(i * 2.39996) * 4,
  }));

  const charge = forceManyBody().strength(entityMode ? -2000 : (large ? -1600 : -1200)).distanceMax(entityMode ? 2400 : 1600);
  if (large) charge.theta(1.2);
  const gravity = large ? 0.03 : 0.02;
  const simulation = forceSimulation(simNodes)
    .randomSource(seededRandom(n))
    .force('link', forceLink(links.map((l) => ({ ...l }))).id((d) => d.id).distance(linkLength).strength(linkStrength))
    .force('charge', charge)
    .force('x', forceX(0).strength(gravity))
    .force('y', forceY(0).strength(gravity))
    .force('collide', forceRectCollide(padding))
    .stop();

  const ticks = large ? 250 : 300;
  for (let i = 0; i < ticks; i++) {
    // Clearance only once the layout has its rough shape: early on, lines sweep across everything.
    if (i === Math.floor(ticks * 0.4)) simulation.force('clearance', forceEdgeClearance(links, padding));
    simulation.tick();
  }

  // Only nearby pairs: swapping across the drawing would trade crossings for long lines.
  const reach = 2.5 * meanLength;
  reduceCrossings(simNodes, links, (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= reach);
  simulation.alpha(0.08);
  for (let i = 0; i < 80; i++) simulation.tick();
  removeOverlaps(simNodes, padding / 2);

  const posById = {};
  simNodes.forEach((sn, i) => {
    posById[sn.id] = { x: isFinite(sn.x) ? sn.x : i * 100, y: isFinite(sn.y) ? sn.y : i * 100 };
  });
  return posById;
}

// Packs the parts into rows, largest first, wrapping at a width that gives the whole block roughly
// the canvas's shape. The parts used to go in columns beside the largest, which put a strip of
// lone concepts far to its right and made fit-to-view shrink everything to make room for them.
function packComponents(parts, gap) {
  const area = parts.reduce((sum, p) => sum + (p.width + gap) * (p.height + gap), 0);
  const rowWidth = Math.max(parts[0].width, Math.sqrt(area * 1.6));
  const offsets = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  parts.forEach((p) => {
    if (x > 0 && x + p.width > rowWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    offsets.push({ x, y });
    x += p.width + gap;
    rowHeight = Math.max(rowHeight, p.height);
  });
  return offsets;
}

// Lays out a flat set of nodes and returns each one's centre, with the whole drawing's top-left
// corner at (0, 0).
function layoutCenters(nodes, edges, sizes, entityMode) {
  const sizeOf = (id) => sizes[id];
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // One link per pair of concepts, weighted by how many relationships it stands for: two groups
  // joined by ten relationships belong closer together than two joined by one.
  const byPair = new Map();
  edges.forEach((e) => {
    if (e.source === e.target || !idSet.has(e.source) || !idSet.has(e.target)) return;
    const key = e.source < e.target ? `${e.source}::${e.target}` : `${e.target}::${e.source}`;
    const known = byPair.get(key);
    if (known) known.weight += 1;
    else byPair.set(key, { source: e.source, target: e.target, weight: 1 });
  });
  const links = [...byPair.values()];

  const adjacent = new Map(ids.map((id) => [id, []]));
  links.forEach((l) => {
    adjacent.get(l.source).push(l.target);
    adjacent.get(l.target).push(l.source);
  });
  const visited = new Set();
  const components = [];
  ids.forEach((start) => {
    if (visited.has(start)) return;
    const component = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const id = stack.pop();
      component.push(id);
      adjacent.get(id).forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      });
    }
    components.push(component);
  });

  const parts = components.map((componentIds) => {
    const member = new Set(componentIds);
    const pos = layoutComponent(componentIds, links.filter((l) => member.has(l.source)), sizeOf, entityMode);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    componentIds.forEach((id) => {
      const { width, height } = sizes[id];
      minX = Math.min(minX, pos[id].x - width / 2);
      minY = Math.min(minY, pos[id].y - height / 2);
      maxX = Math.max(maxX, pos[id].x + width / 2);
      maxY = Math.max(maxY, pos[id].y + height / 2);
    });
    componentIds.forEach((id) => {
      pos[id].x -= minX;
      pos[id].y -= minY;
    });
    return { ids: componentIds, pos, width: maxX - minX, height: maxY - minY };
  });
  parts.sort((a, b) => b.ids.length - a.ids.length || b.width * b.height - a.width * a.height);

  const offsets = packComponents(parts, entityMode ? 100 : 60);
  const posById = {};
  parts.forEach((part, i) => {
    part.ids.forEach((id) => {
      posById[id] = { x: offsets[i].x + part.pos[id].x, y: offsets[i].y + part.pos[id].y };
    });
  });
  return posById;
}

export function layoutElements(nodes, edges, { entityMode = false } = {}) {
  const sizes = {};
  nodes.forEach((n) => { sizes[n.id] = estimateLeafSize(n, entityMode); });
  const centers = layoutCenters(nodes, edges, sizes, entityMode);
  // React Flow positions a node by its top-left corner.
  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: {
      x: centers[node.id].x - sizes[node.id].width / 2,
      y: centers[node.id].y - sizes[node.id].height / 2,
    },
  }));
  return { nodes: layoutedNodes, edges };
}

// Each group's members are placed before anything outside the group is, so lines coming in from
// outside cross inside it wherever they happen to land. With everything placed, members of one group
// swap places wherever fewer lines then cross, as long as both still fit where the other was.
const UNTANGLE_REACH = 600;

function untangleGroupMembers(nodes, edges, positions, boxSizes, parentOf) {
  const absolute = (id) => {
    const parent = parentOf(id);
    const own = positions[id];
    if (!parent) return { x: own.x, y: own.y };
    const p = absolute(parent);
    return { x: p.x + own.x, y: p.y + own.y };
  };
  const leaves = nodes.filter((n) => n.type !== 'group' && positions[n.id] && boxSizes[n.id]);
  const leafIds = new Set(leaves.map((n) => n.id));
  const byPair = new Map();
  edges.forEach((e) => {
    if (e.source === e.target || !leafIds.has(e.source) || !leafIds.has(e.target)) return;
    const key = e.source < e.target ? `${e.source}::${e.target}` : `${e.target}::${e.source}`;
    if (!byPair.has(key)) byPair.set(key, { source: e.source, target: e.target });
  });
  const links = [...byPair.values()];
  // Centres, in the canvas's coordinates, since lines run between groups.
  const simNodes = leaves.map((n) => {
    const at = absolute(n.id);
    const { width, height } = boxSizes[n.id];
    return { id: n.id, hw: width / 2, hh: height / 2, x: at.x + width / 2, y: at.y + height / 2 };
  });
  const parentOfLeaf = new Map(leaves.map((n) => [n.id, parentOf(n.id)]));
  const siblingsOf = new Map();
  nodes.forEach((n) => {
    const key = parentOf(n.id);
    if (!siblingsOf.has(key)) siblingsOf.set(key, []);
    siblingsOf.get(key).push(n.id);
  });
  const byId = new Map(simNodes.map((n) => [n.id, n]));
  const boxOf = (id) => {
    const sim = byId.get(id);
    if (sim) return { x: sim.x - boxSizes[id].width / 2, y: sim.y - boxSizes[id].height / 2, ...boxSizes[id] };
    const at = absolute(id);
    return { x: at.x, y: at.y, ...boxSizes[id] };
  };
  const clear = (id) => {
    const box = boxOf(id);
    const parent = parentOfLeaf.get(id);
    if (parent) {
      const hull = boxOf(parent);
      if (box.x < hull.x + GROUP_PADDING / 2 || box.x + box.width > hull.x + hull.width - GROUP_PADDING / 2
        || box.y < hull.y + GROUP_PADDING / 2 || box.y + box.height > hull.y + hull.height - GROUP_PADDING / 2) return false;
    }
    return siblingsOf.get(parent).every((other) => {
      if (other === id) return true;
      const o = boxOf(other);
      return box.x + box.width + 12 <= o.x || o.x + o.width + 12 <= box.x
        || box.y + box.height + 12 <= o.y || o.y + o.height + 12 <= box.y;
    });
  };
  reduceCrossings(
    simNodes,
    links,
    (a, b) => parentOfLeaf.get(a.id) === parentOfLeaf.get(b.id)
      && Math.hypot(a.x - b.x, a.y - b.y) <= UNTANGLE_REACH,
    (a, b) => clear(a.id) && clear(b.id),
  );
  simNodes.forEach((sim) => {
    const parent = parentOfLeaf.get(sim.id);
    const origin = parent ? absolute(parent) : { x: 0, y: 0 };
    positions[sim.id] = {
      x: sim.x - boxSizes[sim.id].width / 2 - origin.x,
      y: sim.y - boxSizes[sim.id].height / 2 - origin.y,
    };
  });
}

// Layout with hierarchical group containers. Post-order: size inner groups first,
// then layout their parent's children using those sizes for collision.
export function layoutWithGroups(nodes, edges, { entityMode = false } = {}) {
  const childrenByParent = {};
  const nodeById = {};
  nodes.forEach((n) => { nodeById[n.id] = n; });
  nodes.forEach((n) => {
    const pid = n.parentId || '__root__';
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(n);
  });

  // For a given node id, walk ancestors to find its ancestor at a given target parent level.
  // Used to lift cross-group edges to the level at which we're laying out.
  const parentOf = (id) => {
    const n = nodeById[id];
    return n && n.parentId ? n.parentId : null;
  };
  const ancestorAtLevel = (nodeId, levelId) => {
    // Walk up from nodeId until the direct parent equals levelId (or '__root__' for root).
    let current = nodeId;
    while (current) {
      const pid = parentOf(current) || '__root__';
      if (pid === levelId) return current;
      current = parentOf(current);
    }
    return null;
  };

  const positions = {}; // id -> relative position (to its parent, or absolute if top-level)
  const sizes = {};     // group id -> {width, height}
  const boxSizes = {};  // every node's box, groups included

  function layoutLevel(parentId) {
    const children = childrenByParent[parentId] || [];
    if (children.length === 0) return;

    // Recurse into subgroups first so we know their sizes before laying out this level.
    children.forEach((c) => { if (c.type === 'group') layoutLevel(c.id); });

    // Lift edges: for this level, consider edges between siblings.
    // A cross-group edge (e.g. from a node deep inside groupA to a node deep inside groupB,
    // both siblings here) gets mapped to groupA ↔ groupB at this level.
    const childIdSet = new Set(children.map((c) => c.id));
    const liftedEdges = [];
    edges.forEach((e) => {
      const sa = childIdSet.has(e.source) ? e.source : ancestorAtLevel(e.source, parentId);
      const ta = childIdSet.has(e.target) ? e.target : ancestorAtLevel(e.target, parentId);
      if (!sa || !ta || sa === ta) return;
      liftedEdges.push({ source: sa, target: ta });
    });

    // Collect sizes for children. Subgroups contribute their computed size;
    // leaves use a size based on render mode (ERD entities are much larger);
    // collapsed groups are pre-tagged with type 'collapsed_group' and use the
    // fixed pill dimensions.
    const childSizes = {};
    children.forEach((c) => {
      if (c.type === 'group') {
        childSizes[c.id] = sizes[c.id] || { width: 200, height: 120 };
      } else if (c.type === 'collapsed_group') {
        childSizes[c.id] = { width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT };
      } else {
        childSizes[c.id] = estimateLeafSize(c, entityMode);
      }
    });

    const centers = layoutCenters(children, liftedEdges, childSizes, entityMode);

    // Convert centres into top-left positions relative to this group's content origin.
    const padTop = parentId === '__root__' ? 0 : GROUP_PADDING + GROUP_LABEL_HEIGHT;
    const padLeft = parentId === '__root__' ? 0 : GROUP_PADDING;

    let maxX = 0, maxY = 0;
    children.forEach((c) => {
      const sz = childSizes[c.id];
      boxSizes[c.id] = sz;
      const x = centers[c.id].x - sz.width / 2 + padLeft;
      const y = centers[c.id].y - sz.height / 2 + padTop;
      positions[c.id] = { x, y };
      maxX = Math.max(maxX, x + sz.width);
      maxY = Math.max(maxY, y + sz.height);
    });

    if (parentId !== '__root__') {
      sizes[parentId] = {
        width: maxX + GROUP_PADDING,
        height: maxY + GROUP_PADDING,
      };
    }
  }

  layoutLevel('__root__');
  untangleGroupMembers(nodes, edges, positions, boxSizes, parentOf);

  // Build laid-out nodes. Order matters: parents must come before children in React Flow.
  const depthOf = (id) => {
    let d = 0;
    let cur = parentOf(id);
    while (cur) { d++; cur = parentOf(cur); }
    return d;
  };
  const withDepth = nodes.map((n) => ({ n, d: depthOf(n.id) }));
  withDepth.sort((a, b) => a.d - b.d);

  const layoutedNodes = withDepth.map(({ n }) => {
    const pos = positions[n.id] || { x: 0, y: 0 };
    const out = {
      ...n,
      position: pos,
    };
    if (n.type === 'group' || n.type === 'collapsed_group') {
      const sz = n.type === 'collapsed_group'
        ? { width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT }
        : sizes[n.id] || { width: 200, height: 120 };
      // Suppress React Flow's default group node chrome so only the custom
      // rendering (hull or pill) is visible.
      out.style = {
        width: sz.width,
        height: sz.height,
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        padding: 0,
        borderRadius: 0,
      };
    }
    if (n.parentId) {
      out.parentId = n.parentId;
      out.extent = 'parent';
    }
    return out;
  });

  return { nodes: layoutedNodes, edges };
}

const TREE_SIBLING_GAP = 32;
const TREE_LEVEL_GAP = 84;

// The hierarchy view: a tidy tree, parents above their children, every subtree as wide as its
// concepts actually are, so long names never run into each other. For is-a edges the source is the
// child and the target the parent. A concept with two parents is placed under the first one the walk
// reaches; the edge from the other still runs to it.
export function treeLayout(nodes, edges) {
  const sizes = {};
  nodes.forEach((n) => { sizes[n.id] = estimateLeafSize(n, false); });
  const idSet = new Set(nodes.map((n) => n.id));
  const childrenOf = {};
  const hasParent = new Set();
  edges.forEach((e) => {
    if (e.source === e.target || !idSet.has(e.source) || !idSet.has(e.target)) return;
    if (!childrenOf[e.target]) childrenOf[e.target] = [];
    if (!childrenOf[e.target].includes(e.source)) childrenOf[e.target].push(e.source);
    hasParent.add(e.source);
  });

  const roots = nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
  // Every concept has a parent only in a cycle; start from the first.
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id);

  const treeChildren = {};
  const depth = {};
  const placed = new Set();
  const walk = (rootIds) => {
    const queue = rootIds.map((id) => ({ id, level: 0 }));
    rootIds.forEach((id) => placed.add(id));
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      depth[id] = level;
      treeChildren[id] = [];
      (childrenOf[id] || []).forEach((child) => {
        if (placed.has(child)) return;
        placed.add(child);
        treeChildren[id].push(child);
        queue.push({ id: child, level: level + 1 });
      });
    }
  };
  walk(roots);
  // Whatever only a cycle reaches is laid out as one more tree beside the others.
  nodes.forEach((n) => {
    if (!placed.has(n.id)) {
      roots.push(n.id);
      walk([n.id]);
    }
  });

  const widthMemo = {};
  const subtreeWidth = (id) => {
    if (widthMemo[id] !== undefined) return widthMemo[id];
    const kids = treeChildren[id];
    const kidsWidth = kids.reduce((sum, k) => sum + subtreeWidth(k), 0) + TREE_SIBLING_GAP * Math.max(kids.length - 1, 0);
    widthMemo[id] = Math.max(sizes[id].width, kidsWidth);
    return widthMemo[id];
  };

  const rowHeight = Math.max(...nodes.map((n) => sizes[n.id].height)) + TREE_LEVEL_GAP;
  const centerX = {};
  const place = (id, left) => {
    const width = subtreeWidth(id);
    const kids = treeChildren[id];
    if (kids.length === 0) {
      centerX[id] = left + width / 2;
      return;
    }
    const kidsWidth = kids.reduce((sum, k) => sum + subtreeWidth(k), 0) + TREE_SIBLING_GAP * (kids.length - 1);
    let x = left + (width - kidsWidth) / 2;
    kids.forEach((k) => {
      place(k, x);
      x += subtreeWidth(k) + TREE_SIBLING_GAP;
    });
    // Over the middle of its children, which is the middle of the subtree unless the children
    // are uneven.
    centerX[id] = (centerX[kids[0]] + centerX[kids[kids.length - 1]]) / 2;
  };
  let left = 0;
  roots.forEach((id) => {
    place(id, left);
    left += subtreeWidth(id) + TREE_SIBLING_GAP * 2;
  });

  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: {
        x: centerX[node.id] - sizes[node.id].width / 2,
        y: depth[node.id] * rowHeight,
      },
    })),
    edges,
  };
}
