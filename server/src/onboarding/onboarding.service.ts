import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI } from '@google/genai';
import { GithubService, ONBOARDING_FILE } from '../github/github.service';
import { GenerateOnboardingDto } from './generate-onboarding.dto';
import { COMPANY_CONTEXT, MASTER_PROMPT } from './master-prompt';
import { guideSchema, OnboardingGuide, parseGuide, toMarkdown } from './onboarding-guide';

export interface OnboardingSource {
  repo: string;
  url: string;
  found: boolean;
}

export interface OnboardingResult {
  guide: OnboardingGuide;
  /** The same guide as one Markdown document. */
  markdown: string;
  model: string;
  sources: OnboardingSource[];
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly ai: GoogleGenAI | null;
  private readonly model: string;

  constructor(
    private readonly github: GithubService,
    config: ConfigService,
  ) {
    const apiKey = config.get<string>('GOOGLE_API_KEY');
    // No key still lets the server boot, so GET /repos works; POST /onboarding returns 503.
    this.ai = apiKey
      ? new GoogleGenAI({
          apiKey,
          // true: Vertex AI on Google Cloud (express mode). false: Gemini Developer API.
          vertexai: config.get('GOOGLE_GENAI_USE_VERTEXAI') === 'true',
          // Gemma and Gemini regularly return 500/503 under load; retry 408/429/5xx with backoff.
          httpOptions: { retryOptions: { attempts: 3 } },
        })
      : null;
    this.model = config.get('LLM_MODEL', 'gemma-4-31b-it');
  }

  async generate(dto: GenerateOnboardingDto): Promise<OnboardingResult> {
    if (!this.ai) {
      throw new ServiceUnavailableException('GOOGLE_API_KEY is not set on the server');
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

    const response = await this.ai.models
      .generateContent({
        model: this.model,
        contents: this.buildContext(dto, found),
        config: {
          systemInstruction: MASTER_PROMPT,
          // The model returns the guide's sections as JSON so the web app can lay each one out.
          responseMimeType: 'application/json',
          responseJsonSchema: guideSchema(found.map(({ repo }) => repo.split('/')[1])),
        },
      })
      .catch((err: unknown) => {
        const detail = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
        throw new BadGatewayException(`LLM request failed: ${detail}`);
      });

    const guide = parseGuide(response.text ?? '');
    if (!guide) {
      this.logger.warn(`Unreadable guide from ${this.model}: ${(response.text ?? '').slice(0, 500)}`);
      throw new BadGatewayException('The model returned a guide DevVision could not read. Try generating it again.');
    }

    return {
      guide,
      markdown: toMarkdown(guide),
      model: response.modelVersion ?? this.model,
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
