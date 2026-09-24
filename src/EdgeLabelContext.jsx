import { createContext } from 'react';

// Shared between App (which places the edge labels and knows what is hovered or selected) and
// FloatingEdge (which draws each label at its spot, or leaves out a hidden one unless revealed).
export const EdgeLabelContext = createContext({
  placements: null,
  revealed: new Set(),
});
