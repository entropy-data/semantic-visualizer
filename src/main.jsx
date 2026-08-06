import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import i18n from './i18n';
import { storageKeyFor } from './storage';
import './index.css';

function initElement(container) {
  if (container.dataset.svInit) return;

  // Defer mount until container is visible (ReactFlow needs dimensions)
  if (container.offsetParent === null) {
    const observer = new MutationObserver(() => {
      if (container.offsetParent !== null) {
        observer.disconnect();
        initElement(container);
      }
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    return;
  }

  const jsonUrl = container.dataset.jsonUrl;
  const height = container.dataset.height || '400px';
  const layout = container.dataset.layout || 'force';
  const showMiniMap = container.dataset.showMinimap === 'true';

  if (!jsonUrl) return;

  container.dataset.svInit = 'true';
  fetch(jsonUrl, { credentials: 'same-origin' })
    .then((res) => res.json())
    .then((data) => {
      if (!data.nodes || data.nodes.length === 0) { delete container.dataset.svInit; return; }
      container.style.height = height;
      // Locale: a host-supplied data-locale wins (embedded, e.g. entropy-data). When
      // absent, the language detector resolves it (?lang / localStorage / navigator). See src/i18n.
      if (container.dataset.locale) i18n.changeLanguage(container.dataset.locale);
      createRoot(container).render(
        <I18nextProvider i18n={i18n}>
          <ReactFlowProvider>
            <App graphData={data} customHeight={height} layout={layout} storageKey={storageKeyFor(jsonUrl)} showMiniMap={showMiniMap} />
          </ReactFlowProvider>
        </I18nextProvider>
      );
    })
    .catch((err) => { delete container.dataset.svInit; console.error('Semantic visualizer fetch error:', err); });
}

function mountAll() {
  document.querySelectorAll('.semantic-visualizer').forEach(initElement);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}

document.addEventListener('htmx:load', mountAll);

/**
 * Explicit mount, for a host that has more to supply than a URL.
 *
 * Deliberately shaped like the data contract editor's `init({...})` rather than inventing a
 * convention: entropy-data already embeds components that way, and a callback is what lets this stay
 * ignorant of authentication and of the endpoint behind it. The auto-mount above is untouched, so the
 * read-only embeds keep working without knowing this exists.
 *
 * @param {object}   options
 * @param {string|Element} options.container   selector or element to mount into
 * @param {object}   options.graphData         `{nodes, edges}`, e.g. from the namespace graph endpoint
 * @param {boolean}  [options.changesOnly]     open showing only what carries a diff
 * @param {string}   [options.focus]           external id to centre and select on mount
 * @param {Function} [options.onSelect]        `(externalId, node) => void` — the host owns what a
 *                                             click means; supplying this also withholds the built-in
 *                                             detail panel, so one click opens one account of an
 *                                             element rather than two
 * @param {string}   [options.locale]
 * @param {string}   [options.height]
 */
export function init(options) {
  const container = typeof options.container === 'string'
    ? document.querySelector(options.container)
    : options.container;
  if (!container) return null;

  const height = options.height || '600px';
  container.style.height = height;
  // Everything that reaches for its own container does so via `.semantic-visualizer` — the enlarge
  // button among them, which silently did nothing when mounted this way because `closest()` found no
  // such ancestor. Marking it initialised too keeps the auto-mount from claiming it as well.
  container.classList.add('semantic-visualizer');
  container.dataset.svInit = 'true';
  if (options.locale) i18n.changeLanguage(options.locale);

  const root = createRoot(container);
  const render = () => root.render(
    <I18nextProvider i18n={i18n}>
      <ReactFlowProvider>
        <App
          graphData={options.graphData}
          changesOnly={options.changesOnly}
          focus={options.focus}
          onSelect={options.onSelect}
          customHeight={height}
          layout={options.layout || 'force'}
          storageKey={options.storageKey || storageKeyFor(options.container)}
          showMiniMap={options.showMiniMap === true}
        />
      </ReactFlowProvider>
    </I18nextProvider>
  );

  render();
  return { update: render };
}
