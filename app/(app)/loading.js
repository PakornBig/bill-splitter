// แสดงทันทีระหว่างรอข้อมูลของหน้าถัดไป
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">กำลังโหลด...</span>

      <div className="space-y-2">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="skeleton h-5 w-36" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-6 w-20" />
          </div>
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
