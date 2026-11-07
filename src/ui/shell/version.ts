export type BuildInfo = { version: string; commit: string };

const REPOSITORY_URL = 'https://github.com/denniskasper/my-notebook';
// `COMMIT` is `unknown` locally; anything that isn't a commit id must not end up in a link.
const COMMIT_ID = /^[0-9a-f]{7,40}$/i;

/** The sidebar's version label: `v<version> · <short commit>`, linked to the commit when known. */
export function versionLabel({ version, commit }: BuildInfo): {
  text: string;
  href: string | null;
} {
  if (!COMMIT_ID.test(commit)) return { text: `v${version}`, href: null };
  return {
    text: `v${version} · ${commit.slice(0, 7)}`,
    href: `${REPOSITORY_URL}/commit/${commit}`,
  };
}
