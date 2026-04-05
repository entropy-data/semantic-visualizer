import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import App from './App';
import './index.css';

let mounted = false;

function mount() {
  if (mounted) return;
  const container = document.getElementById('semantic-visualizer');
  if (!container) return;

  // Defer mount until container is visible (ReactFlow needs dimensions)
  if (container.offsetParent === null) {
    const observer = new MutationObserver(() => {
      if (container.offsetParent !== null) {
        observer.disconnect();
        mount();
      }
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    return;
  }

  const jsonUrl = container.dataset.jsonUrl;
  const height = container.dataset.height || '400px';

  if (!jsonUrl) return;

  mounted = true;
  fetch(jsonUrl, { credentials: 'same-origin' })
    .then((res) => res.json())
    .then((data) => {
      if (!data.nodes || data.nodes.length === 0) { mounted = false; return; }
      container.style.height = height;
      createRoot(container).render(
        <ReactFlowProvider>
          <App graphData={data} customHeight={height} />
        </ReactFlowProvider>
      );
    })
    .catch((err) => { mounted = false; console.error('Semantic visualizer fetch error:', err); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

document.addEventListener('htmx:load', mount);
