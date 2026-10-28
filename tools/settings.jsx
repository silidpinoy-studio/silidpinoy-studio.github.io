import { useState, useEffect, useRef } from 'https://unpkg.com/react@18/index.js?module';
import { LucideIcon } from '../shared-icons.js';

export default function Settings() {
  const [apiKey, setApiKey] = useState(() => (window.SilidKeys ? window.SilidKeys.get('primary') : localStorage.getItem('gemini_api_key') || ''));
  const [apiKey2, setApiKey2] = useState(() => (window.SilidKeys ? window.SilidKeys.get('backup') : localStorage.getItem('gemini_api_key_2') || ''));
  const [rememberKeys, setRememberKeys] = useState(() => !!(window.SilidKeys && window.SilidKeys.isRemembered()));
  const [apiKeyTestStatus, setApiKeyTestStatus] = useState('');
  const [apiKeyTestMsg, setApiKeyTestMsg] = useState('');
  const [schoolInfo, setSchoolInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('school_info')) || { schoolName:'',schoolAddress:'',regionNo:'',regionName:'',division:'',schoolLogo1:'',schoolLogo2:'',teacherName:'',teacherTitle:'',department:'',checkedBy:'',checkedByPosition:'',approvedBy:'',approvedByPosition:'' }; }
    catch { return { schoolName:'',schoolAddress:'',regionNo:'',regionName:'',division:'',schoolLogo1:'',schoolLogo2:'',teacherName:'',teacherTitle:'',department:'',checkedBy:'',checkedByPosition:'',approvedBy:'',approvedByPosition:'' }; }
  });
  const [showSchoolInfo, setShowSchoolInfo] = useState(false);
  const [schoolSaved, setSchoolSaved] = useState('');
  const handleSaveSchoolInfo = () => {
    try {
      localStorage.setItem('school_info', JSON.stringify(schoolInfo));
      setSchoolSaved('\u2713 Saved');
    } catch (e) {
      setSchoolSaved('\u26a0 Could not save \u2014 export a backup');
    }
    setTimeout(() => setSchoolSaved(''), 2500);
  };

  useEffect(() => {
    if (window.SilidKeys) window.SilidKeys.set('primary', apiKey);
    else if (apiKey) localStorage.setItem('gemini_api_key', apiKey);
    else localStorage.removeItem('gemini_api_key');
    setApiKeyTestStatus('');
    setApiKeyTestMsg('');
  }, [apiKey]);

  useEffect(() => {
    if (window.SilidKeys) window.SilidKeys.set('backup', apiKey2);
    else if (apiKey2) localStorage.setItem('gemini_api_key_2', apiKey2);
    else localStorage.removeItem('gemini_api_key_2');
  }, [apiKey2]);

  useEffect(() => {
    if (window.SilidKeys) window.SilidKeys.setRemember(rememberKeys);
  }, [rememberKeys]);

  useEffect(() => {
    localStorage.setItem('school_info', JSON.stringify(schoolInfo));
  }, [schoolInfo]);

  const handleTestApiKey = async () => {
    const k1 = apiKey.trim();
    const k2 = apiKey2.trim();
    if (!k1) { setApiKeyTestStatus('fail'); setApiKeyTestMsg('Please paste your primary API key first.'); return; }
    if (k1.length < 20) { setApiKeyTestStatus('fail'); setApiKeyTestMsg('This primary key looks too short. Please copy the full key from Google AI Studio.'); return; }
    if (k2 && k2.length < 20) { setApiKeyTestStatus('fail'); setApiKeyTestMsg('The backup key looks too short. Please copy the full key from Google AI Studio.'); return; }
    setApiKeyTestStatus('testing');
    setApiKeyTestMsg('');
    try {
      const r1 = await window.SilidAPI.pingKey(k1);
      if (!r1.ok) { setApiKeyTestMsg('Primary key: ' + r1.friendly); setApiKeyTestStatus('fail'); return; }
      if (!k2) { setApiKeyTestMsg('Your API key is working! You\'re all set to create tests.'); setApiKeyTestStatus('ok'); return; }
      const r2 = await window.SilidAPI.pingKey(k2);
      if (r2.ok) { setApiKeyTestMsg('Primary and backup keys are both working!'); setApiKeyTestStatus('ok'); }
      else { setApiKeyTestMsg('Primary key works, but the backup failed: ' + r2.friendly); setApiKeyTestStatus('fail'); }
    } catch (e) {
      console.error('API test error:', e);
      setApiKeyTestMsg('Could not test the key: ' + ((e && e.message) || 'unknown error') + '. Check your internet connection and try again.');
      setApiKeyTestStatus('fail');
    }
  };

  const handleSchoolInfoChange = (e) => setSchoolInfo(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleLogoUpload = (e, field) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 500*1024) { if(window.SilidToast) window.SilidToast.warning('Logo must be under 500 KB.'); else alert('Logo must be under 500 KB.'); return; }
    const reader = new FileReader(); reader.onload = (ev) => setSchoolInfo(p => ({ ...p, [field]: ev.target.result })); reader.readAsDataURL(file);
  };
  const removeLogo = (field) => setSchoolInfo(p => ({ ...p, [field]: '' }));

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="reveal">
        <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-iris-600">Settings</span>
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-tight mt-2">Configure your workspace</h1>
        <p className="text-ink/55 mt-2">API keys, school info, and data preferences.</p>
      </div>

      <section className="reveal card-bezel">
        <div className="card-inner p-6 md:p-8 space-y-6">
          <div className="section-header">
            <span className="icon-circle"><LucideIcon name="Settings" className="w-5 h-5" /></span>
            <h3>Gemini API Keys</h3>
          </div>
          <div className="space-y-4">
            <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mb-2">Primary API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your API key..." autocomplete="off"
              className="w-full px-3 py-2 text-sm bg-white/80 ring-1 ring-black/10 rounded-xl focus:ring-2 focus:ring-iris-500 focus:outline-none transition-all" />
            <label className="block text-[11px] font-semibold text-ink/45 uppercase tracking-wider mt-4 mb-2">Backup API Key <span className="normal-case font-medium text-ink/35">(optional)</span></label>
            <input type="password" value={apiKey2} onChange={(e) => setApiKey2(e.target.value)} placeholder="Paste a key from another account..." autocomplete="off"
              className="w-full px-3 py-2 text-sm bg-white/80 ring-1 ring-black/10 rounded-xl focus:ring-2 focus:ring-iris-500 focus:outline-none transition-all" />
            <label className="flex items-start gap-2 mt-4 text-[11px] text-ink/70 cursor-pointer select-none">
              <input type="checkbox" checked={rememberKeys} onChange={(e) => setRememberKeys(e.target.checked)} className="mt-0.5 rounded border-black/20 text-iris-600 focus:ring-iris-500" />
              <span>Remember my API key on this device</span>
            </label>
            <p id="remember-keys-hint" className="text-[10px] text-ink/40 mt-1.5">{rememberKeys ? 'On — your key is stored in device storage and will persist across sessions.' : 'Off — your key is kept for this browser session only and is never written to your device.'}</p>
            <p className="text-[10px] text-ink/40 mt-1">Primary is used first; if it hits daily quota or high demand, the backup takes over automatically. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="inline-flex items-center align-middle ml-2 bg-iris-600 hover:bg-iris-700 text-white text-[11px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm">Get keys</a></p>
            <button onClick={handleTestApiKey} disabled={apiKeyTestStatus === 'testing'}
              className="w-full py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 bg-iris-50 text-iris-700 ring-1 ring-iris-200 hover:bg-iris-100 disabled:opacity-50">
              {apiKeyTestStatus === 'testing' ? 'Testing...' : 'Test API Key'}
            </button>
            <p className={`text-[10px] mt-1.5 px-1 ${apiKeyTestStatus === 'ok' ? 'text-emerald-700' : apiKeyTestStatus === 'fail' ? 'text-rose-700' : 'text-ink/40'}`}>{apiKeyTestMsg}</p>
          </div>
        </div>
      </section>

      <section className="reveal card-bezel">
        <div className="card-inner p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="section-header">
              <span className="icon-circle"><LucideIcon name="LayoutTemplate" className="w-5 h-5" /></span>
              <h3>School & Personal Information</h3>
            </div>
            <button onClick={() => setShowSchoolInfo(!showSchoolInfo)} className="text-sm font-medium text-ink/70 hover:text-iris-600 flex items-center gap-2 py-1.5 transition-colors">
              <LucideIcon name={showSchoolInfo ? 'ChevronUp' : 'ChevronDown'} className="w-4 h-4" />
              {showSchoolInfo ? 'Hide' : 'Edit'}
            </button>
          </div>
          {showSchoolInfo && (
            <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'schoolName', label: 'School Name', type: 'text', colSpan: 2 },
                { name: 'schoolAddress', label: 'School Address', type: 'text', colSpan: 2 },
                { name: 'regionNo', label: 'Region No.', type: 'text' },
                { name: 'regionName', label: 'Region Name', type: 'text' },
                { name: 'division', label: 'Division', type: 'text' },
                { name: 'teacherName', label: 'Teacher Name', type: 'text' },
                { name: 'teacherTitle', label: 'Teacher Title', type: 'text' },
                { name: 'department', label: 'Department', type: 'text' },
                { name: 'checkedBy', label: 'Checked By', type: 'text' },
                { name: 'checkedByPosition', label: 'Checked By Position', type: 'text' },
                { name: 'approvedBy', label: 'Approved By', type: 'text' },
                { name: 'approvedByPosition', label: 'Approved By Position', type: 'text' },
              ].map(field => (
                <label key={field.name} className={`block ${field.colSpan === 2 ? 'md:col-span-2' : ''}`}>
                  <span className="block text-[11px] font-medium text-ink/60 mb-1">{field.label}</span>
                  <input type={field.type} name={field.name} value={schoolInfo[field.name] || ''} onChange={handleSchoolInfoChange}
                    className="w-full px-3 py-2 text-sm bg-white/80 ring-1 ring-black/10 rounded-xl focus:ring-2 focus:ring-iris-500 focus:outline-none transition-all" />
                </label>
              ))}

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-ink/60 mb-1">School Logo 1 (Top Left)</label>
                {schoolInfo.schoolLogo1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <img src={schoolInfo.schoolLogo1} alt="Logo 1" className="h-16 w-auto rounded" />
                    <button type="button" onClick={() => removeLogo('schoolLogo1')} className="text-xs text-rose-600 hover:text-rose-700 underline">Remove</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e, 'schoolLogo1')} className="w-full px-3 py-2 text-sm bg-white/80 ring-1 ring-black/10 rounded-xl focus:ring-2 focus:ring-iris-500 focus:outline-none transition-all" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-ink/60 mb-1">School Logo 2 (Top Right)</label>
                {schoolInfo.schoolLogo2 && (
                  <div className="flex items-center gap-2 mb-2">
                    <img src={schoolInfo.schoolLogo2} alt="Logo 2" className="h-16 w-auto rounded" />
                    <button type="button" onClick={() => removeLogo('schoolLogo2')} className="text-xs text-rose-600 hover:text-rose-700 underline">Remove</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e, 'schoolLogo2')} className="w-full px-3 py-2 text-sm bg-white/80 ring-1 ring-black/10 rounded-xl focus:ring-2 focus:ring-iris-500 focus:outline-none transition-all" />
              </div>
              <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                <span className="text-sm font-medium text-emerald-600">{schoolSaved}</span>
                <button type="button" onClick={handleSaveSchoolInfo} className="rounded-full bg-iris-600 hover:bg-iris-700 text-white text-sm font-semibold px-7 py-2.5 transition-colors">Save</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="reveal card-bezel">
        <div className="card-inner p-6 md:p-8 space-y-6">
          <div className="section-header">
            <span className="icon-circle"><LucideIcon name="RotateCcw" className="w-5 h-5" /></span>
            <h3>Data Management</h3>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-ink/60">Export or import your saved documents, API keys, and school info as a single encrypted backup file.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => window.SilidBackup?.exportBackup?.() || alert('Backup module not loaded')}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-iris-50 text-iris-700 ring-1 ring-iris-200 hover:bg-iris-100 transition-all flex items-center gap-2">
                <LucideIcon name="Download" className="w-4 h-4" />
                Export Backup
              </button>
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white ring-1 ring-black/5 hover:bg-black/5 transition-all cursor-pointer">
                <LucideIcon name="Upload" className="w-4 h-4" />
                Import Backup
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const result = await window.SilidBackup.importBackup(file);
                    if (result.warnings?.length) {
                      if (window.SilidToast) window.SilidToast.warning(result.warnings.join(', '));
                    }
                    const applied = window.SilidBackup.applyImport(result.data, 'merge');
                    if (applied.ok) {
                      if (window.SilidToast) window.SilidToast.success('Imported ' + applied.keysWritten.length + ' items. Refreshing...');
                      setTimeout(() => window.location.reload(), 600);
                    }
                  } catch (err) {
                    if (window.SilidToast) window.SilidToast.error(err.message || 'Import failed');
                  }
                }} />
              </label>
              <button onClick={() => { if (confirm('Clear all saved documents? This cannot be undone.')) { window.SilidDocs?.clearAll?.(); if (window.SilidToast) window.SilidToast.success('All documents cleared.'); } }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 transition-all flex items-center gap-2">
                <LucideIcon name="Trash2" className="w-4 h-4" />
                Clear All Documents
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}