export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <span
        className="motion-blob animate-drift1 absolute -top-40 -left-[120px] w-[520px] h-[520px] rounded-full blur-[70px] opacity-35"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, var(--tw-gradient-stop, #6fa4f2), transparent 70%)',
        }}
      />
      <span
        className="motion-blob animate-drift2 absolute -bottom-36 -right-24 w-[420px] h-[420px] rounded-full blur-[70px] opacity-35"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #2e6fe0, transparent 70%)',
        }}
      />
      <span
        className="motion-blob animate-drift3 absolute top-[40%] left-[60%] w-[300px] h-[300px] rounded-full blur-[70px] opacity-20"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #6fa4f2, transparent 70%)',
        }}
      />
    </div>
  );
}