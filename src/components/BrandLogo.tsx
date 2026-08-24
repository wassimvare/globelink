import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src="/brand/globelink-logo.png"
      alt="Logo GlobeLink"
      className={cn("block object-contain", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}
