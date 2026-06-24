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
