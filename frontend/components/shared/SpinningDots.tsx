type SpinningDotsProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const dotSizes = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export default function SpinningDots({ size = 'md', className = '' }: SpinningDotsProps) {
  const dot = dotSizes[size];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dot} rounded-full bg-current animate-dot-bounce`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
