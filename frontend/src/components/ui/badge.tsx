import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        cream:
          "bg-[var(--bg-subtle)] text-[var(--fg)] border border-[var(--border)]",
        olive:
          "bg-[var(--accent-sage-soft)] text-[var(--accent-sage-text)] border border-[var(--accent-sage-border)]",
        terracotta:
          "bg-[var(--accent-cta-bg)] text-[var(--accent-cta-fg)]",
      },
    },
    defaultVariants: {
      variant: "cream",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
