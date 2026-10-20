/**
 * The onboarding guide as structured data, so the web app can lay out each section on its own.
 * Text fields may contain inline Markdown (`code`, **bold**, links) but no block Markdown.
 */
export interface OnboardingGuide {
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

const text = (description: string) => ({ type: 'string', description });
const list = (description: string, items: object) => ({ type: 'array', description, items });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
});

/**
 * Passed to the model as `responseJsonSchema`. The descriptions set each field's format;
 * MASTER_PROMPT says what goes in each section. `repos` must hold exactly one entry per repo
 * name given, so the model can't skip or rename one.
 */
export const guideSchema = (repoNames: string[]) =>
  object({
    title: text('Plain-text title, e.g. "Onboarding guide: Backend & Platform".'),
    welcome: text('The Welcome section: two or three sentences.'),
    architecture: object({
      summary: text('One short paragraph.'),
      diagram: text(
        'Mermaid "graph TD" source without a code fence. Quote every node label, e.g. API["crewclaro-api"]. Empty string when only one repo is assigned.',
      ),
    }),
    repos: {
      ...list(
        'One entry per assigned repo, in the order given.',
        object({
          name: { ...text('The repo name.'), enum: repoNames },
          purpose: text('One sentence.'),
          stack: list(
            'One language, framework or service per item, with its version if the source gives one, e.g. "Next.js 15". Plain text.',
            { type: 'string' },
          ),
          setup: list(
            'Steps to run the repo locally, in order.',
            object(
              {
                step: text('What the step does, in a few words, e.g. "Install dependencies".'),
                command: text('The exact shell command, copied from the source. Omit it when the step has no command.'),
              },
              ['step'],
            ),
          ),
          gotchas: list(
            'Conventions and pitfalls.',
            object({ title: text('Two to four words, e.g. "Contract sync".'), detail: text('One or two sentences.') }),
          ),
        }),
      ),
      minItems: repoNames.length,
      maxItems: repoNames.length,
    },
    firstWeek: list('Checklist items, one sentence each.', { type: 'string' }),
    glossary: list('Terms in alphabetical order.', object({ term: text('The term.'), definition: text('One sentence.') })),
    gaps: list('Missing documentation.', object({ topic: text('Two to four words.'), detail: text('One sentence.') })),
  });

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const items = <T>(value: unknown, map: (item: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.map(map).filter((item): item is T => item !== null) : [];
const unfence = (value: string) => value.replace(/^```[\w-]*\s*\n/, '').replace(/\n\s*```$/, '').trim();

/**
 * Reads the model's reply into a guide, dropping malformed entries.
 * Returns null when the reply isn't JSON or has no content to show.
 */
export function parseGuide(reply: string): OnboardingGuide | null {
  let data: unknown;
  try {
    // JSON mode returns bare JSON, but some models still wrap it in a ```json fence.
    data = JSON.parse(unfence(reply.trim()));
  } catch {
    return null;
  }
  if (!isObject(data)) return null;

  const architecture = isObject(data.architecture) ? data.architecture : {};
  const guide: OnboardingGuide = {
    title: str(data.title) || 'Onboarding guide',
    welcome: str(data.welcome),
    architecture: { summary: str(architecture.summary), diagram: unfence(str(architecture.diagram)) },
    repos: items(data.repos, (repo) =>
      isObject(repo) && str(repo.name)
        ? {
            name: str(repo.name),
            purpose: str(repo.purpose),
            stack: items(repo.stack, (entry) => str(entry).replaceAll('`', '') || null),
            setup: items(repo.setup, (entry) => {
              if (!isObject(entry)) return null;
              const step = str(entry.step);
              const command = unfence(str(entry.command)).replace(/^`|`$/g, '');
              if (!step && !command) return null;
              return command ? { step, command } : { step };
            }),
            gotchas: items(repo.gotchas, (entry) =>
              isObject(entry) && str(entry.detail) ? { title: str(entry.title), detail: str(entry.detail) } : null,
            ),
          }
        : null,
    ),
    firstWeek: items(data.firstWeek, (task) => str(task) || null),
    glossary: items(data.glossary, (entry) =>
      isObject(entry) && str(entry.term) ? { term: str(entry.term), definition: str(entry.definition) } : null,
    ),
    gaps: items(data.gaps, (entry) =>
      isObject(entry) && str(entry.detail) ? { topic: str(entry.topic), detail: str(entry.detail) } : null,
    ),
  };
  return guide.repos.length > 0 || guide.welcome ? guide : null;
}

const labelled = (label: string, detail: string) => (label ? `**${label}:** ${detail}` : detail);

/** The guide as one Markdown document, for "Copy Markdown" and API clients that want text. */
export function toMarkdown(guide: OnboardingGuide): string {
  const { architecture } = guide;
  const sections = [`# ${guide.title}`, `## Welcome\n\n${guide.welcome}`];

  const pieces = [architecture.summary, architecture.diagram && `\`\`\`mermaid\n${architecture.diagram}\n\`\`\``];
  sections.push(['## How the pieces fit together', ...pieces.filter(Boolean)].join('\n\n'));

  sections.push('## Repo by repo');
  for (const repo of guide.repos) {
    const parts = [`### ${repo.name}`, repo.purpose];
    if (repo.stack.length) parts.push(`**Stack:** ${repo.stack.join(', ')}`);
    if (repo.setup.length) {
      const steps = repo.setup.map(({ step, command }, i) =>
        [`${i + 1}. ${step || 'Run'}`, command && `\n   \`\`\`bash\n   ${command.replaceAll('\n', '\n   ')}\n   \`\`\``]
          .filter(Boolean)
          .join('\n'),
      );
      parts.push(`**Run it locally:**\n\n${steps.join('\n')}`);
    }
    if (repo.gotchas.length) {
      parts.push(`**Conventions & gotchas:**\n\n${repo.gotchas.map((g) => `- ${labelled(g.title, g.detail)}`).join('\n')}`);
    }
    sections.push(parts.filter(Boolean).join('\n\n'));
  }

  if (guide.firstWeek.length) {
    sections.push(`## Your first week\n\n${guide.firstWeek.map((task) => `- [ ] ${task}`).join('\n')}`);
  }
  if (guide.glossary.length) {
    const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
    const rows = guide.glossary.map(({ term, definition }) => `| ${cell(term)} | ${cell(definition)} |`);
    sections.push(`## Glossary\n\n| Term | Definition |\n|---|---|\n${rows.join('\n')}`);
  }
  if (guide.gaps.length) {
    sections.push(`## Gaps in the docs\n\n${guide.gaps.map((g) => `- ${labelled(g.topic, g.detail)}`).join('\n')}`);
  }
  return `${sections.join('\n\n')}\n`;
}
