import React, { useMemo, useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  Panel,
  MarkerType,
  useReactFlow,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import KnowledgeNode from './KnowledgeNode';
import EntityNode from './EntityNode';
import GroupNode from './GroupNode';
import FloatingEdge from './FloatingEdge';
import DetailPanel from './DetailPanel';
import { GroupActionsContext } from './GroupActionsContext';

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

  const edges = graphData.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'floating',
    data: { label: e.label, parallel: edgeParallelData[e.id] },
    style: {
      stroke: '#94a3b8',
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#94a3b8',
      width: 14,
      height: 14,
    },
    labelStyle: { fontSize: 10, fill: '#64748b', fontWeight: 500 },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
    labelBgPadding: [4, 2],
  }));

  return { nodes, edges };
}

// Deterministic-ish angle jitter so successive relayouts give varied arrangements
// (memo still memoizes correctly per seed).
function seededAngleOffset(seed) {
  if (!seed) return 0;
  // Golden-ratio hash — spreads consecutive seeds well around the circle.
  return (seed * 0.6180339887) * Math.PI * 2;
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
const toggleBtnStyle = (active) => ({
  borderRadius: 4,
  background: active ? '#eef2ff' : '#fff',
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 500,
  color: active ? '#4f46e5' : '#374151',
  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  border: `1px solid ${active ? '#a5b4fc' : '#d1d5db'}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
});

// Enlarge/shrink button
function EnlargeButton({ customHeight, containerRef }) {
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
    <button onClick={toggle} style={toggleBtnStyle(false)}
      onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
      onMouseOut={(e) => e.currentTarget.style.background = '#fff'}>
      {enlarged ? 'shrink' : 'enlarge'}
    </button>
  );
}

export default function App({ graphData, customHeight, layout }) {
  const { fitView } = useReactFlow();
  const containerRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  // Default to ERD mode when a property is highlighted — otherwise the highlight
  // (which lives inside an entity node's property list) wouldn't be visible.
  const hasHighlightedProperty = useMemo(
    () => graphData.nodes.some((n) => (n.data?.properties || []).some((p) => p.highlight)),
    [graphData],
  );
  const [showProperties, setShowProperties] = useState(hasHighlightedProperty);
  const hasGroups = useMemo(
    () => graphData.nodes.some((n) => n.type === 'group'),
    [graphData],
  );
  const [showGroups, setShowGroups] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  // Bumped by the relayout button — included in baseLayouted deps to force a
  // fresh force-sim run with different initial positions.
  const [layoutSeed, setLayoutSeed] = useState(0);
  const isHierarchy = layout === 'tree';
  const groupsActive = hasGroups && showGroups && !isHierarchy;
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

  // Relayout: bump the seed so baseLayouted recomputes. The initial-position
  // jitter (see forceLayoutComponent) uses the seed to produce a different
  // arrangement each click.
  const relayout = useCallback(() => {
    setLayoutSeed((s) => s + 1);
  }, []);

  const groupActions = useMemo(
    () => ({ toggleCollapse, collapsedSet: collapsedGroups }),
    [toggleCollapse, collapsedGroups],
  );

  const layouted = useMemo(() => {
    let sourceData = graphData;
    if (showProperties && !isHierarchy) {
      const filteredNodes = graphData.nodes.filter((n) => n.type !== 'shared_property');
      const keepIds = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = graphData.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
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
  }, [graphData, showProperties, isHierarchy, groupsActive, collapsedGroups, layoutSeed]);

  const adjacency = useMemo(
    () => buildAdjacency(layouted.edges),
    [layouted.edges],
  );

  // Apply highlight/dim based on selected node
  const displayNodes = useMemo(() => {
    if (!selectedNode) return layouted.nodes;
    const activeNodes = new Set([selectedNode.id]);
    (adjacency.neighborNodes[selectedNode.id] || new Set()).forEach((id) => activeNodes.add(id));

    return layouted.nodes.map((node) => ({
      ...node,
      data: { ...node.data, dimmed: !activeNodes.has(node.id) },
    }));
  }, [layouted.nodes, selectedNode, adjacency]);

  const displayEdges = useMemo(() => {
    if (!selectedNode) return layouted.edges;
    const activeEdges = adjacency.neighborEdges[selectedNode.id] || new Set();

    return layouted.edges.map((edge) => {
      const active = activeEdges.has(edge.id);
      return {
        ...edge,
        style: {
          stroke: active ? '#6366f1' : '#e2e8f0',
          strokeWidth: active ? 2.5 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: active ? '#6366f1' : '#e2e8f0',
          width: 14,
          height: 14,
        },
        data: { ...edge.data, dimmed: !active },
        labelStyle: active
          ? { fontSize: 11, fill: '#4338ca', fontWeight: 600 }
          : { fontSize: 10, fill: '#e2e8f0', fontWeight: 500 },
        labelBgStyle: active
          ? { fill: '#eef2ff', fillOpacity: 1 }
          : { fill: '#fff', fillOpacity: 0.5 },
        zIndex: active ? 10 : 0,
      };
    });
  }, [layouted.edges, selectedNode, adjacency]);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  const [prevLayouted, setPrevLayouted] = useState(layouted);
  const [prevDisplayEdges, setPrevDisplayEdges] = useState(displayEdges);

  // When layout changes (e.g. toggle properties), apply new positions
  if (layouted !== prevLayouted) {
    setPrevLayouted(layouted);
    setNodes(displayNodes);
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

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <GroupActionsContext.Provider value={groupActions}>
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
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
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls position="bottom-left" showInteractive={false}>
          {/* order values push custom buttons above the built-in Zoom/Fit
              buttons in the Controls flex-column stack: collapse-all on top,
              auto-layout below. */}
          {!isHierarchy && hasGroups && (
            <ControlButton
              onClick={() => {
                toggleCollapseAll();
                setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 50);
              }}
              title={allGroupsCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              aria-label={allGroupsCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              style={{ order: -2 }}
            >
              {allGroupsCollapsed ? (
                // Expand icon: two bars with outward arrows
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                  <path d="M4 9l8-6 8 6" />
                  <path d="M4 15l8 6 8-6" />
                </svg>
              ) : (
                // Collapse icon: two bars with inward arrows
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                  <path d="M4 3l8 6 8-6" />
                  <path d="M4 21l8-6 8 6" />
                </svg>
              )}
            </ControlButton>
          )}
          <ControlButton
            onClick={() => {
              relayout();
              setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 50);
            }}
            title="Auto layout — rearrange the diagram"
            aria-label="Auto layout"
            style={{ order: -1 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          </ControlButton>
        </Controls>
        <Panel position="top-right">
          <div style={{ display: 'flex', gap: 6 }}>
            {!isHierarchy && hasGroups && (
              <button
                onClick={() => {
                  setShowGroups((v) => !v);
                  setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 0);
                }}
                style={toggleBtnStyle(showGroups)}
                onMouseOver={(e) => { if (!showGroups) e.currentTarget.style.background = '#f9fafb'; }}
                onMouseOut={(e) => { if (!showGroups) e.currentTarget.style.background = '#fff'; }}
                title="Render groups as containers around the concepts and properties that belong to them"
              >
                Show groups
              </button>
            )}
            {!isHierarchy && (
              <button
                onClick={() => {
                  setShowProperties((v) => !v);
                  setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 0);
                }}
                style={toggleBtnStyle(showProperties)}
                onMouseOver={(e) => { if (!showProperties) e.currentTarget.style.background = '#f9fafb'; }}
                onMouseOut={(e) => { if (!showProperties) e.currentTarget.style.background = '#fff'; }}
                title="Show as Entity-Relationship Diagram — render properties inside concept and metric nodes"
              >
                Show as Entity-Relationship-Diagram
              </button>
            )}
            <EnlargeButton customHeight={customHeight || '400px'} containerRef={containerRef} />
          </div>
        </Panel>
      </ReactFlow>
      <DetailPanel
        node={selectedNode}
        graphData={graphData}
        isCollapsed={selectedNode ? collapsedGroups.has(selectedNode.id) : false}
        onToggleCollapse={toggleCollapse}
        onCollapseOthers={collapseOthers}
        onExpandAll={expandAll}
        onClose={() => setSelectedNode(null)}
      />
    </div>
    </GroupActionsContext.Provider>
  );
}
