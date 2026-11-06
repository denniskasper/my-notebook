'use client';

import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/ui/cn';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 rounded-lg border border-line bg-raise p-1 shadow-[0_12px_30px_rgb(0_0_0/0.35)]',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex h-7 cursor-default items-center gap-2 rounded-[5px] px-2 text-text outline-none select-none data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('mx-1 my-1 h-px bg-line', className)} {...props} />;
}
