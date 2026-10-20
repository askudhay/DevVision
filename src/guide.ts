/** Shapes returned by the DevVision server's POST /onboarding. */

/** Mirrors OnboardingGuide in server/src/onboarding/onboarding-guide.ts. */
export interface Guide {
  title: string;
  welcome: string;
  architecture: { summary: string; diagram: string };
  repos: RepoGuide[];
  firstWeek: string[];
  glossary: { term: string; definition: string }[];
  gaps: { topic: string; detail: string }[];
}

export interface RepoGuide {
  name: string;
  purpose: string;
  stack: string[];
  setup: { step: string; command?: string }[];
  gotchas: { title: string; detail: string }[];
}

export interface GuideSource {
  repo: string;
  url: string;
  found: boolean;
}

/** "https://github.com/owner/repo" or "owner/repo" -> "repo" */
export const repoName = (repo: string) => repo.replace(/\/+$/, '').split('/').pop() || repo;
