import { Skeleton } from '@stevederico/skateboard-ui/ui/skeleton';

/**
 * Loading placeholder that mirrors HomeView + SectionCards layout.
 * Used as the Suspense fallback for the lazy HomeView chunk so the
 * main content area never flashes a centered spinner.
 *
 * @returns Dashboard-shaped skeleton inside the layout inset
 */
export default function HomeViewSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="flex h-(--header-height) shrink-0 items-center px-4 lg:px-6">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="h-px bg-border" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-xl border border-border p-6"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
