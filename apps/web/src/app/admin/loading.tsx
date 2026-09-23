import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
