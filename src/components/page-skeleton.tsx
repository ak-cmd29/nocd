export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-1 flex-col">
      <div className="h-[73px] border-b border-slate-200 bg-white" />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-10">
        <div className="h-8 w-72 animate-pulse rounded-md bg-slate-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-slate-200" />
        <div className="h-44 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    </div>
  );
}
