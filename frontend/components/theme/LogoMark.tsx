import Image from 'next/image';

const SIZES = { sm: 32, md: 40, lg: 72, xl: 88 };

/** Icon-only logo mark (cropped from the full splash asset — no tagline/text) */
export default function LogoMark({
  size = 'md',
  priority = false,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  priority?: boolean;
}) {
  const px = SIZES[size];

  return (
    <Image
      src="/images/logo-mark.png"
      alt="GlobalSolutions"
      width={px}
      height={px}
      priority={priority}
      className="rounded-xl shrink-0"
    />
  );
}
