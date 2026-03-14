export default function Badge({ children, color = '#6B7280', textColor = '#FFFFFF', className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${className}`}
      style={{ backgroundColor: color, color: textColor }}
    >
      {children}
    </span>
  );
}
