import { useEffect, useState } from 'react';
import { Check, Copy, FileText, RefreshCw, TriangleAlert } from 'lucide-react';
import GuideView from './GuideView';
import { repoName, type Guide, type GuideSource } from './guide';
import './OnboardingGuide.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface OnboardingResult {
  guide: Guide;
  /** The same guide as one Markdown document, for "Copy Markdown". */
  markdown: string;
  model: string;
  sources: GuideSource[];
}

interface OnboardingRequest {
  repos: string[];
  developerName?: string;
  department?: string;
}

class OnboardingError extends Error {
  sources?: GuideSource[];

  constructor(message: string, sources?: GuideSource[]) {
    super(message);
    this.sources = sources;
  }
}

async function postOnboarding(body: OnboardingRequest): Promise<OnboardingResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OnboardingError(`Can't reach the DevVision server at ${API_URL}. Is it running?`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Nest puts the reason in `message` (an array for validation errors); a 404 also lists the sources.
    const message = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
    throw new OnboardingError(message || `The server returned ${res.status}.`, data?.sources);
  }
  if (!data?.guide) {
    throw new OnboardingError('The server sent a guide in an older format. Restart the DevVision server and try again.');
  }
  return data as OnboardingResult;
}

// A guide takes a minute or two to generate, so keep one request per input. This stops
// StrictMode's double mount, and switching tabs, from starting a second LLM call.
const requests = new Map<string, Promise<OnboardingResult>>();

function requestOnboarding(body: OnboardingRequest, refresh: boolean): Promise<OnboardingResult> {
  const key = JSON.stringify(body);
  const cached = requests.get(key);
  if (cached && !refresh) return cached;

  const request = postOnboarding(body);
  requests.set(key, request);
  // Failures aren't cached, so the next attempt asks the server again.
  request.catch(() => {
    if (requests.get(key) === request) requests.delete(key);
  });
  return request;
}

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function SourceList({ sources }: { sources: GuideSource[] }) {
  return (
    <div className="og-sources">
      {sources.map(({ repo, url, found }) => (
        <a
          key={repo}
          href={found ? url : `https://github.com/${repo}`}
          target="_blank"
          rel="noreferrer"
          className={`og-source ${found ? 'og-source--found' : 'og-source--missing'}`}
          title={found ? `Built from ${repo}/onboarding.md` : `${repo} has no onboarding.md in its root folder`}
        >
          {found ? <FileText size={13} /> : <TriangleAlert size={13} />}
          {repoName(repo)}
          {!found && <span className="og-source-note">no onboarding.md</span>}
        </a>
      ))}
    </div>
  );
}

type GuideState =
  | { status: 'loading' }
  | { status: 'done'; result: OnboardingResult }
  | { status: 'error'; message: string; sources?: GuideSource[] };

interface OnboardingGuideProps {
  repos: string[];
  developerName?: string;
  department?: string;
}

export default function OnboardingGuide({ repos, developerName, department }: OnboardingGuideProps) {
  const [state, setState] = useState<GuideState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [copied, setCopied] = useState(false);
  const reposKey = repos.join(',');
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));

  useEffect(() => {
    let active = true;
    requestOnboarding({ repos: reposKey.split(','), developerName, department }, attempt > 0)
      .then((result) => {
        if (active) setState({ status: 'done', result });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          sources: err instanceof OnboardingError ? err.sources : undefined,
        });
      });
    return () => {
      active = false;
    };
  }, [reposKey, developerName, department, attempt]);

  useEffect(() => {
    if (state.status !== 'loading') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.status]);

  // Asks the server again, ignoring the cached guide.
  const regenerate = () => {
    const time = Date.now();
    setState({ status: 'loading' });
    setStartedAt(time);
    setNow(time);
    setAttempt((n) => n + 1);
  };

  const copyMarkdown = (markdown: string) => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="og-page">
      <div className="og-column">
        {state.status === 'loading' && (
          <section className="og-status">
            <RefreshCw size={28} color="#38bdf8" className="og-spin" />
            <h2>Writing your onboarding guide…</h2>
            <p>
              DevVision is reading the <code>onboarding.md</code> in{' '}
              {repos.length === 1 ? 'your repository' : `your ${repos.length} repositories`} and turning{' '}
              {repos.length === 1 ? 'it' : 'them'} into one guide{developerName ? ` for ${developerName}` : ''}. This
              usually takes one to two minutes.
            </p>
            <div className="og-sources">
              {repos.map((repo) => (
                <span key={repo} className="og-source">
                  {repoName(repo)}
                </span>
              ))}
            </div>
            <span className="og-elapsed">{formatElapsed(elapsed)}</span>
            <div className="og-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </section>
        )}

        {state.status === 'error' && (
          <section className="og-status">
            <TriangleAlert size={28} color="#f59e0b" />
            <h2>We couldn't generate your onboarding guide</h2>
            <p>{state.message}</p>
            {state.sources && <SourceList sources={state.sources} />}
            <button className="og-button og-button--primary" onClick={regenerate}>
              <RefreshCw size={15} /> Try again
            </button>
          </section>
        )}

        {state.status === 'done' && (
          <>
            <div className="og-toolbar">
              <SourceList sources={state.result.sources} />
              <div className="og-actions">
                <button className="og-button" onClick={() => copyMarkdown(state.result.markdown)}>
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy Markdown'}
                </button>
                <button className="og-button" onClick={regenerate}>
                  <RefreshCw size={15} /> Regenerate
                </button>
              </div>
            </div>
            <GuideView guide={state.result.guide} sources={state.result.sources} />
            <p className="og-footnote">
              Generated by {state.result.model} from each repository's onboarding.md. If something looks off, the
              source docs win.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
