import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleBtnStyle } from './toolbarStyles';
import { BADGE_COLORS } from './NamespaceBadge';

const chevron = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * Toolbar dropdown that shows/hides the concepts pulled in from other namespaces, one namespace
 * at a time. A diagram that reaches into many namespaces drowns its own concepts, so the caller
 * hides them all up front past a threshold; this control is how they come back.
 *
 * `namespaces` is [{ name, count }] sorted by the caller; `hidden` is a Set of namespace names.
 */
export default function NamespaceFilter({ namespaces, hidden, onToggle, onSetAll }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const total = namespaces.reduce((sum, ns) => sum + ns.count, 0);
  const shown = namespaces.reduce((sum, ns) => (hidden.has(ns.name) ? sum : sum + ns.count), 0);
  const allHidden = shown === 0;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={toggleBtnStyle(hidden.size > 0)}
        onMouseOver={(e) => { if (hidden.size === 0) e.currentTarget.style.background = '#f9fafb'; }}
        onMouseOut={(e) => { if (hidden.size === 0) e.currentTarget.style.background = '#fff'; }}
        title={t('toolbar.namespaces.title')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {t('toolbar.namespaces.label')}
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#6b7280', fontWeight: 600 }}>
          {shown}/{total}
        </span>
        {chevron}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 10,
            minWidth: 220,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            boxShadow: '0 4px 12px 0 rgba(0,0,0,0.12)',
            padding: 4,
            cursor: 'default',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px 6px',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              {t('toolbar.namespaces.summary', { shown, total })}
            </span>
            <button
              onClick={() => onSetAll(allHidden ? 'show' : 'hide')}
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                fontSize: 11,
                fontWeight: 600,
                color: '#4f46e5',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {allHidden ? t('toolbar.namespaces.showAll') : t('toolbar.namespaces.hideAll')}
            </button>
          </div>
          {namespaces.map((ns) => (
            <label
              key={ns.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 4,
                fontSize: 12,
                color: '#374151',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <input
                type="checkbox"
                checked={!hidden.has(ns.name)}
                onChange={() => onToggle(ns.name)}
                style={{ accentColor: '#4f46e5', cursor: 'pointer', margin: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  color: hidden.has(ns.name) ? '#94a3b8' : BADGE_COLORS.text,
                }}
                title={ns.name}
              >
                {ns.name}
              </span>
              <span style={{ fontSize: 11, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                {ns.count}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
