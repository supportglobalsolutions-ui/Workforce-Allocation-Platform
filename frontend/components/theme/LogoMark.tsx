import Image from 'next/image';

const SIZES = { sm: 32, md: 40, lg: 64 };

export default function LogoMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const px = SIZES[size];
  return (
    <Image
      src="/images/logo.png"
      alt="GlobalSolutions"
      width={px}
      height={px}
      className="rounded-xl shrink-0"
    />
  );
}
