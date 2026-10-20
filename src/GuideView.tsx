import { useEffect, useId, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookA,
  Check,
  CircleHelp,
  Copy,
  ExternalLink,
  FolderGit2,
  Lightbulb,
  ListChecks,
  Network,
  SquareTerminal,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { repoName, type Guide, type GuideSource, type RepoGuide } from './guide';

type Mermaid = typeof import('mermaid').default;
let mermaidLoader: Promise<Mermaid> | undefined;

// Mermaid is large, so it's only downloaded when a guide contains a diagram.
function loadMermaid(): Promise<Mermaid> {
  mermaidLoader ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        darkMode: true,
        background: '#0f172a',
        primaryColor: '#1e293b',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#38bdf8',
        secondaryColor: '#1e293b',
        tertiaryColor: '#0f172a',
        lineColor: '#64748b',
        edgeLabelBackground: '#1e293b',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
      },
    });
    return mermaid;
  });
  return mermaidLoader;
}

// Models often leave characters like "@" in unquoted node labels (`Types[@crewclaro/api-types]`),
// which Mermaid rejects. Quoting plain [labels] fixes most of these; shapes like [(db)] are left alone.
const quoteLabels = (source: string) => source.replace(/\[(?![(["/\\])([^\]\n]+)\]/g, '["$1"]');

function MermaidDiagram({ source }: { source: string }) {
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`;
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadMermaid()
      .then(async (mermaid) => {
        // Try the diagram as written, then with quoted labels. If neither parses, show the source
        // rather than Mermaid's error graphic.
        let diagram: string | undefined;
        for (const candidate of [source, quoteLabels(source)]) {
          if (await mermaid.parse(candidate, { suppressErrors: true })) {
            diagram = candidate;
            break;
          }
        }
        if (!diagram) throw new Error('Invalid Mermaid');
        const { svg } = await mermaid.render(id, diagram);
        if (active) setSvg(svg);
      })
      .catch((err: unknown) => {
        console.warn('Could not draw Mermaid diagram, showing its source instead', err);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id, source]);

  if (failed) {
    return (
      <pre className="og-diagram og-diagram--source">
        <code>{source}</code>
      </pre>
    );
  }
  return svg ? (
    <div className="og-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div className="og-diagram og-diagram--loading">Drawing diagram…</div>
  );
}

const link: Components['a'] = ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />;
const proseComponents: Components = { a: link };
// Unwraps the paragraph so short fields can sit inside a list item or label.
const inlineComponents: Components = { a: link, p: ({ children }) => <>{children}</> };

/** A field's inline Markdown (`code`, **bold**, links). `prose` keeps paragraphs for longer fields. */
function Text({ children, prose = false }: { children: string; prose?: boolean }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={prose ? proseComponents : inlineComponents}>
      {children}
    </Markdown>
  );
}

function Section({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="og-card">
      <header className="og-section-head">
        <span className="og-section-icon">
          <Icon size={18} />
        </span>
        <h2>{title}</h2>
        {aside && <span className="og-section-aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="og-icon-button" onClick={copy} aria-label={copied ? 'Copied' : label} title={label}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function RepoCard({ repo, source }: { repo: RepoGuide; source?: GuideSource }) {
  return (
    <article className="og-repo">
      <header className="og-repo-head">
        <h3>
          <FolderGit2 size={16} /> {repo.name}
        </h3>
        {source?.found && (
          <a className="og-repo-link" href={source.url} target="_blank" rel="noreferrer">
            onboarding.md <ExternalLink size={12} />
          </a>
        )}
      </header>
      {repo.purpose && (
        <div className="og-repo-purpose">
          <Text>{repo.purpose}</Text>
        </div>
      )}
      {repo.stack.length > 0 && (
        <ul className="og-stack" aria-label="Stack">
          {repo.stack.map((tech) => (
            <li key={tech}>{tech}</li>
          ))}
        </ul>
      )}

      {repo.setup.length > 0 && (
        <div className="og-repo-block">
          <h4>
            <SquareTerminal size={14} /> Run it locally
          </h4>
          <ol className="og-steps">
            {repo.setup.map(({ step, command }, i) => (
              <li key={i}>
                {step && (
                  <span className="og-step-text">
                    <Text>{step}</Text>
                  </span>
                )}
                {command && (
                  <div className="og-command">
                    <code>{command}</code>
                    <CopyButton text={command} label="Copy command" />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {repo.gotchas.length > 0 && (
        <div className="og-repo-block">
          <h4>
            <TriangleAlert size={14} /> Conventions & gotchas
          </h4>
          <ul className="og-gotchas">
            {repo.gotchas.map(({ title, detail }, i) => (
              <li key={i}>
                {title && <strong>{title}</strong>}
                <span>
                  <Text>{detail}</Text>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function FirstWeek({ tasks }: { tasks: string[] }) {
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const toggle = (index: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <Section
      icon={ListChecks}
      title="Your first week"
      aside={
        <span className="og-progress" aria-label={`${done.size} of ${tasks.length} done`}>
          <span className="og-progress-bar">
            <span style={{ width: `${(done.size / tasks.length) * 100}%` }} />
          </span>
          {done.size}/{tasks.length}
        </span>
      }
    >
      <ul className="og-checklist">
        {tasks.map((task, i) => (
          <li key={i} className={done.has(i) ? 'og-done' : undefined}>
            <label>
              <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
              <span>
                <Text>{task}</Text>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function GuideView({ guide, sources }: { guide: Guide; sources: GuideSource[] }) {
  const { architecture } = guide;
  const sourceFor = (name: string) => sources.find((source) => repoName(source.repo) === repoName(name));

  return (
    <div className="og-guide">
      <header className="og-card og-hero">
        <span className="og-eyebrow">Onboarding guide</span>
        <h1>{guide.title}</h1>
        {guide.welcome && (
          <div className="og-prose">
            <Text prose>{guide.welcome}</Text>
          </div>
        )}
      </header>

      {(architecture.summary || architecture.diagram) && (
        <Section icon={Network} title="How the pieces fit together">
          {architecture.summary && (
            <div className="og-prose">
              <Text prose>{architecture.summary}</Text>
            </div>
          )}
          {architecture.diagram && <MermaidDiagram source={architecture.diagram} />}
        </Section>
      )}

      {guide.repos.length > 0 && (
        <Section icon={FolderGit2} title="Repo by repo" aside={`${guide.repos.length} ${guide.repos.length === 1 ? 'repo' : 'repos'}`}>
          <div className="og-repos">
            {guide.repos.map((repo) => (
              <RepoCard key={repo.name} repo={repo} source={sourceFor(repo.name)} />
            ))}
          </div>
        </Section>
      )}

      {guide.firstWeek.length > 0 && <FirstWeek tasks={guide.firstWeek} />}

      {guide.glossary.length > 0 && (
        <Section icon={BookA} title="Glossary">
          <dl className="og-glossary">
            {guide.glossary.map(({ term, definition }) => (
              <div key={term}>
                <dt>
                  <Text>{term}</Text>
                </dt>
                <dd>
                  <Text>{definition}</Text>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {guide.gaps.length > 0 && (
        <Section icon={CircleHelp} title="Gaps in the docs">
          <p className="og-section-note">
            <Lightbulb size={14} /> Not covered by any onboarding.md yet. Ask the team, then add the answer to the docs.
          </p>
          <ul className="og-gaps">
            {guide.gaps.map(({ topic, detail }, i) => (
              <li key={i}>
                {topic && <strong>{topic}</strong>}
                <span>
                  <Text>{detail}</Text>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
