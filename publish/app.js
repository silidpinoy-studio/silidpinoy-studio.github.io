import { createRoot } from 'https://unpkg.com/react-dom@18/client.js';
import { LucideIcons, LucideIcon, initLucideIcons } from './shared-icons.js';

initLucideIcons();

const root = createRoot(document.getElementById('root'));

const TOOL_MODULES = {
  'test-maker': () => import('./tools/test-maker.jsx'),
  'tos': () => import('./tools/tos-maker.jsx'),
  'lesson-plan': () => import('./tools/lesson-plan.jsx'),
  'ppt-maker': () => import('./tools/ppt-maker.jsx'),
  'activity-sheet': () => import('./tools/activity-sheet.jsx'),
  'settings': () => import('./tools/settings.jsx'),
};

const HOME_TOOL = 'home';

let currentTool = null;
let currentCleanup = null;

function getHashTool() {
  const hash = window.location.hash.slice(1);
  return hash || HOME_TOOL;
}

function setActiveNav(tool) {
  document.querySelectorAll('[data-tool]').forEach(el => {
    const isActive = el.dataset.tool === tool;
    el.classList.toggle('bg-black/5', isActive);
    el.classList.toggle('text-ink', isActive);
    el.classList.toggle('font-semibold', isActive);
    el.classList.toggle('text-ink/60', !isActive);
    el.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function showHome() {
  root.render(
    <Home />
  );
}

function Home() {
  const tools = [
    { id: 'test-maker', name: 'Test Creator', desc: 'Generate rigorous summative & formative tests from topics or uploaded modules.', icon: 'FileText' },
    { id: 'tos', name: 'TOS Maker', desc: 'Build a Table of Specifications aligned to Bloom\'s and your curriculum.', icon: 'Table' },
    { id: 'lesson-plan', name: 'iLaw Lesson Plan', desc: 'DepEd-aligned lesson plans drafted in minutes, not hours.', icon: 'ClipboardList' },
    { id: 'ppt-maker', name: 'PPT Maker', desc: 'Turn any topic, DLL, exam, or quiz into a polished slide deck automatically.', icon: 'Presentation' },
    { id: 'activity-sheet', name: 'Activity Sheet Maker', desc: 'Turn any lesson plan into a beautiful module-style worksheet with puzzles, tables, and icons.', icon: 'FileDigit' },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center reveal">
        <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-iris-600">SilidPinoy Studio</span>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-light tracking-tight mt-2">Tools that give teachers time back.</h1>
        <p className="text-ink/55 mt-4 max-w-xl mx-auto text-base md:text-lg">Pick a tool below. No accounts, no build step, works offline.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {tools.map((tool, i) => (
          <a
            key={tool.id}
            href={`#${tool.id}`}
            className="reveal card-bezel group"
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <div className="card-inner p-6 md:p-8 h-full flex flex-col">
              <div className="icon-orb w-12 h-12 rounded-xl bg-iris-50 text-iris-600 flex items-center justify-center mb-4 group-hover:scale-110">
                <LucideIcons name={tool.icon} className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-ink mb-2">{tool.name}</h3>
              <p className="text-ink/60 text-sm flex-grow">{tool.desc}</p>
              <span className="mt-4 text-xs font-medium text-iris-600 flex items-center gap-1">
                Open
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </span>
            </div>
          </a>
        ))}
      </div>

      <div className="reveal max-w-4xl mx-auto">
        <div className="card-bezel">
          <div className="card-inner p-4 md:p-5" style={{ background: 'linear-gradient(135deg,#FFF1F2 0%,#FFE4E6 45%,#FEF3C7 100%)' }}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="icon-orb w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-[0_10px_24px_-10px_rgba(225,29,72,0.8)]">
                <LucideIcon name="Heart" className="w-5 h-5" />
              </div>
              <div className="flex-grow">
                <h3 className="font-semibold text-ink text-rose-700">Help keep SilidPinoy free for every teacher</h3>
                <p className="text-ink/70 text-sm mt-1">No ads, no subscriptions, no accounts — just tools made with care for Filipino teachers. If SilidPinoy gave you your evenings back, a small GCash contribution keeps it free for everyone and funds what we build next.</p>
              </div>
              <button
                type="button"
                id="donate-toggle"
                aria-expanded="false"
                aria-controls="gcash-panel"
                onClick={(e) => {
                  const panel = document.getElementById('gcash-panel');
                  const hidden = panel.classList.toggle('hidden');
                  e.currentTarget.setAttribute('aria-expanded', hidden ? 'false' : 'true');
                }}
                className="shrink-0 w-full md:w-auto justify-center inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white ring-1 ring-rose-700/20 hover:shadow-[0_16px_36px_-14px_rgba(225,29,72,0.75)] transition btn-spring">
                <LucideIcon name="Heart" className="w-4 h-4" />
                Support via GCash
              </button>
            </div>
            <div id="gcash-panel" className="hidden" role="region" aria-label="GCash donation QR code">
              <div className="mt-4 pt-4 border-t border-black/5 flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
                <img src="gcash.jpg" alt="GCash QR code — scan to support SilidPinoy Studio"
                  className="w-52 h-52 shrink-0 object-contain rounded-2xl bg-white ring-1 ring-black/10 p-2 shadow-sm" />
                <div className="space-y-2">
                  <p className="text-sm text-ink/70">Open your <b>GCash</b> app, scan the code, and send any amount — kahit maliit, malaking tulong po.</p>
                  <p className="text-sm text-ink/70">Your support keeps SilidPinoy free, ad-free, and growing for every Filipino teacher.</p>
                  <p className="text-xs text-ink/45">Maraming salamat po! 🙏</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center reveal mt-12">
        <p className="text-ink/40 text-sm">All tools run in your browser. Your API key never leaves this device.</p>
      </div>
    </div>
  );
}

async function mountTool(toolName) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  if (toolName === HOME_TOOL) {
    currentTool = HOME_TOOL;
    showHome();
    setActiveNav(null);
    return;
  }

  const loader = TOOL_MODULES[toolName];
  if (!loader) {
    console.warn(`Unknown tool: ${toolName}`);
    showHome();
    return;
  }

  try {
    const module = await loader();
    const ToolComponent = module.default || module.Tool;

    if (!ToolComponent) {
      throw new Error(`Tool ${toolName} has no default export`);
    }

    if (module.cleanup) {
      currentCleanup = module.cleanup;
    }

    currentTool = toolName;
    root.render(<ToolComponent />);
    setActiveNav(toolName);
  } catch (err) {
    console.error(`Failed to load tool ${toolName}:`, err);
    root.render(
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-ink mb-2">Failed to load tool</h2>
        <p className="text-ink/60 mb-4">{err.message}</p>
        <a href="#home" className="text-iris-600 underline">Back to home</a>
      </div>
    );
  }
}

function handleHashChange() {
  const tool = getHashTool();
  mountTool(tool);
}

window.addEventListener('hashchange', handleHashChange);
handleHashChange();

window.SilidApp = {
  getCurrentTool: () => currentTool,
  navigate: (tool) => {
    window.location.hash = tool;
  },
};

export { root, mountTool };