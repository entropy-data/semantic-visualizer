import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

function mount() {
  const container = document.getElementById('semantic-visualizer');
  if (!container) return;

  const jsonUrl = container.dataset.jsonUrl;
  const height = container.dataset.height || '400px';

  if (!jsonUrl) return;

  fetch(jsonUrl, { credentials: 'same-origin' })
    .then((res) => res.json())
    .then((data) => {
      if (!data.nodes || data.nodes.length === 0) return;
      container.style.height = height;
      createRoot(container).render(<App graphData={data} />);
    })
    .catch((err) => console.error('Semantic visualizer fetch error:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

document.addEventListener('htmx:load', mount);
