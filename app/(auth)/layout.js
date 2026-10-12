export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">💸 หารบิล</h1>
          <p className="text-sm text-slate-500 mt-1">
            หารบิลง่าย ติดตามยอดคงค้างได้
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
