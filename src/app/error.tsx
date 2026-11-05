'use client';

import { Button } from '@/ui/components/button';
import { errorMessage, strings } from '@/ui/strings';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid h-dvh place-items-center px-6">
      <section role="alert" className="max-w-[440px]">
        <h1 className="font-read text-[26px] leading-[1.2] font-normal">{strings.errors.title}</h1>
        <p className="mt-3 text-muted">{errorMessage('unknown')}</p>
        <Button variant="outline" size="lg" className="mt-6" onClick={reset}>
          {strings.errors.retry}
        </Button>
      </section>
    </main>
  );
}
