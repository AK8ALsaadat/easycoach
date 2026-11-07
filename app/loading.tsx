export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl p-8" aria-busy="true">
      <p role="status" className="mb-6 text-lg font-semibold">
        نجهّز مساحتك…
      </p>
      <div className="grid gap-5 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="card h-40 animate-pulse bg-white" />
        ))}
      </div>
    </main>
  );
}
