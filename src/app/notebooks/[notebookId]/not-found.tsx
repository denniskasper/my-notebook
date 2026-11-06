import Link from 'next/link';

import { strings } from '@/ui/strings';

export default function NotebookNotFound() {
  return (
    <main className="grid h-dvh place-items-center px-6">
      <section className="max-w-[440px]">
        <h1 className="font-read text-[26px] leading-[1.2] font-normal">
          {strings.notFound.title}
        </h1>
        <p className="mt-3 text-muted">{strings.notFound.body}</p>
        <Link href="/" className="mt-6 inline-block text-text underline underline-offset-4">
          {strings.notFound.back}
        </Link>
      </section>
    </main>
  );
}
