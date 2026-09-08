// How a branch's changes are marked up. Kept out of the node
// components because edges carry the same three states and must match them.
//
// Deliberately not a recolour of the element itself: colour already encodes
// concept type (entity/property/...), so diff state is a ring and a word on
// nodes, and stroke colour on edges — which have no type colour of their own.
export const DIFF_STYLES = {
  add: { color: '#16a34a', label: 'added', symbol: '+' },      // green-600
  modify: { color: '#d97706', label: 'edited', symbol: '~' },  // amber-600
  remove: { color: '#dc2626', label: 'removed', symbol: '−' }, // red-600
  // Main changed the element too: the thing to notice before the change itself. Amber like an
  // edit, told apart by the mark.
  conflict: { color: '#d97706', label: 'conflicted', symbol: '!' },
};
