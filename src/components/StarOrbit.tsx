interface StarOrbitProps {
  starCount?: number
  radius?: number
  period?: number
  showLines?: boolean
  tone?: 'night' | 'paper'
}

export function StarOrbit({
  starCount = 3,
  radius = 12,
  period = 2000,
  showLines = false,
  tone = 'night',
}: StarOrbitProps) {
  const size = radius * 2 + 8
  const isNight = tone === 'night'

  const stars = Array.from({ length: starCount }, (_, i) => ({
    delay: -(i / starCount) * period,
    isEmber: i % 2 === 0,
  }))

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {showLines && (
        <svg
          className="absolute inset-0"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius * 0.7}
            stroke={isNight ? 'rgba(217,119,87,0.1)' : 'rgba(26,26,26,0.15)'}
            strokeWidth="0.5"
            fill="none"
            strokeDasharray="4,4"
          />
        </svg>
      )}
      {stars.map((star, i) => (
        <div
          key={i}
          className={`absolute w-1.5 h-1.5 rounded-full ${star.isEmber ? 'bg-ember/70' : isNight ? 'bg-parchment/50' : 'bg-[#1a1a1a]/50'}`}
          style={{
            top: '50%',
            left: '50%',
            marginTop: -3,
            marginLeft: -3,
            ['--orbit-r' as string]: `${radius}px`,
            animation: `starOrbit ${period}ms linear infinite`,
            animationDelay: `${star.delay}ms`,
          }}
        />
      ))}
    </div>
  )
}
