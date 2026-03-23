import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

// Matches old .badge design system — square corners, Manrope, uppercase
const badgeVariants = cva(
  "inline-flex items-center gap-1 px-[9px] h-[22px] rounded-[3px] text-[10px] !font-bold uppercase tracking-[0.05em] whitespace-nowrap font-['Manrope'] border border-transparent",
  {
    variants: {
      variant: {
        default:     "bg-[#0f172a] text-white",
        secondary:   "bg-[#f4f2f6] text-[#374151] border-[#e8e3ea]",
        outline:     "border-[#e8e3ea] text-[#374151]",
        destructive: "bg-[#fff1f2] text-[#be123c] border-[#fecaca]",
        green:       "bg-[#dcfce7] text-[#16a34a] border-[#bbf7d0]",
        amber:       "bg-[#fef9ee] text-[#92400e] border-[#fcd34d]",
        blue:        "bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]",
        navy:        "bg-[#eef2ff] text-[#0f172a] border-[#c7d2fe]",
        red:         "bg-[#fff1f2] text-[#be123c] border-[#fecaca]",
        gray:        "bg-[#f4f2f6] text-[#374151] border-[#e8e3ea]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
