import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/ui/cn';

// shadcn/ui button, re-cut for variant D: hairline outlines, no shadows.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-text font-medium text-bg hover:bg-white',
        outline: 'border border-line text-muted hover:bg-hover hover:text-text',
        ghost: 'text-muted hover:bg-hover hover:text-text',
        danger: 'text-danger hover:bg-hover',
      },
      size: {
        sm: 'h-6 px-2 text-xs',
        md: 'h-7 px-2.5',
        lg: 'h-9 px-3.5 text-[13.5px]',
        icon: 'size-6 rounded-[5px]',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
