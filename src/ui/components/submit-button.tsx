'use client';

import { useFormStatus } from 'react-dom';

import { Button, type ButtonProps } from './button';

/** A form's submit button that disables itself while the Server Action runs. */
export function SubmitButton({ disabled, ...props }: Omit<ButtonProps, 'type'>) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props} />;
}
