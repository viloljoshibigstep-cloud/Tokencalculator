"use client";

import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-lg px-4 text-sm",
          "transition-colors placeholder:text-[var(--muted-foreground)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
