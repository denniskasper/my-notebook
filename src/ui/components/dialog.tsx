'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/ui/cn';

// shadcn/ui dialog, re-cut for variant D: raised panel, hairline border.
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 motion-safe:animate-[fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[600px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-panel shadow-[0_24px_60px_rgb(0_0_0/0.45)] outline-none motion-safe:animate-[dialog-in_180ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn('text-[14px] font-semibold', className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-1 text-[12.5px] leading-normal text-muted', className)}
      {...props}
    />
  );
}
