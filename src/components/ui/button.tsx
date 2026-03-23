import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

// Matches old .btn design system — square corners, Manrope, uppercase
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[3px] font-['Manrope'] font-bold text-[11px] uppercase tracking-[0.07em] whitespace-nowrap border border-transparent transition-all duration-[0.14s] cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        // Primary — navy (.btn-primary)
        default:     "bg-[#0f172a] text-white border-[#0f172a] hover:bg-[#1d3a6b] hover:border-[#1d3a6b] active:bg-[#162f59]",
        // Secondary — white with border (.btn-secondary)
        outline:     "bg-white text-[#374151] border-[#e8e3ea] hover:bg-[#f4f2f6] hover:border-[#e8e3ea]",
        // Ghost (.btn-ghost)
        ghost:       "bg-transparent text-[#374151] border-[#e8e3ea] hover:bg-[#f4f2f6] hover:text-[#0f172a]",
        // Danger (.btn-danger)
        destructive: "bg-[#fff1f2] text-[#dc2626] border-[#fecaca] hover:bg-[#fecaca] hover:border-[#fca5a5]",
        secondary:   "bg-[#f8f7f9] text-[#374151] border-[#e8e3ea] hover:bg-[#f4f2f6]",
        link:        "text-[#0f172a] underline-offset-4 hover:underline border-transparent bg-transparent",
      },
      size: {
        default: "h-[34px] px-[14px]",       // .btn-sm equivalent (most common)
        sm:      "h-[34px] px-[14px]",        // .btn-sm
        xs:      "h-[28px] px-[11px] text-[10px]", // .btn-xs
        lg:      "h-[42px] px-[22px] text-[12px]", // .btn-lg
        icon:    "h-[34px] w-[34px] p-0",
        "icon-xs": "h-[28px] w-[28px] p-0 text-[10px]",
        "icon-sm": "h-[34px] w-[34px] p-0",
        "icon-lg": "h-[42px] w-[42px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
