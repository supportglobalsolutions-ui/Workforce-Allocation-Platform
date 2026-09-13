import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Apple touch icon from the Global Solutions // mark */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#010e0b',
          borderRadius: 36,
        }}
      >
        <svg width="110" height="110" viewBox="0 0 36 36" fill="none">
          <path
            d="M9 25L21 11"
            stroke="#0df5c4"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M15 29L27 15"
            stroke="#10e7b2"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
