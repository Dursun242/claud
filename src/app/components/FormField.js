'use client'

/**
 * Composant FormField (FF) réutilisable
 * Wrapper pour label + input/select/textarea
 */
export default function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: '#64748B',
          marginBottom: 3,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Styles réutilisables pour formulaires
 */
export const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export const selectStyle = {
  ...inputStyle,
  background: '#fff',
};

export const btnPrimaryStyle = {
  padding: '10px 18px',
  background: '#1E3A5F',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export const btnSecondaryStyle = {
  ...btnPrimaryStyle,
  background: '#F1F5F9',
  color: '#475569',
};
