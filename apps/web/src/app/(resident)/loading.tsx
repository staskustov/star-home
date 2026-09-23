import { Skeleton } from "@/components/ui/Skeleton";

export default function ResidentLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
