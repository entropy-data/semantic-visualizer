import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  MarkerType,
  useReactFlow,
  useStoreApi,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import KnowledgeNode from './KnowledgeNode';
import EntityNode from './EntityNode';
import GroupNode from './GroupNode';
import FloatingEdge from './FloatingEdge';
import DetailPanel from './DetailPanel';
import ReviewPanel from './ReviewPanel';
import { GroupActionsContext } from './GroupActionsContext';
import {
  zoomInIcon, zoomOutIcon, fitViewIcon, autoLayoutIcon, expandAllIcon, collapseAllIcon,
  changesOnlyIcon, groupsIcon, erdIcon, enlargeIcon,
} from './controlIcons';
import { loadLayout, savePositions, clearPositions, saveToggles } from './storage';
import { DIFF_STYLES } from './diffStyles';

import '@xyflow/react/dist/style.css';

const defaultNodeTypes = {
  entity: KnowledgeNode,
  metric: KnowledgeNode,
  property: KnowledgeNode,
  shared_property: KnowledgeNode,
  group: GroupNode,
  // Collapsed groups use a non-'group' type so React Flow treats them as regular
  // nodes — v12 filters edges whose source/target is a 'group'-type (container)
  // node from the default edge renderer.
  collapsed_group: GroupNode,
};

const entityNodeTypes = {
  entity: EntityNode,
  metric: EntityNode,
  property: KnowledgeNode,
  shared_property: KnowledgeNode,
  group: GroupNode,
  collapsed_group: GroupNode,
};

const edgeTypes = {
  floating: FloatingEdge,
};

function toReactFlowElements(graphData) {
  const connectionCount = {};
  graphData.edges.forEach((e) => {
    connectionCount[e.source] = (connectionCount[e.source] || 0) + 1;
    connectionCount[e.target] = (connectionCount[e.target] || 0) + 1;
  });

  const nodes = graphData.nodes.map((n) => ({
    id: n.id,
    type: n.type || 'entity',
    parentId: n.parentId || undefined,
    position: { x: 0, y: 0 },
    data: { ...n.data, connections: connectionCount[n.id] || 0 },
  }));

  // Compute parallel edge offsets: edges between the same pair get an index
  const pairCounts = {};
  graphData.edges.forEach((e) => {
    const key = [e.source, e.target].sort().join('::');
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  const pairAssigned = {};
  const edgeParallelData = {};
  graphData.edges.forEach((e) => {
    const key = [e.source, e.target].sort().join('::');
    if (!pairAssigned[key]) pairAssigned[key] = 0;
    edgeParallelData[e.id] = { index: pairAssigned[key]++, total: pairCounts[key] };
  });

  const edges = graphData.edges.map((e) => {
    // A relationship the change request touches is a change in its own right, and is listed as one
    // in the proposed-changes list — so it has to be legible in the graph too, not just implied by
    // the concepts it happens to connect.
    const diff = DIFF_STYLES[e.diff];
    const stroke = diff ? diff.color : '#94a3b8';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'floating',
      data: { label: e.label, parallel: edgeParallelData[e.id], diff: e.diff, diffDetail: e.diffDetail },
      style: {
        stroke,
        strokeWidth: diff ? 2.5 : 1.5,
        // A removed relationship still has both ends in the graph, so it can only be told apart
        // from a surviving one by how it is drawn.
        ...(e.diff === 'remove' ? { strokeDasharray: '6 4' } : {}),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 14,
        height: 14,
      },
      labelStyle: diff
        ? { fontSize: 11, fill: stroke, fontWeight: 700 }
        : { fontSize: 10, fill: '#64748b', fontWeight: 500 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      zIndex: diff ? 5 : 0,
    };
  });

  return { nodes, edges };
}

// Deterministic-ish angle jitter so successive relayouts give varied arrangements
// (memo still memoizes correctly per seed).
function seededAngleOffset(seed) {
  if (!seed) return 0;
  // Golden-ratio hash — spreads consecutive seeds well around the circle.
  return (seed * 0.6180339887) * Math.PI * 2;
}

// LCG random source for d3-force. Forces internally call `Math.random` for
// tie-breaking when nodes coincide and for collision relaxation, which means
// re-running the same simulation produces visibly different layouts each
// time. Routing search-driven mounts through the layout (instead of overlaying
// saved positions) made that noise visible. A seeded RNG eliminates it so
// (data, seed) → identical positions.
function seededRandom(seed) {
  let s = (((seed | 0) * 1664525 + 1013904223) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Run force simulation on a subset of nodes/edges.
// Optional nodeSizes: id -> {width, height}; used to compute per-node collision radius
// so oversized nodes (e.g. sized group containers) don't overlap with neighbors.
function forceLayoutComponent(compNodes, compEdges, entityMode, nodeSizes, seed) {
  const n = compNodes.length;

  // Single node — no simulation needed
  if (n === 1) {
    return { [compNodes[0].id]: { x: 0, y: 0 } };
  }

  const large = n > 50;
  const chargeStrength = entityMode ? -3000 : (large ? -1200 : -500);
  const linkDistance = entityMode ? 450 : (large ? 250 : 200);
  const baseCollideRadius = entityMode ? 200 : (large ? 80 : 90);

  const radiusOf = (id) => {
    const sz = nodeSizes && nodeSizes[id];
    if (!sz) return baseCollideRadius;
    // Half-diagonal plus a small margin keeps sized containers from overlapping.
    return Math.max(baseCollideRadius, Math.hypot(sz.width, sz.height) / 2 + 20);
  };

  const radius = Math.max(n * 5, 300);
  const angleOffset = seededAngleOffset(seed);
  const simNodes = compNodes.map((nd, i) => ({
    id: nd.id,
    x: Math.cos(2 * Math.PI * i / n + angleOffset) * radius,
    y: Math.sin(2 * Math.PI * i / n + angleOffset) * radius,
  }));
  const simLinks = compEdges.map((e) => ({ source: e.source, target: e.target }));

  const charge = forceManyBody().strength(chargeStrength);
  if (large) charge.theta(1.2);

  // Gentle gravity pulls outliers inward without cramping the dense core
  const gravityStrength = large ? 0.08 : 0.05;

  const simulation = forceSimulation(simNodes)
    .randomSource(seededRandom(seed + n))
    .force('link', forceLink(simLinks).id((d) => d.id).distance(linkDistance).strength(large ? 0.3 : 1))
    .force('charge', charge)
    .force('center', forceCenter(0, 0))
    .force('x', forceX(0).strength(gravityStrength))
    .force('y', forceY(0).strength(gravityStrength))
    .force('collide', forceCollide((d) => radiusOf(d.id)))
    .alphaDecay(large ? 0.04 : 0.0228)
    .stop();

  const iterations = large ? 250 : 300;
  for (let i = 0; i < iterations; i++) simulation.tick();

  const posById = {};
  simNodes.forEach((sn, i) => {
    posById[sn.id] = {
      x: isFinite(sn.x) ? sn.x : i * 100,
      y: isFinite(sn.y) ? sn.y : i * 100,
    };
  });
  return posById;
}

function layoutElements(nodes, edges, { entityMode = false, nodeSizes = null, seed = 0 } = {}) {
  // Detect connected components
  const adj = {};
  nodes.forEach((n) => { adj[n.id] = []; });
  edges.forEach((e) => { adj[e.source].push(e.target); adj[e.target].push(e.source); });

  const visited = new Set();
  const components = []; // each: array of node ids
  nodes.forEach((n) => {
    if (visited.has(n.id)) return;
    const comp = [];
    const stack = [n.id];
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      comp.push(id);
      adj[id].forEach((nb) => { if (!visited.has(nb)) stack.push(nb); });
    }
    components.push(comp);
  });

  // Sort largest first
  components.sort((a, b) => b.length - a.length);

  const nodeById = {};
  nodes.forEach((n) => { nodeById[n.id] = n; });

  // Layout each component independently
  const compLayouts = components.map((compIds) => {
    const compIdSet = new Set(compIds);
    const compNodes = compIds.map((id) => nodeById[id]);
    const compEdges = edges.filter((e) => compIdSet.has(e.source) && compIdSet.has(e.target));
    const posById = forceLayoutComponent(compNodes, compEdges, entityMode, nodeSizes, seed);

    // Normalize positions so component's top-left is at (0, 0).
    // Include sized-node half-extents so oversized containers aren't clipped.
    const halfW = (id) => (nodeSizes && nodeSizes[id]) ? nodeSizes[id].width / 2 : 0;
    const halfH = (id) => (nodeSizes && nodeSizes[id]) ? nodeSizes[id].height / 2 : 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    compIds.forEach((id) => {
      minX = Math.min(minX, posById[id].x - halfW(id));
      minY = Math.min(minY, posById[id].y - halfH(id));
      maxX = Math.max(maxX, posById[id].x + halfW(id));
      maxY = Math.max(maxY, posById[id].y + halfH(id));
    });
    compIds.forEach((id) => {
      posById[id].x -= minX;
      posById[id].y -= minY;
    });

    return { ids: compIds, posById, width: maxX - minX, height: maxY - minY };
  });

  // Pack components: largest stays at origin, others stack to the right
  const gap = entityMode ? 300 : 150;
  const globalPos = {};

  if (compLayouts.length === 1) {
    // Single component — just use its positions directly
    const cl = compLayouts[0];
    cl.ids.forEach((id) => { globalPos[id] = cl.posById[id]; });
  } else {
    // Place the main (largest) component at origin
    const main = compLayouts[0];
    main.ids.forEach((id) => { globalPos[id] = main.posById[id]; });

    // Stack secondary components to the right, wrapping into columns
    let cursorX = main.width + gap * 2;
    let cursorY = 0;
    let colMaxWidth = 0;

    for (let i = 1; i < compLayouts.length; i++) {
      const cl = compLayouts[i];

      // Wrap to next column if this component would exceed the main cluster height
      if (cursorY > 0 && cursorY + cl.height > main.height) {
        cursorX += colMaxWidth + gap * 2;
        cursorY = 0;
        colMaxWidth = 0;
      }

      cl.ids.forEach((id) => {
        globalPos[id] = {
          x: cursorX + cl.posById[id].x,
          y: cursorY + cl.posById[id].y,
        };
      });

      colMaxWidth = Math.max(colMaxWidth, cl.width);
      cursorY += cl.height + gap;
    }
  }

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: globalPos[node.id],
  }));

  return { nodes: layoutedNodes, edges };
}

// Group container sizing constants. GROUP_PADDING must be ≥ the visualizer's
// CORNER_RADIUS (see GroupNode.jsx) so the offset hull stays inside the
// group's bounding box and neighbor hulls don't overlap.
const GROUP_PADDING = 78;
const GROUP_LABEL_HEIGHT = 28;
const LEAF_WIDTH = 180;
const LEAF_HEIGHT = 56;
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

function estimateLeafSize(node, entityMode) {
  if (entityMode && (node.type === 'entity' || node.type === 'metric')) {
    const rawCount = node.data?.properties?.length || 0;
    const rows = rawCount === 0 ? 1 : Math.min(rawCount, ERD_MAX_VISIBLE_PROPS);
    return { width: ERD_ENTITY_WIDTH, height: ERD_HEADER_HEIGHT + rows * ERD_ROW_HEIGHT };
  }
  return { width: LEAF_WIDTH, height: LEAF_HEIGHT };
}

// Layout with hierarchical group containers. Post-order: size inner groups first,
// then layout their parent's children using those sizes for collision.
function layoutWithGroups(nodes, edges, { entityMode = false, seed = 0 } = {}) {
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

  function layoutLevel(parentId) {
    const children = childrenByParent[parentId] || [];
    if (children.length === 0) return;

    // Recurse into subgroups first so we know their sizes before laying out this level.
    children.forEach((c) => { if (c.type === 'group') layoutLevel(c.id); });

    // Lift edges: for this level, consider edges between siblings.
    // A cross-group edge (e.g. from a node deep inside groupA to a node deep inside groupB,
    // both siblings here) gets mapped to groupA ↔ groupB at this level.
    const childIds = children.map((c) => c.id);
    const childIdSet = new Set(childIds);
    const liftedEdgeKeys = new Set();
    const liftedEdges = [];
    edges.forEach((e) => {
      const sa = childIdSet.has(e.source) ? e.source : ancestorAtLevel(e.source, parentId);
      const ta = childIdSet.has(e.target) ? e.target : ancestorAtLevel(e.target, parentId);
      if (!sa || !ta || sa === ta) return;
      const key = sa < ta ? `${sa}::${ta}` : `${ta}::${sa}`;
      if (liftedEdgeKeys.has(key)) return;
      liftedEdgeKeys.add(key);
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

    // Run the same multi-component layout used for the flat case, with size-aware collision.
    const { nodes: laidOut } = layoutElements(children, liftedEdges, { nodeSizes: childSizes, entityMode, seed });

    // Convert the flat-layout positions (which are absolute within the component)
    // into positions relative to this group's content origin.
    const padTop = parentId === '__root__' ? 0 : GROUP_PADDING + GROUP_LABEL_HEIGHT;
    const padLeft = parentId === '__root__' ? 0 : GROUP_PADDING;

    let maxX = 0, maxY = 0;
    laidOut.forEach((n) => {
      const sz = childSizes[n.id];
      // layoutElements returns positions normalized so the component's bounding box starts
      // at (0,0); positions are the *center* of each node (since halfW/halfH were used for bounds).
      const x = n.position.x - sz.width / 2 + padLeft;
      const y = n.position.y - sz.height / 2 + padTop;
      positions[n.id] = { x, y };
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

  // Build laid-out nodes. Order matters: parents must come before children in React Flow.
  const byDepth = [];
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

function treeLayout(nodes, edges) {
  // For isA edges: source = child, target = parent.
  // Build a top-down tree with parents above children.
  const childrenOf = {}; // parentId -> [childId]
  const parentOf = {};   // childId -> parentId
  edges.forEach((e) => {
    if (!childrenOf[e.target]) childrenOf[e.target] = [];
    childrenOf[e.target].push(e.source);
    parentOf[e.source] = e.target;
  });

  // Find roots (nodes that are not children of anyone)
  const roots = nodes.filter((n) => !parentOf[n.id]).map((n) => n.id);
  // If no roots found (cycle), fall back to first node
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id);

  // BFS to assign depth levels and horizontal positions
  const depth = {};
  const order = [];
  const visited = new Set();
  const queue = roots.map((id) => ({ id, level: 0 }));
  roots.forEach((id) => visited.add(id));

  while (queue.length > 0) {
    const { id, level } = queue.shift();
    depth[id] = level;
    order.push(id);
    const children = childrenOf[id] || [];
    children.forEach((childId) => {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  // Include any unvisited nodes (disconnected)
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      depth[n.id] = 0;
      order.push(n.id);
    }
  });

  // Group by level for horizontal spacing
  const levels = {};
  order.forEach((id) => {
    const lvl = depth[id];
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(id);
  });

  const horizontalGap = 250;
  const verticalGap = 120;

  const posById = {};
  Object.entries(levels).forEach(([lvl, ids]) => {
    const totalWidth = (ids.length - 1) * horizontalGap;
    ids.forEach((id, i) => {
      posById[id] = {
        x: -totalWidth / 2 + i * horizontalGap,
        y: parseInt(lvl) * verticalGap,
      };
    });
  });

  return {
    nodes: nodes.map((node) => ({ ...node, position: posById[node.id] || { x: 0, y: 0 } })),
    edges,
  };
}

// Build adjacency: for each node, the set of connected node IDs and edge IDs
function buildAdjacency(edges) {
  const neighborNodes = {};
  const neighborEdges = {};
  edges.forEach((e) => {
    if (!neighborNodes[e.source]) neighborNodes[e.source] = new Set();
    if (!neighborNodes[e.target]) neighborNodes[e.target] = new Set();
    neighborNodes[e.source].add(e.target);
    neighborNodes[e.target].add(e.source);

    if (!neighborEdges[e.source]) neighborEdges[e.source] = new Set();
    if (!neighborEdges[e.target]) neighborEdges[e.target] = new Set();
    neighborEdges[e.source].add(e.id);
    neighborEdges[e.target].add(e.id);
  });
  return { neighborNodes, neighborEdges };
}

// Collapse pre-transform: applied BEFORE layout. Hides descendants of collapsed
// groups, tags collapsed groups so the layouter sizes them as pills, aggregates
// edges onto the pill, and switches their type so React Flow renders edges to
// them. The layout then handles everything else — so collapsing all groups
// naturally produces a compact force-layout of pills instead of leaving them
// spread across the original hull label positions.
function applyCollapseTransform({ nodes, edges }, collapsedSet) {
  if (collapsedSet.size === 0) return { nodes, edges };

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = (id) => nodeById.get(id)?.parentId;

  const effectiveId = new Map();
  const memberCount = new Map();
  nodes.forEach((n) => {
    let outermost = null;
    let cur = n.id;
    while (cur) {
      if (collapsedSet.has(cur)) outermost = cur;
      cur = parentOf(cur);
    }
    effectiveId.set(n.id, outermost || n.id);
    if (outermost && outermost !== n.id && n.type !== 'group') {
      memberCount.set(outermost, (memberCount.get(outermost) || 0) + 1);
    }
  });

  const filteredNodes = nodes
    .filter((n) => effectiveId.get(n.id) === n.id)
    .map((n) => {
      if (!collapsedSet.has(n.id)) return n;
      // Switch to collapsed_group type so React Flow's edge renderer doesn't
      // filter edges to/from it (as it does for 'group' container nodes).
      // A collapsed group no longer has parent semantics.
      const { parentId: _pid, extent: _ext, ...rest } = n;
      return {
        ...rest,
        type: 'collapsed_group',
        data: { ...n.data, collapsed: true, memberCount: memberCount.get(n.id) || 0 },
      };
    });

  // Rewire and aggregate edges.
  const aggregated = new Map();
  edges.forEach((e) => {
    const s = effectiveId.get(e.source) || e.source;
    const t = effectiveId.get(e.target) || e.target;
    if (s === t) return;
    const key = `${s}::${t}`;
    let bucket = aggregated.get(key);
    if (!bucket) {
      bucket = { source: s, target: t, originals: [] };
      aggregated.set(key, bucket);
    }
    bucket.originals.push(e);
  });

  const finalEdges = [];
  aggregated.forEach(({ source, target, originals }) => {
    const untouched = originals.length === 1 && originals[0].source === source && originals[0].target === target;
    if (untouched) {
      finalEdges.push(originals[0]);
      return;
    }
    // Aggregated edges show only the count — once a group-to-group connection
    // represents multiple underlying relationships, individual labels lose
    // meaning, so use the count as the sole label for consistency.
    const first = originals[0];
    const count = originals.length;
    finalEdges.push({
      ...first,
      id: `col-${source}-${target}`,
      source,
      target,
      label: `× ${count}`,
    });
  });

  return { nodes: filteredNodes, edges: finalEdges };
}

// Toggle button style helper
/**
 * A square icon button, stacked with its siblings down the edge of the canvas.
 *
 * Labels cost horizontal room the graph now needs — "Show as Entity-Relationship-Diagram" was wider
 * than the canvas it sat on once the panels stopped overlapping it. A glyph cannot say "on" by
 * itself, so the pressed state is carried by the button: filled, tinted and outlined, with the words
 * still available as a title.
 */
const toggleBtnStyle = (active) => ({
  width: 32,
  height: 32,
  borderRadius: 6,
  background: active ? '#eef2ff' : '#fff',
  padding: 0,
  color: active ? '#4f46e5' : '#4b5563',
  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  border: `1px solid ${active ? '#a5b4fc' : '#d1d5db'}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

/** Sized here rather than in each glyph so the four stay on one grid. */
const toolbarIconStyle = { width: 17, height: 17, display: 'block' };

// Enlarge/shrink button
function EnlargeButton({ customHeight, containerRef }) {
  const { t } = useTranslation();
  const { fitView } = useReactFlow();
  const [enlarged, setEnlarged] = useState(false);

  const toggle = useCallback(() => {
    const container = containerRef.current?.closest('.semantic-visualizer');
    if (!container) return;
    if (enlarged) {
      container.style.height = customHeight;
      setEnlarged(false);
    } else {
      container.style.height = '100vh';
      setEnlarged(true);
    }
    setTimeout(() => {
      fitView();
      container.scrollIntoView(true);
    }, 0);
  }, [enlarged, customHeight, fitView, containerRef]);

  return (
    <button onClick={toggle} style={toggleBtnStyle(enlarged)}
      title={enlarged ? t('controls.shrink') : t('controls.enlarge')}
      aria-label={enlarged ? t('controls.shrink') : t('controls.enlarge')}
      aria-pressed={enlarged}
      onMouseOver={(e) => { if (!enlarged) e.currentTarget.style.background = '#f9fafb'; }}
      onMouseOut={(e) => { if (!enlarged) e.currentTarget.style.background = '#fff'; }}>
      <span style={toolbarIconStyle} aria-hidden="true">{enlargeIcon}</span>
    </button>
  );
}

export default function App({ graphData: sourceGraphData, changes: changesProp, targetName, onDecide, customHeight, layout, storageKey, showMiniMap }) {
  const { t } = useTranslation();
  const { fitView, getNodes, zoomIn, zoomOut, setCenter, getViewport, getNodesBounds } = useReactFlow();
  const store = useStoreApi();
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  // Review selection is shared between the change list and the graph: one set, two views onto it.
  // Any graph element resolves to the card that governs it, so selecting a property node selects the
  // concept holding it and a box-selection collapses to distinct cards rather than to nodes.
  const changes = changesProp || sourceGraphData.changes || [];
  const [selectedChangeIds, setSelectedChangeIds] = useState(() => new Set());
  const [selectedChangeId, setSelectedChangeId] = useState(null);
  // Keyed on the element's stable id, never the node id: a node's id is an internal UUID that means
  // nothing to a change list, an export or a citation.
  const changeByExternalId = useMemo(() => {
    const map = new Map();
    changes.forEach((change) => {
      map.set(change.externalId, change);
      // An inline property is reviewed inside its concept, so its node resolves to that card.
      (change.properties || []).forEach((p) => map.set(p.externalId, change));
    });
    return map;
  }, [changes]);
  // A property's own change, keyed by its stable id — the concept's card carries these folded in.
  const propertyChangeByExternalId = useMemo(() => {
    const map = new Map();
    changes.forEach((change) => (change.properties || []).forEach((p) => map.set(p.externalId, p)));
    return map;
  }, [changes]);
  const relationshipChangeByExternalId = useMemo(() => {
    const map = new Map();
    changes.forEach((c) => (c.relationships || []).forEach((r) => map.set(r.externalId, r)));
    return map;
  }, [changes]);
  const cardIdOf = (node) => changeByExternalId.get(node?.data?.externalId)?.externalId;

  // The graph is the branch's state, so on its own it shows what the namespace *would* look like
  // without saying which parts are the proposal. The marks come from the change list rather than from
  // the graph endpoint, which is generic and has no idea a proposal exists.
  const graphData = useMemo(() => {
    if (!changes.length) return sourceGraphData;
    return {
      ...sourceGraphData,
      edges: (sourceGraphData.edges || []).map((edge) => {
        const change = relationshipChangeByExternalId.get(edge.externalId);
        return change ? { ...edge, diff: change.op, data: { ...edge.data, diff: change.op } } : edge;
      }),
      nodes: sourceGraphData.nodes.map((node) => {
        const change = changeByExternalId.get(node.data?.externalId);
        // A property's own change belongs on its row, not on the concept: the concept may not have
        // moved at all, and marking it would say something untrue about it.
        const properties = (node.data?.properties || []).map((property) => {
          const propertyChange = propertyChangeByExternalId.get(property.externalId);
          return propertyChange
            ? { ...property, diff: propertyChange.op, diffDetail: { fields: propertyChange.fields || [] } }
            : property;
        });

        // Only a card of its own marks the node: an inline property resolves to its concept's card,
        // and marking the concept with the property's op would overstate what changed.
        const own = change && change.externalId === node.data?.externalId ? change : null;
        if (!own && properties === node.data?.properties) return node;
        return {
          ...node,
          data: {
            ...node.data,
            properties,
            ...(own ? {
              diff: own.op,
              // The panel already knows how to say "Does not exist yet. Approving this request
              // creates it." and to lay out before/after — it was only ever missing the data.
              diffDetail: { op: own.op, impact: own.impact?.toLowerCase(), fields: own.fields || [] },
              evidence: own.evidence || [],
              // Distinct from an empty list: nothing cited is a fact worth stating, not an absence
              // worth hiding.
              evidenceMissing: !own.evidence || own.evidence.length === 0,
            } : {}),
          },
        };
      }),
    };
  }, [sourceGraphData, changes, changeByExternalId, propertyChangeByExternalId, relationshipChangeByExternalId]);
  const [selectedEdge, setSelectedEdge] = useState(null);
  // Default to ERD mode when a property is highlighted — otherwise the highlight
  // (which lives inside an entity node's property list) wouldn't be visible.
  const hasHighlightedProperty = useMemo(
    () => graphData.nodes.some((n) => (n.data?.properties || []).some((p) => p.highlight)),
    [graphData],
  );
  // Read once on mount; subsequent reads happen ad-hoc inside the persistence callbacks.
  const initialStored = useMemo(() => loadLayout(storageKey), [storageKey]);
  const initialToggles = initialStored?.toggles;
  const [showProperties, setShowProperties] = useState(
    initialToggles?.showProperties ?? hasHighlightedProperty,
  );
  const hasGroups = useMemo(
    () => graphData.nodes.some((n) => n.type === 'group'),
    [graphData],
  );
  const [showGroups, setShowGroups] = useState(initialToggles?.showGroups ?? false);
  // A review opens on what is being reviewed. The whole namespace is the context you reach for once
  // the change stops making sense on its own, not the thing you start by scrolling past. Inert when
  // there is no diff, so a plain graph is unaffected.
  const [changesOnly, setChangesOnly] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(initialToggles?.collapsedGroups || []),
  );
  // Bumped by the relayout button — included in baseLayouted deps to force a
  // fresh force-sim run with different initial positions.
  const [layoutSeed, setLayoutSeed] = useState(0);
  const isHierarchy = layout === 'tree';
  const groupsActive = hasGroups && showGroups && !isHierarchy;
  // A request whose only change is to a concept's own property marks no node and no edge — the
  // property is not either. Without counting it the changes-only toggle disappears on exactly the
  // request that needs it.
  const hasDiff = useMemo(
    () => graphData.nodes.some((n) => n.data?.diff || n.data?.changedPropertyCount > 0) ||
      graphData.edges.some((e) => e.diff),
    [graphData],
  );
  const nodeTypes = showProperties && !isHierarchy ? entityNodeTypes : defaultNodeTypes;

  // Toggling produces a fresh Set so memoized consumers (layout, context) invalidate cleanly.
  const toggleCollapse = useCallback((groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Collapses every group that sits at the same parent level as `groupId`
  // except `groupId` itself. Handy for isolating one group visually.
  const collapseOthers = useCallback((groupId) => {
    const target = graphData.nodes.find((n) => n.id === groupId);
    if (!target) return;
    const parentId = target.parentId || null;
    const siblings = graphData.nodes.filter((n) =>
      n.type === 'group' &&
      n.id !== groupId &&
      (n.parentId || null) === parentId
    );
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      siblings.forEach((s) => next.add(s.id));
      next.delete(groupId);
      return next;
    });
  }, [graphData]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    const ids = graphData.nodes.filter((n) => n.type === 'group').map((n) => n.id);
    setCollapsedGroups(new Set(ids));
  }, [graphData]);

  const allGroupsCollapsed = useMemo(() => {
    const groupIds = graphData.nodes.filter((n) => n.type === 'group').map((n) => n.id);
    return hasGroups && groupIds.every((id) => collapsedGroups.has(id));
  }, [graphData, collapsedGroups, hasGroups]);

  const toggleCollapseAll = useCallback(() => {
    if (allGroupsCollapsed) expandAll();
    else collapseAll();
  }, [allGroupsCollapsed, expandAll, collapseAll]);

  // Position persistence is scoped per "mode" — flat/groups/tree × simple/erd —
  // because positions from one mode (e.g. groups expanded) don't make sense in another.
  const modeKey = `${isHierarchy ? 'tree' : groupsActive ? 'groups' : 'flat'}:${showProperties ? 'erd' : 'simple'}`;

  const overlaySavedPositions = useCallback((nodes) => {
    const data = loadLayout(storageKey);
    const saved = data?.positions?.[modeKey];
    if (!saved) return nodes;
    return nodes.map((n) => (saved[n.id] ? { ...n, position: saved[n.id] } : n));
  }, [storageKey, modeKey]);

  // True when the server returned a search-filtered subgraph (presence of any
  // context node — searchMatch === false — is the signal). When filtered, the
  // saved drag-position overlay is skipped so the fresh force layout actually
  // shows; dragging is also not persisted, to avoid polluting the unfiltered
  // map with positions from a small subset.
  const isFiltered = useMemo(
    () => graphData.nodes.some((n) => n.data?.searchMatch === false),
    [graphData],
  );

  // Persist toggles whenever they change.
  useEffect(() => {
    saveToggles(storageKey, {
      showProperties,
      showGroups,
      collapsedGroups: Array.from(collapsedGroups),
    });
  }, [storageKey, showProperties, showGroups, collapsedGroups]);

  const onNodeDragStop = useCallback(() => {
    if (isFiltered) return;
    savePositions(storageKey, modeKey, getNodes());
  }, [storageKey, modeKey, getNodes, isFiltered]);

  // Relayout: bump the seed so baseLayouted recomputes. The initial-position
  // jitter (see forceLayoutComponent) uses the seed to produce a different
  // arrangement each click. Also discards saved positions for the current mode
  // — otherwise the saved overlay would re-pin nodes immediately after relayout.
  const relayout = useCallback(() => {
    clearPositions(storageKey, modeKey);
    setLayoutSeed((s) => s + 1);
  }, [storageKey, modeKey]);

  const groupActions = useMemo(
    () => ({ toggleCollapse, collapsedSet: collapsedGroups }),
    [toggleCollapse, collapsedGroups],
  );

  const layouted = useMemo(() => {
    let sourceData = graphData;
    // Hide what the change request leaves alone — but keep whatever the changed concepts connect to.
    // A concept shown alone says nothing about whether changing it is safe; its neighbours are what
    // make a removal at a hub look different from a removal at a leaf. Neighbours come through
    // dimmed, the treatment search context already uses.
    if (changesOnly && hasDiff) {
      // A concept whose only change is to one of its own properties carries no diff of its own —
      // the property is not a node, so the change lands on the concept as a count.
      const changedIds = new Set(
        sourceData.nodes.filter((n) => n.data?.diff || n.data?.changedPropertyCount > 0).map((n) => n.id),
      );
      // A relationship can change between two concepts that are themselves untouched. Both ends
      // count as changed, or the only thing the request actually did would be filtered away.
      sourceData.edges.forEach((e) => {
        if (!e.diff) return;
        changedIds.add(e.source);
        changedIds.add(e.target);
      });
      const neighbourIds = new Set();
      sourceData.edges.forEach((e) => {
        if (changedIds.has(e.source)) neighbourIds.add(e.target);
        if (changedIds.has(e.target)) neighbourIds.add(e.source);
      });
      const filteredNodes = sourceData.nodes
        .filter((n) => changedIds.has(n.id) || neighbourIds.has(n.id) || n.type === 'group')
        .map((n) => (changedIds.has(n.id) || n.type === 'group'
          ? n
          : { ...n, data: { ...n.data, dimmed: true } }));
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    }
    if (showProperties && !isHierarchy) {
      // Filters compose: this reads from whatever the step above produced, not from the original
      // graph. Reading from graphData discarded the changes-only filter, so turning on the
      // entity-relationship view silently put every unchanged concept back.
      const filteredNodes = sourceData.nodes.filter((n) => n.type !== 'shared_property');
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    }
    if (!groupsActive) {
      const filteredNodes = sourceData.nodes
        .filter((n) => n.type !== 'group')
        .map(({ parentId, ...rest }) => rest);
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = sourceData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      sourceData = { nodes: filteredNodes, edges: filteredEdges };
    } else if (collapsedGroups.size > 0) {
      // Apply the collapse transform BEFORE layout so collapsed groups enter
      // the force-sim as pills — this packs them naturally when many are
      // collapsed, instead of leaving them spread across the original hulls.
      sourceData = applyCollapseTransform(sourceData, collapsedGroups);
    }
    const { nodes: rawNodes, edges: rawEdges } = toReactFlowElements(sourceData);
    if (isHierarchy) return treeLayout(rawNodes, rawEdges);
    if (groupsActive) return layoutWithGroups(rawNodes, rawEdges, { entityMode: showProperties, seed: layoutSeed });
    return layoutElements(rawNodes, rawEdges, { entityMode: showProperties, seed: layoutSeed });
  }, [graphData, showProperties, isHierarchy, groupsActive, collapsedGroups, layoutSeed, changesOnly, hasDiff]);

  const adjacency = useMemo(
    () => buildAdjacency(layouted.edges),
    [layouted.edges],
  );

  // Apply highlight/dim based on selected node, falling back to search context
  // when nothing is selected. Server tags non-match leaves with searchMatch=false
  // when a search returned 1-hop neighbors as context — we dim those to keep
  // the eye on actual hits. Groups don't carry searchMatch (defaults true) so
  // they're never dimmed by search alone. Click-selection always wins over
  // search dimming so clicking a context node lets the user explore from it.
  const displayNodes = useMemo(() => {
    // Selecting a relationship reduces the graph to the two concepts it joins — the pair is the
    // whole subject of the panel.
    if (selectedEdge) {
      const ends = new Set([selectedEdge.source, selectedEdge.target]);
      return layouted.nodes.map((node) => ({
        ...node,
        data: { ...node.data, dimmed: !ends.has(node.id), selected: false },
      }));
    }
    if (selectedNode) {
      const activeNodes = new Set([selectedNode.id]);
      (adjacency.neighborNodes[selectedNode.id] || new Set()).forEach((id) => activeNodes.add(id));
      // selected is passed separately from dimmed so the clicked node stands
      // out against its (equally undimmed) 1-hop neighbors.
      return layouted.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          dimmed: !activeNodes.has(node.id),
          selected: node.id === selectedNode.id,
        },
      }));
    }
    const hasContext = layouted.nodes.some((n) => n.data?.searchMatch === false);
    if (!hasContext) return layouted.nodes;
    // Group containers fade too — when searching, the user wants their eye on
    // the matched concepts, not the organizational hulls around them. The
    // matches stay at full saturation; everything else (context leaves and
    // group/collapsed-group containers) recedes.
    return layouted.nodes.map((node) => {
      const isContainer = node.type === 'group' || node.type === 'collapsed_group';
      const shouldDim = isContainer || node.data?.searchMatch === false;
      return { ...node, data: { ...node.data, dimmed: shouldDim } };
    });
  }, [layouted.nodes, selectedNode, selectedEdge, adjacency]);

  const displayEdges = useMemo(() => {
    if (selectedEdge) {
      return layouted.edges.map((edge) => {
        if (edge.id === selectedEdge.id) {
          return { ...edge, style: { ...edge.style, strokeWidth: 3.5 }, zIndex: 10 };
        }
        return {
          ...edge,
          style: { ...edge.style, stroke: '#e2e8f0', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#e2e8f0', width: 14, height: 14 },
          data: { ...edge.data, dimmed: true },
          labelStyle: { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
          labelBgStyle: { fill: '#fff', fillOpacity: 0.5 },
          zIndex: 0,
        };
      });
    }
    if (selectedNode) {
      const activeEdges = adjacency.neighborEdges[selectedNode.id] || new Set();
      return layouted.edges.map((edge) => {
        const active = activeEdges.has(edge.id);
        // Selecting a concept must not erase the diff channel — a changed relationship keeps its
        // own colour and only borrows the selection's emphasis.
        const diff = DIFF_STYLES[edge.data?.diff];
        const activeStroke = diff ? diff.color : '#6366f1';
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: active ? activeStroke : '#e2e8f0',
            strokeWidth: active ? 2.5 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active ? activeStroke : '#e2e8f0',
            width: 14,
            height: 14,
          },
          data: { ...edge.data, dimmed: !active },
          labelStyle: active
            ? { fontSize: 11, fill: diff ? activeStroke : '#4338ca', fontWeight: diff ? 700 : 600 }
            : { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
          labelBgStyle: active
            ? { fill: '#eef2ff', fillOpacity: 1 }
            : { fill: '#fff', fillOpacity: 0.5 },
          zIndex: active ? 10 : 0,
        };
      });
    }
    // Search context: dim edges where either endpoint is a non-match (the
    // server already drops context↔context edges, so what remains is
    // match↔match — kept full — and match↔context — dimmed).
    const matchIds = new Set(
      layouted.nodes.filter((n) => n.data?.searchMatch !== false).map((n) => n.id),
    );
    const hasContext = matchIds.size < layouted.nodes.length;
    if (!hasContext) return layouted.edges;
    return layouted.edges.map((edge) => {
      const fullyMatched = matchIds.has(edge.source) && matchIds.has(edge.target);
      if (fullyMatched) return edge;
      return {
        ...edge,
        style: { stroke: '#e2e8f0', strokeWidth: 1 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#e2e8f0',
          width: 14,
          height: 14,
        },
        data: { ...edge.data, dimmed: true },
        labelStyle: { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.5 },
      };
    });
  }, [layouted.edges, selectedNode, selectedEdge, adjacency, layouted.nodes]);

  // Initial state: skip the saved-position overlay when mounting with a
  // filtered subgraph. HTMX morph re-mounts this component on each search
  // (the .semantic-visualizer container is replaced), so the graphData prop
  // is always fresh on mount — meaning the dataChanged branch below never
  // catches search transitions. ReactFlow's fitView prop reframes
  // automatically once positions are set, so no explicit fitView call here.
  const [nodes, setNodes, onNodesChange] = useNodesState(
    isFiltered ? displayNodes : overlaySavedPositions(displayNodes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  const [prevLayouted, setPrevLayouted] = useState(layouted);
  const [prevDisplayEdges, setPrevDisplayEdges] = useState(displayEdges);
  const [prevGraphData, setPrevGraphData] = useState(graphData);

  // When layout changes, apply new positions. Two cases:
  //   1. Filter result arrived (graphData identity changed AND filter active):
  //      trust the fresh force layout and reframe, since saved positions from
  //      the unfiltered view would scatter the small result across stale
  //      coordinates.
  //   2. Mode toggle (same graphData, or filter cleared): overlay saved
  //      drag-positions so the user keeps their hand-arranged layout.
  if (layouted !== prevLayouted) {
    setPrevLayouted(layouted);
    const dataChanged = graphData !== prevGraphData;
    if (dataChanged) setPrevGraphData(graphData);
    if (dataChanged && isFiltered) {
      setNodes(displayNodes);
      setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
    } else {
      setNodes(overlaySavedPositions(displayNodes));
    }
    setEdges(displayEdges);
    setPrevDisplayEdges(displayEdges);
  }
  // When only highlight/dim changes (e.g. node click), preserve current positions
  else if (displayEdges !== prevDisplayEdges) {
    setPrevDisplayEdges(displayEdges);
    setNodes((cur) => cur.map((node) => {
      const display = displayNodes.find((d) => d.id === node.id);
      return display ? { ...node, data: display.data } : node;
    }));
    setEdges(displayEdges);
  }

  /**
   * Bring the selected element to the middle of the canvas.
   *
   * Not the same job as getting a node out from under a panel, though one function used to do both —
   * and removing the overlap took this with it. Selecting a card in the list has to move the canvas
   * to it, because the reader's whole reason for clicking is to see where it sits; and opening the
   * panel narrows the canvas, which shifts what is visible even when nothing is covering it.
   */
  const focusNode = useCallback((node) => {
    if (!node) return;
    // With the lookup, so a node inside a group is measured where it actually sits.
    const bounds = getNodesBounds([node], { nodeLookup: store.getState().nodeLookup });
    if (!bounds || !bounds.width) return;
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      zoom: getViewport().zoom,
      duration: 400,
    });
  }, [getNodesBounds, getViewport, setCenter, store]);

  /**
   * Centre again once the canvas has settled at its new size.
   *
   * Selecting the first change opens the detail panel, which takes half the width. React Flow keeps
   * its own dimensions and updates them from its own observer, so centring at click time computes
   * against a width the canvas is about to stop having — and the node lands off to one side on
   * exactly the click meant to bring it into view. Every later click is already at the new size,
   * which is why only the first one looked wrong.
   */
  useEffect(() => {
    if (!selectedNode) return undefined;
    const timer = setTimeout(() => focusNode(selectedNode), 250);
    return () => clearTimeout(timer);
  }, [selectedNode, focusNode]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedEdge(null);
    const deselecting = selectedNode?.id === node.id;
    setSelectedNode(deselecting ? null : node);
    // Opening the panel takes half the width away, so a node clicked on the right of the canvas ends
    // up outside it. Centring keeps what was just picked in the part that remains.
    if (!deselecting) focusNode(node);

    // The other half of one shared selection: picking a node in the graph picks its card, exactly as
    // picking a card focuses its node. Without this the graph is somewhere to look rather than
    // somewhere to work, and a reviewer has to find the same element twice.
    const cardId = cardIdOf(node);
    if (cardId === undefined) return;
    setSelectedChangeId(deselecting ? null : cardId);
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    setSelectedChangeIds((prev) => {
      const next = new Set(additive ? prev : []);
      if (additive && prev.has(cardId)) next.delete(cardId);
      else if (!(deselecting && !additive)) next.add(cardId);
      return next;
    });
  }, [selectedNode, cardIdOf, focusNode]);

  // A relationship is a change in its own right, so it has to be inspectable on its own — the panel
  // is the only place a reviewer can see what a change request did to one.
  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedNode(null);
    setSelectedEdge((prev) => prev?.id === edge.id ? null : edge);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);


  // Kept together so the toolbar can live in its own row above the panels rather than under them.
  const viewControls = (
    // Down the edge rather than across the top: the canvas is the scarce dimension once the panels
    // sit beside it, and a column costs one icon's width instead of four buttons' worth.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hasDiff && (
          <button
            onClick={() => {
              setChangesOnly((v) => !v);
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
            }}
            style={toggleBtnStyle(changesOnly)}
            onMouseOver={(e) => { if (!changesOnly) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { if (!changesOnly) e.currentTarget.style.background = '#fff'; }}
            title={t('toolbar.changesOnly.title')}
                aria-label={t('toolbar.changesOnly.label')}
                aria-pressed={changesOnly}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{changesOnlyIcon}</span>
          </button>
        )}
        {!isHierarchy && hasGroups && (
          <button
            onClick={() => {
              setShowGroups((v) => !v);
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
            }}
            style={toggleBtnStyle(showGroups)}
            onMouseOver={(e) => { if (!showGroups) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { if (!showGroups) e.currentTarget.style.background = '#fff'; }}
            title={t('toolbar.showGroups.title')}
                aria-label={t('toolbar.showGroups.label')}
                aria-pressed={showGroups}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{groupsIcon}</span>
          </button>
        )}
        {!isHierarchy && (
          <button
            onClick={() => {
              setShowProperties((v) => !v);
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 0);
            }}
            style={toggleBtnStyle(showProperties)}
            onMouseOver={(e) => { if (!showProperties) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseOut={(e) => { if (!showProperties) e.currentTarget.style.background = '#fff'; }}
            title={t('toolbar.erd.title')}
                aria-label={t('toolbar.erd.label')}
                aria-pressed={showProperties}
          >
            <span style={toolbarIconStyle} aria-hidden="true">{erdIcon}</span>
          </button>
        )}
        <EnlargeButton customHeight={customHeight || '400px'} containerRef={containerRef} />
      </div>
  );

  return (
    <GroupActionsContext.Provider value={groupActions}>
    {/* A row, not a stack. The panels used to float over the canvas, which meant opening one hid the
        element it was describing — and every fix for that (panning the node back into view, offsetting
        the toolbar) was working around the overlap rather than removing it. Laid out side by side, the
        graph keeps whatever width is left and nothing is ever underneath anything. */}
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', minWidth: 0 }}>
      <ReviewPanel
        changes={changes}
        targetName={targetName}
        selectedIds={selectedChangeIds}
        onSelectionChange={setSelectedChangeIds}
        onFocus={(cardId) => {
          setSelectedChangeId(cardId);
          const node = getNodes().find((n) => cardIdOf(n) === cardId);
          // A card with no node still has something to show, so the panel is told either way.
          setSelectedNode(node || null);
          if (node) {
            setSelectedEdge(null);
            focusNode(node);
          }
        }}
        // Passed through only when the host actually supplied one. Wrapping it unconditionally made
        // the panel see a callback that did nothing, so a read-only view still offered buttons and
        // swallowed the click.
        onDecide={onDecide ? (decision, externalIds) => onDecide({ decision, externalIds }) : undefined}
      />
      <div ref={canvasRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.5 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        preventScrolling={false}
        minZoom={0.1}
        maxZoom={2}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls position="bottom-left" showZoom={false} showFitView={false} showInteractive={false}>
          {!isHierarchy && hasGroups && (
            <ControlButton
              onClick={() => {
                toggleCollapseAll();
                setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 50);
              }}
              title={allGroupsCollapsed ? t('controls.expandAll') : t('controls.collapseAll')}
              aria-label={allGroupsCollapsed ? t('controls.expandAll') : t('controls.collapseAll')}
            >
              {allGroupsCollapsed ? expandAllIcon : collapseAllIcon}
            </ControlButton>
          )}
          <ControlButton
            onClick={() => {
              relayout();
              setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.5 }), 50);
            }}
            title={t('controls.autoLayout.title')}
            aria-label={t('controls.autoLayout.label')}
          >
            {autoLayoutIcon}
          </ControlButton>
          <ControlButton onClick={() => zoomIn()} title={t('controls.zoomIn')} aria-label={t('controls.zoomIn')}>
            {zoomInIcon}
          </ControlButton>
          <ControlButton onClick={() => zoomOut()} title={t('controls.zoomOut')} aria-label={t('controls.zoomOut')}>
            {zoomOutIcon}
          </ControlButton>
          <ControlButton
            onClick={() => fitView({ padding: 0.3, maxZoom: 1 })}
            title={t('controls.fitView')}
            aria-label={t('controls.fitView')}
          >
            {fitViewIcon}
          </ControlButton>
        </Controls>
        {showMiniMap && <MiniMap zoomable pannable />}
        <Panel position="top-right">{viewControls}</Panel>
      </ReactFlow>
      </div>
      <DetailPanel
        // In the list's order, not click order: the panel is a second view onto the same selection,
        // and two views disagreeing about sequence is worse than either order alone.
        selection={selectedChangeIds.size > 1
          ? changes
            .filter((c) => selectedChangeIds.has(c.externalId))
            .map((c) => ({
              key: c.externalId,
              change: c,
              node: getNodes().find((n) => cardIdOf(n) === c.externalId) || null,
            }))
          : undefined}
        node={selectedNode}
        change={changes.find((c) => c.externalId === selectedChangeId) || null}
        changesOnly={changesOnly}
        edge={selectedEdge}
        graphData={graphData}
        isCollapsed={selectedNode ? collapsedGroups.has(selectedNode.id) : false}
        onToggleCollapse={toggleCollapse}
        onCollapseOthers={collapseOthers}
        onExpandAll={expandAll}
        onSelectEdge={(e) => { setSelectedNode(null); setSelectedChangeId(null); setSelectedEdge(e); }}
        // Closing has to clear the selected card too: leaving it set meant the panel fell straight
        // through to the card's own view, so the close button looked like it had done nothing.
        onClose={() => { setSelectedNode(null); setSelectedEdge(null); setSelectedChangeId(null); }}
      />
    </div>
    </GroupActionsContext.Provider>
  );
}
