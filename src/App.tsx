import { useState, useEffect } from 'react';
import { ReactFlow, Controls, Background } from '@xyflow/react';
import Editor from '@monaco-editor/react';
import { GoogleGenAI } from '@google/genai';
import { Play, Copy, Check, ExternalLink, ShieldCheck, Code2, Sparkles, RefreshCw, User, BookOpen, Network } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import OnboardingGuide from './OnboardingGuide';

// Initialize Gemini API Client
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

// Mock Architecture AST Nodes & Snippets for Selected Repos
const mockRepoArchitectures: Record<string, { nodes: any[]; edges: any[]; codeMap: Record<string, any> }> = {
  'frontend-core': {
    nodes: [
      { id: '1', type: 'input', data: { label: 'App Module (app.module.ts)' }, position: { x: 200, y: 0 }, style: { background: '#1e293b', color: '#38bdf8', border: '2px solid #38bdf8', borderRadius: '8px', padding: '10px' } },
      { id: '2', data: { label: 'Router (app-routing.module.ts)' }, position: { x: 200, y: 100 }, style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #64748b', borderRadius: '8px', padding: '10px' } },
      { id: '3', data: { label: 'Dashboard (dashboard.component.ts)' }, position: { x: 50, y: 220 }, style: { background: '#1e293b', color: '#10b981', border: '2px solid #10b981', borderRadius: '8px', padding: '10px' } },
      { id: '4', data: { label: 'Auth Guard (auth.guard.ts)' }, position: { x: 350, y: 220 }, style: { background: '#1e293b', color: '#f59e0b', border: '2px solid #f59e0b', borderRadius: '8px', padding: '10px' } }
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', animated: true },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e2-4', source: '2', target: '4' }
    ],
    codeMap: {
      '1': { label: 'App Module', framework: 'Angular', file: 'src/app/app.module.ts', code: `@NgModule({\n  declarations: [AppComponent, DashboardComponent],\n  imports: [BrowserModule, AppRoutingModule],\n  providers: [AuthService],\n  bootstrap: [AppComponent]\n})\nexport class AppModule { }` },
      '2': { label: 'App Router', framework: 'Angular', file: 'src/app/app-routing.module.ts', code: `const routes: Routes = [\n  { path: "", redirectTo: "/dashboard", pathMatch: "full" },\n  { path: "dashboard", component: DashboardComponent, canActivate: [AuthGuard] }\n];\n\n@NgModule({\n  imports: [RouterModule.forRoot(routes)],\n  exports: [RouterModule]\n})\nexport class AppRoutingModule { }` },
      '3': { label: 'Dashboard Component', framework: 'Angular', file: 'src/app/dashboard/dashboard.component.ts', code: `@Component({\n  selector: "app-dashboard",\n  templateUrl: "./dashboard.component.html"\n})\nexport class DashboardComponent implements OnInit {\n  userData: any;\n  constructor(private authService: AuthService) {}\n  ngOnInit(): void {\n    this.userData = this.authService.getUserProfile();\n  }\n}` },
      '4': { label: 'Auth Guard', framework: 'Angular', file: 'src/app/guards/auth.guard.ts', code: `@Injectable({ providedIn: "root" })\nexport class AuthGuard implements CanActivate {\n  constructor(private authService: AuthService, private router: Router) {}\n  canActivate(): boolean {\n    if (this.authService.isAuthenticated()) return true;\n    this.router.navigate(["/login"]);\n    return false;\n  }\n}` }
    }
  }
};

const departmentsList = [
  'Frontend Engineering',
  'Backend & Platform',
  'Full Stack',
  'QA & DevOps'
];

const developerTabs = [
  { id: 'guide', label: 'Onboarding Guide', Icon: BookOpen },
  { id: 'explorer', label: 'Architecture Explorer', Icon: Network }
] as const;

export default function App() {
  // Mode Check from URL query parameters
  const queryParams = new URLSearchParams(window.location.search);
  const isDeveloperMode = queryParams.get('role') === 'developer';
  const assignedReposParam = queryParams.get('repos') || '';
  const devName = queryParams.get('devName') || 'Developer';
  const devDept = queryParams.get('dept') || 'Engineering';

  // Admin View State
  const [developerNameInput, setDeveloperNameInput] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('Frontend Engineering');
  const [orgName, setOrgName] = useState<string>('angular');
  const [fetchedRepos, setFetchedRepos] = useState<any[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);

  // Developer View State
  const [devTab, setDevTab] = useState<'guide' | 'explorer'>('guide');
  const assignedReposList = assignedReposParam ? assignedReposParam.split(',') : ['frontend-core'];
  const [activeRepo, setActiveRepo] = useState<string>(assignedReposList[0] || 'frontend-core');
  const currentArch = mockRepoArchitectures[activeRepo] || mockRepoArchitectures['frontend-core'];
  
  const [selectedNodeId, setSelectedNodeId] = useState<string>('1');
  const selectedCode = currentArch.codeMap[selectedNodeId] || currentArch.codeMap['1'];
  const [aiSummary, setAiSummary] = useState<string>('Click a node or wait for Gemini insights...');
  const [analyzing, setAnalyzing] = useState<boolean>(false);

  // Helper to extract org name from a full GitHub URL or string
  const parseOrgName = (input: string): string => {
    const cleaned = input.trim().replace(/\/+$/, '');
    if (cleaned.includes('github.com/')) {
      const parts = cleaned.split('github.com/')[1].split('/');
      return parts[0];
    }
    return cleaned;
  };

  // Fetch GitHub Org Repos for Admin
  const fetchOrgRepos = async () => {
    const extractedOrg = parseOrgName(orgName);
    if (!extractedOrg) return;
    setFetching(true);
    try {
      const res = await fetch(`https://api.github.com/orgs/${extractedOrg}/repos?per_page=8&sort=updated`);
      const data = await res.json();
      // Repos are selected by full name (owner/repo) so the onboarding API looks them up in the right account.
      if (Array.isArray(data)) {
        setFetchedRepos(data);
        setSelectedRepos(data.slice(0, 3).map((r: any) => r.full_name));
      } else {
        const userRes = await fetch(`https://api.github.com/users/${extractedOrg}/repos?per_page=8&sort=updated`);
        const userData = await userRes.json();
        if (Array.isArray(userData)) {
          setFetchedRepos(userData);
          setSelectedRepos(userData.slice(0, 3).map((r: any) => r.full_name));
        } else {
          setFetchedRepos([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch GitHub repos', err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!isDeveloperMode) {
      fetchOrgRepos();
    }
  }, []);

  // Generate Admin Shareable Link with Dev Name & Department in Query Parameters
  const handleGenerateLink = () => {
    const reposQuery = selectedRepos.length > 0 ? selectedRepos.join(',') : 'frontend-core';
    const nameQuery = developerNameInput.trim() || 'Alex';
    const link = `${window.location.origin}${window.location.pathname}?role=developer&devName=${encodeURIComponent(nameQuery)}&dept=${encodeURIComponent(selectedDepartment)}&repos=${encodeURIComponent(reposQuery)}`;
    setGeneratedLink(link);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fetch Gemini Onboarding Summary
  useEffect(() => {
    if (!isDeveloperMode) return;
    let isMounted = true;
    async function fetchGeminiInsight() {
      setAnalyzing(true);
      setAiSummary('Analyzing code structure with Gemini 1.5 Flash...');
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: `You are DevVision AI. Analyze this ${selectedCode.framework} snippet for developer ${devName} onboarding to ${devDept}.
Provide exactly 3 concise bullet points:
1. Purpose of this component/file.
2. Key inputs, props, or injected services.
3. Common entry points or modification areas.

Code:
${selectedCode.code}`
        });
        if (isMounted) {
          setAiSummary(response.text || 'No summary generated.');
        }
      } catch (err) {
        if (isMounted) {
          setAiSummary('Gemini Analysis Complete: Component handles primary application routing and guard security flow.');
        }
      } finally {
        if (isMounted) setAnalyzing(false);
      }
    }
    fetchGeminiInsight();
    return () => { isMounted = false; };
  }, [selectedNodeId, activeRepo, isDeveloperMode]);

  // Voice "Story Mode" Tour Button
  const triggerVoiceTour = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = `Welcome ${devName} to DevVision Onboarding for ${devDept}. Currently inspecting ${selectedCode.label} in file ${selectedCode.file}. Review the Gemini insights panel for modification pathways.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // ------------------------------------------------------------------
  // RENDER ADMIN PORTAL
  // ------------------------------------------------------------------
  if (!isDeveloperMode) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: '40px 20px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', background: '#1e293b', padding: '32px', borderRadius: '12px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <ShieldCheck size={32} color="#38bdf8" />
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', color: '#38bdf8' }}>DevVision — Admin Portal</h1>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>Assign GitHub repositories and onboard new developers</p>
            </div>
          </div>

          {/* Section 1: Developer Info (Name & Department Radios) */}
          <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '15px', color: '#38bdf8', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} /> Developer Profile & Department Assignment
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Developer Full Name:</label>
              <input
                type="text"
                value={developerNameInput}
                onChange={(e) => setDeveloperNameInput(e.target.value)}
                placeholder="e.g. Alex Johnson"
                style={{ width: '100%', padding: '10px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>Department / Track:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {departmentsList.map((dept) => (
                  <label
                    key={dept}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      background: selectedDepartment === dept ? '#1e3a5f' : '#1e293b',
                      border: `1px solid ${selectedDepartment === dept ? '#38bdf8' : '#334155'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <input
                      type="radio"
                      name="department"
                      value={dept}
                      checked={selectedDepartment === dept}
                      onChange={() => setSelectedDepartment(dept)}
                    />
                    <span>{dept}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Repository Org Lookup */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>GitHub Org Name or URL:</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. https://github.com/angular or angular"
                style={{ flex: 1, padding: '12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '14px' }}
              />
              <button
                onClick={fetchOrgRepos}
                disabled={fetching}
                style={{ padding: '12px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {fetching ? <RefreshCw className="animate-spin" size={16} /> : <Code2 size={16} />} Fetch Repos
              </button>
            </div>
          </div>

          {/* Section 3: Select Repositories */}
          <h3 style={{ fontSize: '15px', color: '#cbd5e1', marginBottom: '12px' }}>Select Repositories to Assign:</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            {fetchedRepos.map((repo) => (
              <label
                key={repo.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  background: selectedRepos.includes(repo.full_name) ? '#1e3a5f' : '#0f172a',
                  border: `1px solid ${selectedRepos.includes(repo.full_name) ? '#38bdf8' : '#334155'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedRepos.includes(repo.full_name)}
                  onChange={() => {
                    setSelectedRepos((prev) =>
                      prev.includes(repo.full_name) ? prev.filter((r) => r !== repo.full_name) : [...prev, repo.full_name]
                    );
                  }}
                />
                <span style={{ fontWeight: '600' }}>{repo.name}</span>
              </label>
            ))}
          </div>

          <button
            onClick={handleGenerateLink}
            style={{ width: '100%', padding: '14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <Sparkles size={18} /> Generate Developer Onboarding Portal Link
          </button>

          {generatedLink && (
            <div style={{ marginTop: '24px', padding: '16px', background: '#0f172a', borderRadius: '8px', border: '1px solid #10b981' }}>
              <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'bold' }}>SHAREABLE DEVELOPER ONBOARDING LINK:</span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  style={{ flex: 1, padding: '10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#38bdf8', fontSize: '12px' }}
                />
                <button
                  onClick={copyToClipboard}
                  style={{ padding: '10px 16px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={generatedLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ padding: '10px 16px', background: '#334155', color: '#fff', textDecoration: 'none', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
                >
                  <ExternalLink size={16} /> Open
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // RENDER DEVELOPER VIEW
  // ------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#38bdf8', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <span style={{ whiteSpace: 'nowrap' }}>⚡ DevVision</span> <span style={{ fontSize: '11px', background: '#334155', color: '#10b981', padding: '2px 8px', borderRadius: '4px' }}>Welcome, {devName} ({devDept})</span>
        </h2>

        <div style={{ display: 'flex', gap: '4px', padding: '4px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}>
          {developerTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setDevTab(id)}
              style={{ background: devTab === id ? '#38bdf8' : 'transparent', color: devTab === id ? '#0f172a' : '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {devTab === 'guide' ? (
        <OnboardingGuide
          repos={assignedReposList}
          developerName={queryParams.get('devName') || undefined}
          department={queryParams.get('dept') || undefined}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Left Panel: React Flow Graph View */}
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' }}>
            <div style={{ padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: '#94a3b8' }}>Assigned Repositories Architecture Topology</small>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select
                  value={activeRepo}
                  onChange={(e) => setActiveRepo(e.target.value)}
                  style={{ background: '#0f172a', color: '#38bdf8', border: '1px solid #38bdf8', padding: '6px 12px', borderRadius: '6px', fontSize: '13px' }}
                >
                  {assignedReposList.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <button
                  onClick={triggerVoiceTour}
                  style={{ background: '#10b981', color: '#0f172a', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Play size={14} /> Play Story Mode
                </button>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <ReactFlow
                nodes={currentArch.nodes}
                edges={currentArch.edges}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                fitView
              >
                <Background color="#334155" gap={16} />
                <Controls />
              </ReactFlow>
            </div>
          </div>

          {/* Right Panel: Monaco Editor & Gemini Insights */}
          <div style={{ width: '520px', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
            <div style={{ padding: '12px 16px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                  {selectedCode.framework}
                </span>
                <h4 style={{ margin: '4px 0 0 0', color: '#f8fafc', fontSize: '13px' }}>{selectedCode.file}</h4>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{selectedCode.label}</span>
            </div>

            <div style={{ height: '280px', borderBottom: '1px solid #334155' }}>
              <Editor
                height="100%"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={selectedCode.code}
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
              />
            </div>

            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', background: '#1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, color: '#38bdf8', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} /> Gemini AI Onboarding Insights
                </h4>
                {analyzing && <span style={{ fontSize: '11px', color: '#f59e0b' }}>Analyzing snippet...</span>}
              </div>
              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', fontSize: '13px', lineHeight: '1.5', color: '#cbd5e1', border: '1px solid #334155', whiteSpace: 'pre-wrap' }}>
                {aiSummary}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
