import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-neutral-900 bg-neutral-900 text-white [a&]:hover:bg-neutral-800",
        secondary:
          "border-neutral-300 bg-neutral-100 text-neutral-900 [a&]:hover:bg-neutral-200",
        destructive:
          "border-neutral-900 bg-white text-neutral-900 [a&]:hover:bg-neutral-100",
        outline:
          "border-neutral-900 bg-white text-neutral-900 [a&]:hover:bg-neutral-900 [a&]:hover:text-white",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
