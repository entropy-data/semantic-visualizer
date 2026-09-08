# Semantic Visualizer

A React + Vite bundle that draws a semantic model (concepts, properties, metrics, groups and the
relationships between them) with React Flow. Built into a single `dist/assets/index.js` and
`dist/assets/index.css` for embedding.

```bash
npm ci
npm run dev     # http://localhost:5173 renders public/sample.json
                # http://localhost:5173/?sample=review renders public/sample-review.json with the diff UI
npm run build   # dist/assets/index.{js,css}
```

## Mounting

### Auto-mount (container attributes)

Every `.semantic-visualizer` element with a `data-json-url` is mounted on `DOMContentLoaded` and on
each `htmx:load`.

| Attribute | Default | Meaning |
|---|---|---|
| `data-json-url` | required | URL returning the graph JSON below (fetched with `credentials: same-origin`) |
| `data-height` | `400px` | CSS height applied to the container |
| `data-layout` | `force` | `force` (d3-force) or `tree` (hierarchy, groups off) |
| `data-show-minimap` | `false` | `true` shows the React Flow minimap |
| `data-locale` | detected | `en` or `de`; otherwise resolved from `?lang`, localStorage, navigator |
| `data-changes-only` | `false` | `true` opens on the elements that carry a diff (no effect when nothing does) |

### `init(options)`

For a host that has more to supply than a URL. Exported from the bundle:

```js
import { init } from '/assets/semantic-visualizer/index.js';

const handle = init({
  container: '#graph',      // selector or element
  graphData,                // { nodes, edges } — see the contract below
  height: '340px',
  locale: 'en',
  layout: 'force',          // or 'tree'
  changesOnly: true,        // open on what carries a diff
  focus: 'customer',        // externalId to centre and select on mount
  onSelect: (externalId, node) => true,  // return true to claim the click (see below)
  storageKey: 'my-key',     // optional; localStorage key for positions and toggles
  showMiniMap: false,
});

handle.update({ graphData: nextGraph, focus: 'order', changesOnly: false });
```

`onSelect` lets the host own what a click means. Returning `true` claims the click and withholds
the built-in detail panel for that element (the host is showing it itself); any other return hands
the click back and the panel opens. The element passed as `focus` is treated as claimed on mount.

`update(next)` merges `graphData`, `focus`, `changesOnly` and `onSelect` into the stored options and
re-renders. `container`, `height`, `locale`, `layout`, `storageKey` and `showMiniMap` are fixed at
mount. `init` returns `null` when the container is not found.

## Graph JSON contract

```json
{ "nodes": [ ... ], "edges": [ ... ] }
```

### Node

| Key | Type | Meaning |
|---|---|---|
| `id` | string | Unique within the graph; edges reference it |
| `type` | string | `entity`, `metric`, `property`, `shared_property`, `group` |
| `parentId` | string? | `id` of the enclosing group |
| `data` | object | See below |

`data`:

| Key | Type | Meaning |
|---|---|---|
| `label` | string | Display name |
| `externalId` | string? | Stable id; what `focus`, `onSelect` and the review correlate on |
| `link` | string? | Href for the label and the "open details" link in the panel |
| `description` | string? | Shown in the detail panel |
| `foreignNamespace` | string? | Set when the concept lives in another namespace; badged, and hidden past a threshold |
| `highlight` | boolean? | Search hit; also switches on the entity-relationship view when a property matches |
| `searchMatch` | boolean? | `false` marks a 1-hop neighbour included only as context |
| `properties` | Property[] | Rendered as rows in the entity-relationship view and the panel |
| `diff` | `add` \| `modify` \| `remove` \| `conflict`? | What the branch does to this element; ring and badge on the node |
| `diffDetail` | DiffDetail? | What changed, for the panel |
| `changedPropertyCount` | number? | How many of its properties carry a diff when the concept itself does not; keeps it in the changes-only view |
| `evidence` | Evidence[]? | What the change cites |
| `evidenceMissing` | boolean? | Changed but cites nothing; marked on the node and in the panel |
| `consumers` | Consumers? | What breaks if a removal goes ahead |
| `unresolved` | boolean? | Named by a relationship but present nowhere; drawn dashed and red |
| `dimmed` | boolean? | Rendered faded. Set by the visualizer for context nodes; accepted as input too |

### Property (`data.properties[]`)

| Key | Type | Meaning |
|---|---|---|
| `name` | string | |
| `externalId` | string? | Stable id |
| `type` | string? | Data type, shown beside the name |
| `description` | string? | |
| `primaryKey` | boolean? | Key icon |
| `inherited` | boolean? | Listed separately, italic |
| `shared` | boolean? | Carried by several concepts; badged in the panel |
| `highlight` | boolean? | Search hit; the row is accented and auto-expanded |
| `diff` | `add` \| `modify` \| `remove` \| `conflict`? | Rail, badge and strike-through on the row |
| `diffDetail` | DiffDetail? | Its `fields` render on the row in the panel |

### Edge

| Key | Type | Meaning |
|---|---|---|
| `id` | string | |
| `source`, `target` | string | Node ids |
| `label` | string | Drawn on the edge |
| `type` | string | Relationship type, e.g. `hasProperty`, `relatedTo`, `isA` |
| `externalId` | string? | Stable id |
| `diff` | `add` \| `modify` \| `remove` \| `conflict`? | Coloured stroke; `remove` is dashed. Both ends count as changed for the changes-only view |
| `diffDetail` | DiffDetail? | Shown when the edge is clicked |
| `evidence`, `evidenceMissing` | | As on nodes |

### DiffDetail

```json
{
  "op": "add | modify | remove | conflict",
  "impact": "structural | descriptive | cosmetic",
  "fields": [
    { "field": "description", "before": "…", "after": "…", "base": "…", "impact": "descriptive" }
  ]
}
```

`before`/`after` are rendered by shape: a boolean, a value from a small vocabulary (`status`, `kind`,
`element_type`, `better_when`) or a code-like field (`pattern`, `formula`, `iri`, `data_type`,
`extends`, `unit`) as a chip transition; a list as a set difference; a map (e.g. translations keyed
by locale) key by key; anything else as side-by-side prose. `base` is optional and, when present,
adds a third column showing the value the author wrote against (a conflict). Any value may arrive
decorated as `{ "display": "badge", "label", "color", "icon", "href" }` and is drawn as a badge;
`color` is a palette token (`red`, `orange`, `amber`, `yellow`, `green`, `teal`, `blue`, `indigo`,
`purple`, `pink`, `gray`), `icon` inline SVG, `href` a link back to the thing named.

### Evidence, Consumers

```json
"evidence": [ { "quote": "…", "label": "docs/glossary.md", "resolvable": true } ],
"consumers": {
  "total": 2,
  "relationships": [ { "label": "reports", "namespace": "reporting", "link": "/…" } ],
  "dataProducts":  [ { "label": "Finance KPIs", "link": "/…" } ],
  "dataContracts": [ { "label": "…", "link": "/…" } ]
}
```

`public/sample-review.json` exercises every key above.
