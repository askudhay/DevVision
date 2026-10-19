import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GithubService, ONBOARDING_FILE } from '../github/github.service';
import { GenerateOnboardingDto } from './generate-onboarding.dto';
import { COMPANY_CONTEXT, MASTER_PROMPT } from './master-prompt';

export interface OnboardingSource {
  repo: string;
  url: string;
  found: boolean;
}

export interface OnboardingResult {
  onboarding: string;
  model: string;
  sources: OnboardingSource[];
}

@Injectable()
export class OnboardingService {
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly github: GithubService,
    config: ConfigService,
  ) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    // No key still lets the server boot, so GET /repos works; POST /onboarding returns 503.
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = config.get('OPENAI_MODEL', 'gpt-5.4-mini');
  }

  async generate(dto: GenerateOnboardingDto): Promise<OnboardingResult> {
    if (!this.openai) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not set on the server');
    }

    const repos = [...new Set(dto.repos.map((repo) => this.github.toFullName(repo)))];
    const files = await Promise.all(
      repos.map(async (repo) => ({ repo, content: await this.github.getOnboardingFile(repo) })),
    );

    const sources = files.map(({ repo, content }) => ({
      repo,
      url: `https://github.com/${repo}/blob/HEAD/${ONBOARDING_FILE}`,
      found: content !== null,
    }));
    const found = files.filter((file): file is { repo: string; content: string } => file.content !== null);
    if (found.length === 0) {
      throw new NotFoundException({
        message: `None of the selected repos has an ${ONBOARDING_FILE} in its root folder`,
        sources,
      });
    }

    const completion = await this.openai.chat.completions
      .create({
        model: this.model,
        messages: [
          { role: 'system', content: MASTER_PROMPT },
          { role: 'user', content: this.buildContext(dto, found) },
        ],
      })
      .catch((err: unknown) => {
        const detail = err instanceof OpenAI.APIError ? `${err.status} ${err.message}` : String(err);
        throw new BadGatewayException(`LLM request failed: ${detail}`);
      });

    return {
      onboarding: completion.choices[0]?.message.content ?? '',
      model: completion.model,
      sources,
    };
  }

  private buildContext(
    { developerName, department }: GenerateOnboardingDto,
    files: { repo: string; content: string }[],
  ): string {
    const newHire = [
      developerName && `Name: ${developerName}`,
      department && `Team: ${department}`,
    ].filter(Boolean);

    return [
      `<company_context>\n${COMPANY_CONTEXT}\n</company_context>`,
      `<new_hire>\n${newHire.join('\n')}\n</new_hire>`,
      ...files.map(({ repo, content }) => `<repository name="${repo}">\n${content.trim()}\n</repository>`),
    ].join('\n\n');
  }
}
