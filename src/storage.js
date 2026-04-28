// Persists per-diagram layout (drag positions + UI toggles) in localStorage.
// Keyed by the diagram's jsonUrl, which is stable across content edits.

const VERSION = 1;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: VERSION, ...data }));
  } catch {
    // quota exceeded or storage disabled — silently skip
  }
}

export function storageKeyFor(jsonUrl) {
  return jsonUrl ? `semviz:v${VERSION}:${jsonUrl}` : null;
}

export function loadLayout(key) {
  if (!key) return null;
  const data = read(key);
  if (!data) return null;
  return {
    positions: data.positions || {},
    toggles: data.toggles || null,
  };
}

export function savePositions(key, modeKey, nodes) {
  if (!key) return;
  const current = read(key) || {};
  const positions = { ...(current.positions || {}) };
  positions[modeKey] = Object.fromEntries(
    nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
  );
  write(key, { ...current, positions });
}

export function clearPositions(key, modeKey) {
  if (!key) return;
  const current = read(key);
  if (!current?.positions) return;
  const positions = { ...current.positions };
  delete positions[modeKey];
  write(key, { ...current, positions });
}

export function saveToggles(key, toggles) {
  if (!key) return;
  const current = read(key) || {};
  write(key, { ...current, toggles });
}
