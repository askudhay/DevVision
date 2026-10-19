import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const ONBOARDING_FILE = 'onboarding.md';

const GITHUB_API = 'https://api.github.com';
const PAGE_SIZE = 100;

export interface RepoSummary {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
}

interface GithubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
}

@Injectable()
export class GithubService {
  readonly owner: string;
  readonly repoFilter: string;
  private readonly headers: Record<string, string>;

  constructor(config: ConfigService) {
    this.owner = config.get('GITHUB_OWNER', 'jonathan-nobrega');
    this.repoFilter = config.get('GITHUB_REPO_FILTER', 'crewclaro');
    const token = config.get<string>('GITHUB_TOKEN');
    this.headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'devvision-server',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Same result as https://github.com/<owner>?tab=repositories&q=<filter>.
   * The REST API has no name filter for a user's repos, so we page through
   * all of them and match the name here.
   */
  async listRepos(filter = this.repoFilter): Promise<RepoSummary[]> {
    const repos: GithubRepo[] = [];
    for (let page = 1; ; page++) {
      const res = await this.request(
        `/users/${this.owner}/repos?per_page=${PAGE_SIZE}&page=${page}&sort=full_name`,
      );
      const batch = (await res.json()) as GithubRepo[];
      repos.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    const needle = filter.toLowerCase();
    return repos
      .filter((repo) => repo.name.toLowerCase().includes(needle))
      .map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description,
      }));
  }

  /** Raw text of onboarding.md in the repo root, or null if the repo or file doesn't exist. */
  async getOnboardingFile(fullName: string): Promise<string | null> {
    const res = await this.request(`/repos/${fullName}/contents/${ONBOARDING_FILE}`, {
      Accept: 'application/vnd.github.raw+json',
      allow404: true,
    });
    return res.status === 404 ? null : res.text();
  }

  /**
   * Accepts "repo", "owner/repo" or "https://github.com/owner/repo" and returns "owner/repo".
   * A bare repo name is resolved against GITHUB_OWNER.
   */
  toFullName(input: string): string {
    let ref = input.trim().replace(/\/+$/, '').replace(/\.git$/, '');
    const urlMatch = ref.match(/github\.com\/([^/]+\/[^/]+)/);
    if (urlMatch) ref = urlMatch[1];
    else if (!ref.includes('/')) ref = `${this.owner}/${ref}`;

    if (!/^[\w.-]+\/[\w.-]+$/.test(ref)) {
      throw new BadRequestException(`"${input}" is not a GitHub repo name, owner/name or URL`);
    }
    return ref;
  }

  private async request(
    path: string,
    { Accept, allow404 = false }: { Accept?: string; allow404?: boolean } = {},
  ): Promise<Response> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: { ...this.headers, ...(Accept ? { Accept } : {}) },
    });
    if (res.ok || (allow404 && res.status === 404)) return res;

    const rateLimited = res.headers.get('x-ratelimit-remaining') === '0';
    throw new BadGatewayException(
      rateLimited
        ? 'GitHub rate limit reached. Set GITHUB_TOKEN to raise it.'
        : `GitHub returned ${res.status} for ${path}: ${await res.text()}`,
    );
  }
}
