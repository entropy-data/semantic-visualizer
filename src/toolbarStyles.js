// Shared look for the top-right toolbar buttons (App.jsx, NamespaceFilter.jsx).
export const toggleBtnStyle = (active) => ({
  borderRadius: 4,
  background: active ? '#eef2ff' : '#fff',
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 500,
  color: active ? '#4f46e5' : '#374151',
  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
  border: `1px solid ${active ? '#a5b4fc' : '#d1d5db'}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
});
