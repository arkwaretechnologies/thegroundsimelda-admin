import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_WORDMARK } from "@/lib/brand";

const ICON_HEIGHT = {
  sm: 44,
  md: 56,
  lg: 80,
} as const;

type BrandMarkProps = {
  variant?: "icon" | "wordmark";
  size?: keyof typeof ICON_HEIGHT;
  className?: string;
  wordmarkClassName?: string;
};

export function BrandMark({
  variant = "icon",
  size = "sm",
  className,
  wordmarkClassName,
}: BrandMarkProps) {
  const h = ICON_HEIGHT[size];

  if (variant === "wordmark") {
    return (
      <span
        className={cn(
          "font-[family-name:var(--font-display)] font-semibold tracking-tight",
          wordmarkClassName
        )}
      >
        {BRAND_WORDMARK.primary}{" "}
        <span className="text-primary">{BRAND_WORDMARK.accent}</span>
      </span>
    );
  }

  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND_NAME}
      width={Math.round(h * 2.7)}
      height={h}
      className={cn("h-auto w-auto shrink-0", className)}
      style={{ height: h, width: "auto" }}
      priority
    />
  );
}
