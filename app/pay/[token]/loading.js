export default function Loading() {
  return (
    <main role="status" aria-live="polite" className="mx-auto max-w-md px-4 py-8 space-y-4">
      <span className="sr-only">กำลังโหลด...</span>
      <div className="flex flex-col items-center gap-2">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-9 w-32" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card flex justify-between !py-3">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-5 w-16" />
        </div>
      ))}
    </main>
  );
}
