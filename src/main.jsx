import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import App from './App';
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

  if (!jsonUrl) return;

  container.dataset.svInit = 'true';
  fetch(jsonUrl, { credentials: 'same-origin' })
    .then((res) => res.json())
    .then((data) => {
      if (!data.nodes || data.nodes.length === 0) { delete container.dataset.svInit; return; }
      container.style.height = height;
      createRoot(container).render(
        <ReactFlowProvider>
          <App graphData={data} customHeight={height} layout={layout} />
        </ReactFlowProvider>
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
