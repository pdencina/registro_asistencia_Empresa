/**
 * Skeleton loading components for professional shimmer states.
 * Used instead of blank screens while data loads.
 */

export function SkeletonLine({ className = '' }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-5 ${className}`}>
      <SkeletonLine className="h-3 w-1/3 mb-3" />
      <SkeletonLine className="h-7 w-2/3" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto animate-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <SkeletonLine className="h-8 w-40" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonLine key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map(i => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <SkeletonLine className="h-4 w-48 mb-4" />
        <div className="flex items-end gap-2 h-40">
          {[40, 65, 80, 55, 90, 70, 45, 85, 60, 75].map((h, i) => (
            <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex gap-8">
          {[1, 2, 3, 4, 5].map(i => (
            <SkeletonLine key={i} className="h-3 w-20" />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="px-5 py-4 border-b border-gray-50 flex items-center gap-4">
            <SkeletonLine className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="h-3.5 w-32" />
              <SkeletonLine className="h-2.5 w-24" />
            </div>
            <SkeletonLine className="h-6 w-16 rounded-full" />
            <SkeletonLine className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AttendanceSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto animate-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <SkeletonLine className="h-7 w-36 mb-2" />
          <SkeletonLine className="h-3.5 w-56" />
        </div>
        <SkeletonLine className="h-10 w-32 rounded-xl" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex gap-3">
        <SkeletonLine className="h-9 w-36 rounded-lg" />
        <SkeletonLine className="h-9 w-36 rounded-lg" />
        <SkeletonLine className="h-9 w-24 rounded-lg" />
      </div>

      {/* Records */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
            <SkeletonLine className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="h-3.5 w-36" />
              <SkeletonLine className="h-2.5 w-24" />
            </div>
            <SkeletonLine className="h-5 w-14 rounded" />
            <SkeletonLine className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex gap-6">
        {[1, 2, 3, 4].map(i => <SkeletonLine key={i} className="h-3 w-20" />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 border-b border-gray-50 flex items-center gap-4">
          <SkeletonLine className="h-8 w-8 rounded-full" />
          <SkeletonLine className="h-3.5 w-28 flex-1" />
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}
