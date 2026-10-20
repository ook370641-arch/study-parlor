export function StarRating({ value, onChange, size = 12 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span data-testid="star-rating" style={{ letterSpacing: 1, fontSize: size }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} data-testid={`star-${n}`}
          onClick={onChange ? () => onChange(n === value ? 0 : n) : undefined}
          style={{ cursor: onChange ? 'pointer' : 'default', color: n <= value ? '#d97757' : 'rgba(232,213,183,.18)' }}>
          {n <= value ? '★' : (onChange ? '☆' : '★')}
        </span>
      ))}
    </span>
  )
}
