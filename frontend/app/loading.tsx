export default function Loading() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden bg-emerald-accent/10">
      <div className="h-full w-1/3 bg-emerald-accent animate-[landing-shimmer_1s_ease-in-out_infinite]" />
    </div>
  );
}
