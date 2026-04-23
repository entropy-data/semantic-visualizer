import { createContext } from 'react';

// Shared between App (which owns collapse state) and GroupNode (which renders
// collapsed/expanded and triggers toggles from clicks on the group label).
export const GroupActionsContext = createContext({
  toggleCollapse: () => {},
  collapsedSet: new Set(),
});
