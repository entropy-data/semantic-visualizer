// How a change request's proposed changes are marked up. Kept out of the node
// components because edges carry the same three states and must match them.
//
// Deliberately not a recolour of the element itself: colour already encodes
// concept type (entity/property/...), so diff state is a ring and a badge on
// nodes, and stroke colour on edges — which have no type colour of their own.
export const DIFF_STYLES = {
  add: { color: '#16a34a', label: 'added', symbol: '+' },      // green-600
  modify: { color: '#d97706', label: 'changed', symbol: '~' }, // amber-600
  remove: { color: '#dc2626', label: 'removed', symbol: '−' }, // red-600
};
