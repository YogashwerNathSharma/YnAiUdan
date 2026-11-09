import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";







import { createRoot } from "react-dom/client";







import "./styles.css";















type User = { id: string; email: string; displayName: string; role: string; tenantId: string };







type Project = { id: string; name: string; slug: string; instructions?: string | null };







type Conversation = { id: string; title: string; projectId?: string | null; updatedAt: string };







type ToolStep = { kind: "step" | "result"; tool: string; detail: string; ok?: boolean };
type Message = { id: string; role: string; content: string; createdAt: string; steps?: ToolStep[]; changedFiles?: string[] };















const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";







const MODEL = import.meta.env.VITE_AI_MODEL ?? "groq:openai/gpt-oss-20b";



// Selectable models shown in the chat composer dropdown.

// `id` is sent to the backend as the `model` field.

type ModelOption = { id: string; label: string; tag: string; blurb: string };

const MODEL_OPTIONS: ModelOption[] = [

  // Google Gemini (uses your GEMINI_API_KEY) — ordered by smartness.
  // Only models verified to work with the OpenAI-compatible endpoint on new keys.
  { id: import.meta.env.VITE_AI_MODEL_GEMINI_LITE ?? "gemini:gemini-flash-lite-latest", label: "Gemini Lite", tag: "💧", blurb: "Fastest & lightest — quick replies" },

  { id: import.meta.env.VITE_AI_MODEL_GEMINI_FLASH ?? "gemini:gemini-3.1-flash-lite", label: "Gemini Flash", tag: "💠", blurb: "Balanced speed & quality" },

  { id: import.meta.env.VITE_AI_MODEL_GEMINI_PRO ?? "gemini:gemini-3-flash-preview", label: "Gemini Advanced", tag: "🔷", blurb: "Smartest — best for coding & hard problems" },

  // Groq (uses your GROQ_API_KEY)
  { id: import.meta.env.VITE_AI_MODEL_FAST ?? "groq:llama-3.1-8b-instant", label: "Groq Fast", tag: "⚡", blurb: "Quick replies, lightweight tasks" },

  { id: import.meta.env.VITE_AI_MODEL_SMART ?? "groq:openai/gpt-oss-20b", label: "Groq Smart", tag: "✨", blurb: "Balanced quality & speed" },

  { id: import.meta.env.VITE_AI_MODEL_INTELLIGENT ?? "groq:openai/gpt-oss-120b", label: "Groq Intelligent", tag: "🧠", blurb: "Deep reasoning for hard problems" }

];

const MODEL_KEY = "ynaiudan_model";















async function api<T>(path: string, options: RequestInit = {}): Promise<T> {







  const token = localStorage.getItem("ynaiudan_token");







  const response = await fetch(`${API}${path}`, {







    ...options,







    headers: {







      // Only set JSON content-type when there is a body, otherwise Fastify







      // rejects empty-body requests (DELETE) with 400 Bad Request.







      ...(options.body ? { "Content-Type": "application/json" } : {}),







      ...(token ? { Authorization: `Bearer ${token}` } : {}),







      ...options.headers







    }







  });







  if (response.status === 204) return undefined as T;







  const body = await response.json().catch(() => ({}));







  if (!response.ok) throw new Error(body.error ?? "Request failed");







  return body as T;







}















// Render a message body. Any image URLs (markdown ![](url), data: URLs, or

// bare https image links / pollinations links) are shown as actual images;

// the rest is shown as text. This is what makes generated images appear inline.

function renderMessageContent(content: string): React.ReactNode {

  const parts: React.ReactNode[] = [];

  const regex = /!\[[^\]]*\]\((.*?)\)|(data:image\/[^\s)]+)|(https?:\/\/[^\s)]+?(?:\.(?:png|jpe?g|gif|webp)|image\.pollinations\.ai\/[^\s)]+))/gi;

  let last = 0; let match: RegExpExecArray | null; let key = 0;

  while ((match = regex.exec(content)) !== null) {

    const url = match[1] || match[2] || match[3];

    if (match.index > last) {

      const text = content.slice(last, match.index);

      if (text.trim()) parts.push(<span key={`t${key++}`}>{text}</span>);

    }

    if (url) parts.push(
      <span key={`i${key++}`} className="gen-image-wrap">
        <img className="gen-image" src={url} alt="generated" loading="lazy" />
        <a className="img-download" href={url} download={`ynaiudan-image-${Date.now()}.png`} title="Download image">⬇ Download</a>
      </span>
    );

    last = regex.lastIndex;

  }

  if (last < content.length) {

    const text = content.slice(last);

    if (text.trim() || parts.length === 0) parts.push(<span key={`t${key++}`}>{text}</span>);

  }

  return parts.length ? parts : content;

}



// Build a readable conversation title from the first user message.







function titleFromMessage(text: string): string {







  const clean = text.replace(/\s+/g, " ").trim();







  if (!clean) return "New conversation";







  const firstLine = clean.split(/[.!?\n]/)[0]?.trim() || clean;







  const words = firstLine.split(" ").slice(0, 8).join(" ");







  const title = words.length > 48 ? `${words.slice(0, 48).trim()}…` : words;







  return title.charAt(0).toUpperCase() + title.slice(1);







}















// Group conversations into Today / Yesterday / Previous 7 days / Older.







function groupConversations(list: Conversation[]) {







  const now = new Date();







  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();







  const today = startOfDay(now);







  const yesterday = today - 86400000;







  const week = today - 6 * 86400000;







  // Explicit keys (not Record<string,...>) so each bucket is a guaranteed array
  // under noUncheckedIndexedAccess — avoids spurious "possibly undefined".
  const buckets: { Today: Conversation[]; Yesterday: Conversation[]; "Previous 7 days": Conversation[]; Older: Conversation[] } = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };







  for (const c of list) {







    const t = startOfDay(new Date(c.updatedAt));







    if (t >= today) buckets.Today.push(c);







    else if (t >= yesterday) buckets.Yesterday.push(c);







    else if (t >= week) buckets["Previous 7 days"].push(c);







    else buckets.Older.push(c);







  }







  return Object.entries(buckets).filter(([, items]) => items.length > 0);







}















/* ===================================================================







   Theme + appearance







   - theme: "dark" (black) | "light" (white)







   - background: custom CSS background applied to --app-bg (optional)







   Both are persisted in localStorage and applied to <html>.







   =================================================================== */







type ThemeName = "dark" | "light";















const THEME_KEY = "ynaiudan_theme";







const BG_KEY = "ynaiudan_bg";















const BG_PRESETS: { label: string; dark: string; light: string }[] = [







  { label: "Default", dark: "#0b0d12", light: "#f7f8fa" },







  { label: "Midnight", dark: "#0a0f1e", light: "#eef2fb" },







  { label: "Charcoal", dark: "#101114", light: "#f2f3f5" },







  { label: "Forest", dark: "#0a140f", light: "#eef6f0" },







  { label: "Plum", dark: "#140b16", light: "#f7eefa" },







  {







    label: "Aurora",







    dark: "radial-gradient(1200px 700px at 20% -10%, #15213f, #0b0d12 60%)",







    light: "radial-gradient(1200px 700px at 20% -10%, #dbe6ff, #f7f8fa 60%)"







  }







];















function getInitialTheme(): ThemeName {







  const stored = localStorage.getItem(THEME_KEY);







  if (stored === "light" || stored === "dark") return stored;







  // fall back to OS preference







  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";







}















function applyAppearance(theme: ThemeName, background: string) {







  const root = document.documentElement;







  root.setAttribute("data-theme", theme);







  if (background) root.style.setProperty("--app-bg", background);







  else root.style.removeProperty("--app-bg");







}















function useAppearance() {







  const [theme, setTheme] = useState<ThemeName>(getInitialTheme);







  const [background, setBackground] = useState<string>(() => localStorage.getItem(BG_KEY) ?? "");















  useEffect(() => {







    applyAppearance(theme, background);







    localStorage.setItem(THEME_KEY, theme);







    if (background) localStorage.setItem(BG_KEY, background);







    else localStorage.removeItem(BG_KEY);







  }, [theme, background]);















  const toggleTheme = useCallback(() => setTheme(t => (t === "dark" ? "light" : "dark")), []);







  return { theme, setTheme, toggleTheme, background, setBackground };







}















type Appearance = ReturnType<typeof useAppearance>;















function Brand({ size = "md" }: { size?: "md" | "lg" }) {







  return (







    <div className={`brand brand-${size}`}>







      <img src="/ynlogo.png" alt="YN Software" className="brand-logo" />







      <span className="brand-name">YnAiUdan</span>







    </div>







  );







}















/* ---------- Appearance (theme + background) modal ---------- */







function AppearanceModal({ appearance, onClose }: { appearance: Appearance; onClose: () => void }) {







  const { theme, setTheme, background, setBackground } = appearance;







  return (







    <div className="modal-overlay" onClick={onClose}>







      <div className="modal-card" onClick={e => e.stopPropagation()}>







        <div className="modal-head">







          <div>







            <h2>Appearance</h2>







            <p>Switch between black &amp; white themes and set your own background.</p>







          </div>







          <button className="modal-close" onClick={onClose} title="Close">×</button>







        </div>















        <div className="appear-section">







          <span className="field-label">Theme</span>







          <div className="theme-choices">







            <button







              type="button"







              className={`theme-choice ${theme === "dark" ? "active" : ""}`}







              onClick={() => setTheme("dark")}







            >







              <div className="theme-swatch dark" />







              <span>Black</span>







            </button>







            <button







              type="button"







              className={`theme-choice ${theme === "light" ? "active" : ""}`}







              onClick={() => setTheme("light")}







            >







              <div className="theme-swatch light" />







              <span>White</span>







            </button>







          </div>







        </div>















        <div className="appear-section">







          <span className="field-label">Background</span>







          <div className="bg-presets">







            {BG_PRESETS.map(preset => {







              const value = theme === "light" ? preset.light : preset.dark;







              const isDefault = preset.label === "Default";







              const active = isDefault ? !background : background === value;







              return (







                <div







                  key={preset.label}







                  className={`bg-swatch ${active ? "active" : ""}`}







                  title={preset.label}







                  style={{ background: value }}







                  onClick={() => setBackground(isDefault ? "" : value)}







                />







              );







            })}







          </div>







          <div className="bg-row">







            <input







              type="color"







              value={/^#([0-9a-f]{6})$/i.test(background) ? background : (theme === "light" ? "#f7f8fa" : "#0b0d12")}







              onChange={e => setBackground(e.target.value)}







              title="Custom colour"







            />







            <span className="ca-hint">Pick any colour for your background</span>







            <button type="button" className="ghost-btn" onClick={() => setBackground("")}>Reset</button>







          </div>







        </div>







      </div>







    </div>







  );







}















/* ===================================================================







   Computer Access panel







   Lets you (and the AI) read the workspace file tree, open & edit a







   file, save it back, and run allowlisted dev commands — the same







   secure endpoints the agent uses, so it can read code and fix bugs.







   =================================================================== */







type TreeEntry = { path: string; type: "file" | "directory" };







type AutonomyMode = "SAFE_AUTO" | "CONFIRM_TOOLS" | "AUTONOMOUS" | "FULLY_CONTROLLED";















type BrowseEntry = { name: string; path: string };















function FolderPicker({ initial, onPick, onClose }: { initial: string; onPick: (path: string) => void; onClose: () => void }) {







  const [current, setCurrent] = useState<string>(initial || "");







  const [parent, setParent] = useState<string | null>(null);







  const [dirs, setDirs] = useState<BrowseEntry[]>([]);







  const [home, setHome] = useState<string>("");







  const [err, setErr] = useState<string>("");















  const browse = useCallback(async (path?: string) => {







    setErr("");







    try {







      const res = await api<{ path: string; parent: string | null; home: string; directories: BrowseEntry[] }>("/api/v1/coding/browse", {







        method: "POST",







        body: JSON.stringify({ path: path ?? "" })







      });







      setCurrent(res.path);







      setParent(res.parent);







      setDirs(res.directories);







      setHome(res.home);







    } catch (e) {







      setErr(e instanceof Error ? e.message : "Unable to browse");







    }







  }, []);















  useEffect(() => { void browse(initial || undefined); }, [browse, initial]);















  return (







    <div className="fp-overlay" onClick={onClose}>







      <div className="fp-card" onClick={e => e.stopPropagation()}>







        <div className="fp-head">







          <h3>Choose a folder</h3>







          <button className="modal-close" onClick={onClose} title="Close">×</button>







        </div>







        <div className="fp-cur">{current || "This PC"}</div>







        <div className="fp-list">







          <button className="fp-row up" onClick={() => void browse(parent ?? undefined)} disabled={!current}>







            <span className="ico">⬆</span> {parent ? ".. (up one level)" : "This PC / drives"}







          </button>







          {home && (







            <button className="fp-row" onClick={() => void browse(home)}>







              <span className="ico">🏠</span> Home







            </button>







          )}







          {dirs.length === 0 && <div className="fp-empty">No sub-folders here</div>}







          {dirs.map(d => (







            <button className="fp-row" key={d.path} onClick={() => void browse(d.path)} title={d.path}>







              <span className="ico">📁</span> {d.name}







            </button>







          ))}







        </div>







        {err && <div className="ca-status err">{err}</div>}







        <div className="fp-actions">







          <button className="ghost-btn" onClick={onClose}>Cancel</button>







          <button className="primary" onClick={() => onPick(current)} disabled={!current}>Use this folder</button>







        </div>







      </div>







    </div>







  );







}















function ComputerAccessModal({ onClose }: { onClose: () => void }) {







  const [rootPath, setRootPath] = useState<string>(() => localStorage.getItem("ynaiudan_ca_root") ?? "");







  const [showPicker, setShowPicker] = useState(false);







  const [tree, setTree] = useState<TreeEntry[]>([]);







  const [selected, setSelected] = useState<string>("");







  const [content, setContent] = useState<string>("");







  const [dirty, setDirty] = useState(false);







  const [mode, setMode] = useState<AutonomyMode>("CONFIRM_TOOLS");







  const [command, setCommand] = useState("");







  const [output, setOutput] = useState("");







  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);







  const [busy, setBusy] = useState(false);















  // --- Ask AI to fix ---







  type LogRow = { kind: "step" | "result" | "message" | "error"; ok?: boolean; tag: string; text: string };







  const [instruction, setInstruction] = useState("");







  const [agentLog, setAgentLog] = useState<LogRow[]>([]);







  const [agentRunning, setAgentRunning] = useState(false);







  const logEndRef = useRef<HTMLDivElement>(null);















  useEffect(() => {







    if (rootPath) localStorage.setItem("ynaiudan_ca_root", rootPath);







    else localStorage.removeItem("ynaiudan_ca_root");







  }, [rootPath]);















  const refreshTree = useCallback(async () => {







    setStatus(null);







    try {







      const res = await api<{ files: TreeEntry[]; truncated: boolean }>("/api/v1/coding/inspect", {







        method: "POST",







        body: JSON.stringify({ path: "", maxEntries: 400, root: rootPath || undefined })







      });







      setTree(res.files.filter(f => f.type === "file"));







    } catch (e) {







      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Unable to read workspace" });







    }







  }, [rootPath]);















  useEffect(() => { void refreshTree(); }, [refreshTree]);















  async function openFile(path: string) {







    if (dirty && !confirm("Discard unsaved changes?")) return;







    setStatus(null);







    try {







      const res = await api<{ path: string; content: string }>(`/api/v1/workspace/file?path=${encodeURIComponent(path)}${rootPath ? `&root=${encodeURIComponent(rootPath)}` : ""}`);







      setSelected(path);







      setContent(res.content);







      setDirty(false);







    } catch (e) {







      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Unable to open file" });







    }







  }















  async function saveFile() {







    if (!selected) return;







    setBusy(true);







    setStatus(null);







    try {







      await api("/api/v1/coding/edit", {







        method: "POST",







        body: JSON.stringify({ path: selected, content, mode, root: rootPath || undefined })







      });







      setDirty(false);







      setStatus({ kind: "ok", text: `Saved ${selected}` });







      void refreshTree();







    } catch (e) {







      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Unable to save (check autonomy mode / role)" });







    } finally {







      setBusy(false);







    }







  }















  async function runCommand(e: FormEvent) {







    e.preventDefault();







    const cmd = command.trim();







    if (!cmd) return;







    setBusy(true);







    setStatus(null);







    setOutput(prev => `${prev}${prev ? "\n\n" : ""}$ ${cmd}\n`);







    try {







      const res = await api<{ ok: boolean; output?: { exitCode: number; stdout: string; stderr: string }; error?: string }>(







        "/api/v1/coding/command",







        { method: "POST", body: JSON.stringify({ command: cmd, mode, root: rootPath || undefined }) }







      );







      if (res.ok && res.output) {







        setOutput(prev => `${prev}${res.output!.stdout || ""}${res.output!.stderr ? `\n${res.output!.stderr}` : ""}\n[exit ${res.output!.exitCode}]`);







        setStatus({ kind: "ok", text: `Command finished (exit ${res.output.exitCode})` });







      } else {







        setOutput(prev => `${prev}${res.error ?? "Command failed"}`);







        setStatus({ kind: "err", text: res.error ?? "Command failed" });







      }







    } catch (e) {







      const msg = e instanceof Error ? e.message : "Command failed";







      setOutput(prev => `${prev}${msg}`);







      setStatus({ kind: "err", text: msg });







    } finally {







      setCommand("");







      setBusy(false);







    }







  }















  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [agentLog]);















  async function askAI(e: FormEvent) {







    e.preventDefault();







    const text = instruction.trim();







    if (!text || agentRunning) return;







    setAgentRunning(true);







    setStatus(null);







    setAgentLog([{ kind: "message", tag: "task", text }]);







    try {







      const token = localStorage.getItem("ynaiudan_token");







      const res = await fetch(`${API}/api/v1/coding/agent`, {







        method: "POST",







        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },







        body: JSON.stringify({ instruction: text, mode, maxSteps: 16, root: rootPath || undefined })







      });







      if (!res.ok || !res.body) {







        const body = await res.json().catch(() => ({}));







        throw new Error(body.error ?? "Agent request failed");







      }







      const reader = res.body.getReader();







      const decoder = new TextDecoder();







      let buffer = "";







      let touched = false;







      while (true) {







        const { value, done } = await reader.read();







        if (done) break;







        buffer += decoder.decode(value, { stream: true });







        const events = buffer.split("\n\n");







        buffer = events.pop() ?? "";







        for (const evt of events) {







          const line = evt.split("\n").find(l => l.startsWith("data: "));







          if (!line) continue;







          const p = JSON.parse(line.slice(6));







          if (p.type === "step") setAgentLog(l => [...l, { kind: "step", tag: p.tool, text: p.detail }]);







          else if (p.type === "result") { if (p.tool === "write_file" && p.ok) touched = true; setAgentLog(l => [...l, { kind: "result", ok: p.ok, tag: p.tool, text: p.detail }]); }







          else if (p.type === "message") setAgentLog(l => [...l, { kind: "message", tag: "AI", text: p.text }]);







          else if (p.type === "done") { setStatus({ kind: "ok", text: p.changedFiles.length ? `Updated: ${p.changedFiles.join(", ")}` : "Finished (no files changed)" }); }







          else if (p.type === "error") { setAgentLog(l => [...l, { kind: "error", tag: "error", text: p.error }]); setStatus({ kind: "err", text: p.error }); }







        }







      }







      if (touched) void refreshTree();







    } catch (err) {







      const msg = err instanceof Error ? err.message : "Agent failed";







      setAgentLog(l => [...l, { kind: "error", tag: "error", text: msg }]);







      setStatus({ kind: "err", text: msg });







    } finally {







      setAgentRunning(false);







    }







  }















  return (







    <div className="modal-overlay" onClick={onClose}>







      <div className="modal-card wide" onClick={e => e.stopPropagation()}>







        <div className="modal-head">







          <div>







            <h2>Computer access</h2>







            <p>Read the workspace, edit code, save changes and run dev commands — the same secure tools the agent uses to fix bugs.</p>







          </div>







          <button className="modal-close" onClick={onClose} title="Close">×</button>







        </div>















        <form className="ca-folder-bar" onSubmit={e => { e.preventDefault(); void refreshTree(); }}>







          <span className="ca-folder-ico">📁</span>







          <input







            className="ca-folder-input"







            value={rootPath}







            onChange={e => setRootPath(e.target.value)}







            placeholder="Folder to work on, e.g. C:\\Users\\Admin\\YnAiUdan  (blank = server default)"







            spellCheck={false}







          />







          <button type="button" className="ghost-btn" onClick={() => setShowPicker(true)}>Browse…</button>







          <button type="submit" className="ghost-btn">Open folder</button>







        </form>















        {showPicker && (







          <FolderPicker







            initial={rootPath}







            onClose={() => setShowPicker(false)}







            onPick={(picked) => { setShowPicker(false); setRootPath(picked); }}







          />







        )}















        <div className="ca-body">







          <div className="ca-tree">







            <div className="ca-tree-head">







              <span>Workspace files</span>







              <button className="row-btn" title="Refresh" onClick={() => void refreshTree()}>⟳</button>







            </div>







            {tree.length === 0 && <div className="side-empty">No files yet</div>}







            {tree.map(f => (







              <button







                key={f.path}







                type="button"







                className={`ca-file ${selected === f.path ? "active" : ""}`}







                onClick={() => void openFile(f.path)}







                title={f.path}







              >







                <span className="ca-ico">📄</span>







                <span className="label">{f.path}</span>







              </button>







            ))}







          </div>















          <div className="ca-main">







            <div className="ca-path">{selected || "Select a file to view and edit"}</div>







            <textarea







              className="ca-editor"







              value={content}







              placeholder="File contents appear here…"







              spellCheck={false}







              onChange={e => { setContent(e.target.value); setDirty(true); }}







              disabled={!selected}







            />







            <div className="ca-actions">







              <label className="ca-hint" htmlFor="ca-mode">Autonomy</label>







              <select id="ca-mode" value={mode} onChange={e => setMode(e.target.value as AutonomyMode)}>







                <option value="CONFIRM_TOOLS">Confirm tools</option>







                <option value="SAFE_AUTO">Safe auto</option>







                <option value="AUTONOMOUS">Autonomous</option>







                <option value="FULLY_CONTROLLED">Fully controlled</option>







              </select>







              <button className="primary" onClick={() => void saveFile()} disabled={!selected || !dirty || busy}>







                {busy ? "Working…" : dirty ? "Save changes" : "Saved"}







              </button>







            </div>















            <form className="ca-terminal" onSubmit={runCommand}>







              <span className="ca-hint">Run an allowlisted command (node, npm, pnpm, npx, git, tsc)</span>







              <div className="ca-cmd-row">







                <input







                  value={command}







                  onChange={e => setCommand(e.target.value)}







                  placeholder="e.g. tsc --noEmit"







                  disabled={busy}







                />







                <button className="primary" style={{ width: "auto", padding: "8px 16px" }} disabled={busy || !command.trim()}>Run</button>







              </div>







              {output && <pre className="ca-output">{output}</pre>}







            </form>















            {status && <div className={`ca-status ${status.kind}`}>{status.text}</div>}















            <form className="ca-agent" onSubmit={askAI}>







              <div className="ca-agent-head">







                <span className="field-label">Ask AI to fix</span>







                {agentRunning && <span className="ca-spin">⟳</span>}







              </div>







              <textarea







                value={instruction}







                onChange={e => setInstruction(e.target.value)}







                placeholder="Describe the bug or change, e.g. 'Fix the TypeScript error in src/utils.ts' — the AI will read the files and edit the code itself."







                disabled={agentRunning}







              />







              <div className="ca-actions">







                <span className="ca-hint">The AI reads, edits &amp; runs commands using the autonomy mode above.</span>







                <button className="primary" style={{ width: "auto", padding: "8px 16px" }} disabled={agentRunning || !instruction.trim()}>







                  {agentRunning ? "Working…" : "Fix it"}







                </button>







              </div>







              {agentLog.length > 0 && (







                <div className="ca-log">







                  {agentLog.map((row, i) => (







                    <div className={`ca-log-row ${row.kind === "error" ? "err" : row.kind === "message" ? "msg" : row.ok === false ? "err" : row.ok ? "ok" : ""}`} key={i}>







                      <span className="tag">{row.tag}</span>







                      <span className="body">{row.text}</span>







                    </div>







                  ))}







                  <div ref={logEndRef} />







                </div>







              )}







            </form>







          </div>







        </div>







      </div>







    </div>







  );







}















function AuthScreen({ onLogin, appearance }: { onLogin: (user: User) => void; appearance: Appearance }) {







  const [mode, setMode] = useState<"login" | "register">("login");







  const [name, setName] = useState("");







  const [tenantName, setTenantName] = useState("");







  const [email, setEmail] = useState("");







  const [password, setPassword] = useState("");







  const [error, setError] = useState("");







  const [busy, setBusy] = useState(false);















  async function submit(event: FormEvent) {







    event.preventDefault();







    setBusy(true);







    setError("");







    try {







      const data = await api<{ user: User; token: string }>(`/api/v1/auth/${mode}`, {







        method: "POST",







        body: JSON.stringify(mode === "login" ? { email, password } : { name, tenantName, email, password })







      });







      localStorage.setItem("ynaiudan_token", data.token);







      onLogin(data.user);







    } catch (e) {







      setError(e instanceof Error ? e.message : "Authentication failed");







    } finally {







      setBusy(false);







    }







  }















  return (







    <main className="auth-shell">







      <button







        className="foot-btn auth-theme-toggle"







        onClick={appearance.toggleTheme}







        title={appearance.theme === "dark" ? "Switch to white" : "Switch to black"}







      >







        {appearance.theme === "dark" ? "☀" : "☾"}







      </button>







      <form className="auth-card" onSubmit={submit}>







        <Brand size="lg" />







        <h1>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>







        {mode === "register" && (







          <>







            <label>Name<input value={name} onChange={e => setName(e.target.value)} required /></label>







            <label>Workspace name<input value={tenantName} onChange={e => setTenantName(e.target.value)} required /></label>







          </>







        )}







        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>







        <label>Password<input type="password" minLength={mode === "register" ? 12 : 1} value={password} onChange={e => setPassword(e.target.value)} required /></label>







        {error && <div className="error">{error}</div>}







        <button className="primary" disabled={busy}>{busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}</button>







        <button type="button" className="link-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>







          {mode === "login" ? "Create an account" : "Already have an account? Sign in"}







        </button>







      </form>







    </main>







  );







}















function App({ user, onLogout, appearance }: { user: User; onLogout: () => void; appearance: Appearance }) {







  const [projects, setProjects] = useState<Project[]>([]);







  const [conversations, setConversations] = useState<Conversation[]>([]);







  const [conversationId, setConversationId] = useState<string>();







  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);







  const [messages, setMessages] = useState<Message[]>([]);







  const [input, setInput] = useState("");







  const [search, setSearch] = useState("");







  const [searchOpen, setSearchOpen] = useState(false);



  const [recentsMenuOpen, setRecentsMenuOpen] = useState(false);



  const [pinned, setPinned] = useState<string[]>(() => {



    try { return JSON.parse(localStorage.getItem("ynaiudan_pinned") ?? "[]"); } catch { return []; }



  });



  const [infoPanel, setInfoPanel] = useState<"activity" | "plugins" | "explore" | null>(null);

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    // Use the saved model only if it is still a valid, selectable option.
    // Older builds may have persisted a model id that has since been removed
    // or retired (e.g. the deprecated gemini-1.5-pro, which now returns 404);
    // in that case fall back to the current default so the app keeps working.
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved && MODEL_OPTIONS.some(o => o.id === saved)) return saved;
    return MODEL_OPTIONS[0]?.id ?? "";
  });

  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const [plugins, setPlugins] = useState<Record<string, boolean>>(() => {

    try { return JSON.parse(localStorage.getItem("ynaiudan_plugins") ?? "{}"); } catch { return {}; }

  });







  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ynaiudan_sidebar") === "collapsed");







  const [editingId, setEditingId] = useState<string | null>(null);







  const [editValue, setEditValue] = useState("");







  const [menuFor, setMenuFor] = useState<string | null>(null);







  const [busy, setBusy] = useState(false);







  const [error, setError] = useState("");







  const [showAppearance, setShowAppearance] = useState(false);







  const [showComputer, setShowComputer] = useState(false);







  const [chatFolder, setChatFolder] = useState<string>(() => localStorage.getItem("ynaiudan_chat_folder") ?? "");







  const [showChatPicker, setShowChatPicker] = useState(false);







  const messagesEndRef = useRef<HTMLDivElement>(null);







  const abortRef = useRef<AbortController | null>(null);







  const [attachedImages, setAttachedImages] = useState<string[]>([]);







  const fileInputRef = useRef<HTMLInputElement>(null);















  const activeConversation = useMemo(







    () => conversations.find(c => c.id === conversationId),







    [conversations, conversationId]







  );







  const activeProject = useMemo(







    () => projects.find(p => p.id === activeProjectId) ?? null,







    [projects, activeProjectId]







  );















  const filteredConversations = useMemo(() => {







    const q = search.trim().toLowerCase();







    return conversations







      .filter(c => (activeProjectId ? c.projectId === activeProjectId : true))







      .filter(c => (q ? c.title.toLowerCase().includes(q) : true));







  }, [conversations, activeProjectId, search]);















  const grouped = useMemo(() => groupConversations(filteredConversations), [filteredConversations]);



  const pinnedConversations = useMemo(



    () => conversations.filter(c => pinned.includes(c.id)),



    [conversations, pinned]



  );















  useEffect(() => {







    Promise.all([api<Project[]>("/api/v1/projects"), api<Conversation[]>("/api/v1/conversations")])







      .then(([p, c]) => { setProjects(p); setConversations(c); })







      .catch(e => setError(e.message));







  }, []);















  useEffect(() => {







    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });







  }, [messages]);















  useEffect(() => {







    if (!menuFor) return;







    const close = () => setMenuFor(null);







    window.addEventListener("click", close);







    return () => window.removeEventListener("click", close);







  }, [menuFor]);















  function toggleCollapsed() {







    setCollapsed(prev => {







      const next = !prev;







      localStorage.setItem("ynaiudan_sidebar", next ? "collapsed" : "expanded");







      return next;







    });







  }















  function startNewConversation() {







    setConversationId(undefined);







    setMessages([]);







    setError("");







    setActiveProjectId(null);   // leaving a project view resets to all chats







    setInfoPanel(null);







  }







  function togglePlugin(id: string, def = true) {

    setPlugins(prev => {

      const cur = id in prev ? prev[id] : def;

      const next = { ...prev, [id]: !cur };

      localStorage.setItem("ynaiudan_plugins", JSON.stringify(next));

      return next;

    });

  }



  const pluginOn = (id: string, def = true) => (id in plugins ? plugins[id] : def);



  function togglePin(id: string, e?: React.MouseEvent) {







    e?.stopPropagation();







    setPinned(prev => {







      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];







      localStorage.setItem("ynaiudan_pinned", JSON.stringify(next));







      return next;







    });







  }















  function selectProject(id: string) {







    setActiveProjectId(prev => (prev === id ? null : id));







    startNewConversation();







  }















  async function openConversation(id: string) {







    if (editingId) return;







    try {







      const c = await api<Conversation & { messages: Message[] }>(`/api/v1/conversations/${id}`);







      setConversationId(id);







      setMessages(c.messages);







      setError("");







    } catch (e) {







      setError(e instanceof Error ? e.message : "Unable to open conversation");







    }







  }















  async function deleteConversation(id: string, e: React.MouseEvent) {







    e.stopPropagation();







    if (!confirm("Delete this conversation?")) return;







    const prev = conversations;







    setConversations(cs => cs.filter(c => c.id !== id));







    if (conversationId === id) startNewConversation();







    try {







      await api(`/api/v1/conversations/${id}`, { method: "DELETE" });







    } catch (err) {







      setConversations(prev);







      setError(err instanceof Error ? err.message : "Unable to delete conversation");







    }







  }















  async function clearAllConversations() {







    const targets = filteredConversations;







    if (targets.length === 0) return;







    if (!confirm(`Delete ${targets.length} conversation${targets.length > 1 ? "s" : ""}? This cannot be undone.`)) return;







    const prev = conversations;







    const ids = new Set(targets.map(t => t.id));







    setConversations(cs => cs.filter(c => !ids.has(c.id)));







    if (conversationId && ids.has(conversationId)) startNewConversation();







    try {







      await Promise.all(targets.map(t => api(`/api/v1/conversations/${t.id}`, { method: "DELETE" })));







    } catch (err) {







      setConversations(prev);







      setError(err instanceof Error ? err.message : "Unable to clear conversations");







    }







  }















  function beginRename(c: Conversation, e: React.MouseEvent) {







    e.stopPropagation();







    setEditingId(c.id);







    setEditValue(c.title);







  }















  async function commitRename(id: string) {







    const title = editValue.trim();







    setEditingId(null);







    const current = conversations.find(c => c.id === id);







    if (!title || !current || title === current.title) return;







    const prev = conversations;







    setConversations(cs => cs.map(c => (c.id === id ? { ...c, title } : c)));







    try {







      await api(`/api/v1/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });







    } catch (err) {







      setConversations(prev);







      setError(err instanceof Error ? err.message : "Unable to rename conversation");







    }







  }















  async function createProject() {







    const name = prompt("New project name")?.trim();







    if (!name) return;







    try {







      const project = await api<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify({ name }) });







      setProjects(prev => [project, ...prev]);







      setActiveProjectId(project.id);







      startNewConversation();







    } catch (err) {







      setError(err instanceof Error ? err.message : "Unable to create project");







    }







  }















  async function moveConversation(id: string, projectId: string | null) {







    setMenuFor(null);







    const current = conversations.find(c => c.id === id);







    if (!current || (current.projectId ?? null) === projectId) return;







    const prev = conversations;







    setConversations(cs => cs.map(c => (c.id === id ? { ...c, projectId } : c)));







    try {







      await api(`/api/v1/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ projectId }) });







    } catch (err) {







      setConversations(prev);







      setError(err instanceof Error ? err.message : "Unable to move conversation");







    }







  }















  // ---- Local, dependency-free image editing (runs in the browser canvas) ----
  // Applies simple edits to an attached image and returns a NEW data: URL that
  // the user can view AND download. No server, no `sharp`, no network needed.
  type ImgEdit = { grayscale?: boolean; invert?: boolean; sepia?: boolean; brightness?: number; rotate?: number; flipH?: boolean; flipV?: boolean; scale?: number; bgWhite?: boolean };

  function parseEditInstruction(text: string): ImgEdit | null {
    const t = text.toLowerCase();
    const e: ImgEdit = {};
    let any = false;
    if (/\b(grayscale|greyscale|black\s*and\s*white|b\s*&\s*w|black white|kala safed|black-and-white)\b/.test(t)) { e.grayscale = true; any = true; }
    if (/\b(invert|negative|ulta color)\b/.test(t)) { e.invert = true; any = true; }
    if (/\b(sepia|vintage|purana look)\b/.test(t)) { e.sepia = true; any = true; }
    if (/\b(bright(er|en)?|ujala|roshan)\b/.test(t)) { e.brightness = 1.3; any = true; }
    if (/\b(dark(er|en)?|dim)\b/.test(t)) { e.brightness = 0.7; any = true; }
    if (/\b(rotate|ghumao|rotat)\b/.test(t)) { const m = t.match(/(-?\d{1,3})\s*(deg|degree|°)/); e.rotate = m ? Number(m[1]) : 90; any = true; }
    if (/\b(flip\s*horizontal|mirror|horizontally)\b/.test(t)) { e.flipH = true; any = true; }
    if (/\b(flip\s*vertical|vertically|upside down)\b/.test(t)) { e.flipV = true; any = true; }
    if (/\b(white\s*background|bg white|safed background|remove\s*background|background hatao)\b/.test(t)) { e.bgWhite = true; any = true; }
    const sm = t.match(/\b(resize|scale|chhota|bada|shrink|enlarge)\b/);
    if (sm) { const pm = t.match(/(\d{1,3})\s*%/); e.scale = pm ? Number(pm[1]) / 100 : (/(chhota|shrink)/.test(t) ? 0.5 : 1.5); any = true; }
    return any ? e : null;
  }

  function applyImageEdit(src: string, edit: ImgEdit): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const scale = edit.scale && edit.scale > 0 ? edit.scale : 1;
          const rot = ((edit.rotate ?? 0) % 360 + 360) % 360;
          const swap = rot === 90 || rot === 270;
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = swap ? h : w;
          canvas.height = swap ? w : h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas not supported")); return; }
          if (edit.bgWhite) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          if (rot) ctx.rotate((rot * Math.PI) / 180);
          ctx.scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
          // pixel filters
          if (edit.grayscale || edit.invert || edit.sepia || edit.brightness) {
            const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = id.data;
            const b = edit.brightness ?? 1;
            for (let i = 0; i < d.length; i += 4) {
              let r = d[i] ?? 0, g = d[i + 1] ?? 0, bl = d[i + 2] ?? 0;
              if (edit.brightness) { r *= b; g *= b; bl *= b; }
              if (edit.sepia) { const nr = r * 0.393 + g * 0.769 + bl * 0.189; const ng = r * 0.349 + g * 0.686 + bl * 0.168; const nb = r * 0.272 + g * 0.534 + bl * 0.131; r = nr; g = ng; bl = nb; }
              if (edit.grayscale) { const y = 0.299 * r + 0.587 * g + 0.114 * bl; r = g = bl = y; }
              if (edit.invert) { r = 255 - r; g = 255 - g; bl = 255 - bl; }
              d[i] = Math.max(0, Math.min(255, r)); d[i + 1] = Math.max(0, Math.min(255, g)); d[i + 2] = Math.max(0, Math.min(255, bl));
            }
            ctx.putImageData(id, 0, 0);
          }
          resolve(canvas.toDataURL("image/png"));
        } catch (err) { reject(err instanceof Error ? err : new Error("Edit failed")); }
      };
      img.onerror = () => reject(new Error("Could not load the image for editing"));
      img.src = src;
    });
  }

  // If the user attached an image AND asked to modify/edit it, do the edit
  // locally and return true (so we skip the normal chat path). Produces a new
  // downloadable image.
  async function maybeEditImage(text: string, imgs: string[], convId: string): Promise<boolean> {
    const firstImg = imgs[0];
    if (!firstImg) return false;
    const t = text.trim().toLowerCase();
    const wantsEdit = /\b(edit|modify|change|change karo|modify karo|edit karo|badlo|convert|rotate|flip|resize|grayscale|greyscale|invert|sepia|bright|dark|mirror|background|crop|scale|ghumao)\b/.test(t);
    if (!wantsEdit) return false;
    const edit = parseEditInstruction(text);
    const userMsg: Message = { id: `u${Date.now()}`, role: "USER", content: text || "[edit image]", createdAt: new Date().toISOString() };
    const pending: Message = { id: `a${Date.now()}`, role: "ASSISTANT", content: "\u{1f58c}\ufe0f Editing your image\u2026", createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg, pending]);
    if (!edit) {
      setMessages(prev => prev.map(x => x.id === pending.id ? { ...x, content: "I can edit the attached image. Tell me what to change \u2014 e.g. \u201cmake it grayscale\u201d, \u201cinvert colors\u201d, \u201crotate 90\u201d, \u201cflip horizontal\u201d, \u201cbrighter\u201d, \u201cwhite background\u201d, or \u201cresize 50%\u201d." } : x));
      return true;
    }
    try {
      const out = await applyImageEdit(firstImg, edit);
      const applied = Object.keys(edit).filter(k => (edit as Record<string, unknown>)[k]).join(", ");
      const body = `Here\u2019s your edited image (${applied}). Click \u201cDownload\u201d under it to save.\n\n![edited](${out})`;
      setMessages(prev => prev.map(x => x.id === pending.id ? { ...x, content: body } : x));
      await api(`/api/v1/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ role: "USER", content: text || "[edit image]" }) }).catch(() => undefined);
      await api(`/api/v1/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ role: "ASSISTANT", content: body }) }).catch(() => undefined);
    } catch (e) {
      setMessages(prev => prev.map(x => x.id === pending.id ? { ...x, content: `\u274c Could not edit the image: ${e instanceof Error ? e.message : "unknown error"}` } : x));
    }
    return true;
  }

  // Detect an image-generation request and, if so, call the image endpoint

  // instead of the chat model. Returns true if it handled the message.

  async function maybeGenerateImage(text: string, convId: string): Promise<boolean> {

    const t = text.trim();
    if (!t) return false;

    const token = localStorage.getItem("ynaiudan_token");

    // Fast path: explicit slash command "/image <prompt>" stays instant/local.
    const m = t.match(/^\/(?:image|img|imagine)\s+(.+)/is);

    // Otherwise ask the AI whether this is an image request and let it build a
    // clean ENGLISH prompt. No keyword/regex lists \u2014 works for Hindi,
    // Hinglish, typos, any phrasing, in one place on the server.
    let prompt = "";
    let aspect = "square";
    let aiStyle = "";
    if (m) {
      prompt = m[1]?.trim() ?? "";
    } else {
      try {
        const intentRes = await fetch(`${API}/api/v1/image/intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ message: t, model: selectedModel })
        });
        if (intentRes.ok) {
          const intent = await intentRes.json();
          if (intent && intent.image === true && typeof intent.prompt === "string" && intent.prompt.trim()) {
            prompt = intent.prompt.trim();
            if (typeof intent.aspect === "string" && intent.aspect) aspect = intent.aspect;
            if (typeof intent.style === "string") aiStyle = intent.style;
          }
        }
      } catch {
        // If the intent check fails, fall through to normal chat (return false).
      }
    }

    if (!m && !prompt) return false;
    if (!prompt) prompt = t;

    // show the user's request + a placeholder assistant bubble

    const userMsg: Message = { id: `u${Date.now()}`, role: "USER", content: t, createdAt: new Date().toISOString() };

    const pending: Message = { id: `a${Date.now()}`, role: "ASSISTANT", content: "🎨 Generating your image…", createdAt: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg, pending]);

    try {

      // Aspect ratio + style are decided by the AI in the intent step (works
      // for any language / phrasing). For the explicit "/image ..." slash
      // command there is no intent call, so default to a square with no forced
      // style and let the image model interpret the prompt itself.
      const dims: Record<string, [number, number]> = { square: [1024, 1024], landscape: [1280, 720], portrait: [768, 1280] };
      const [width, height] = dims[aspect] ?? dims.square ?? [1024, 1024];
      const style = aiStyle || undefined;

      const res = await fetch(`${API}/api/v1/image/generate`, {

        method: "POST",

        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },

        body: JSON.stringify({ prompt: prompt || t, width, height, style })

      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.url) throw new Error(data.error ?? "Image generation failed");

      const body = `Here's your image for: "${prompt || t}"\n\n![generated](${data.url})`;

      setMessages(prev => prev.map(x => x.id === pending.id ? { ...x, content: body } : x));

      // persist both turns so the image survives reloads

      await api(`/api/v1/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ role: "USER", content: t }) }).catch(() => undefined);

      await api(`/api/v1/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ role: "ASSISTANT", content: body }) }).catch(() => undefined);

    } catch (e) {

      setMessages(prev => prev.map(x => x.id === pending.id ? { ...x, content: `❌ ${e instanceof Error ? e.message : "Image generation failed"}` } : x));

    }

    return true;

  }



  async function send(event: FormEvent) {







    event.preventDefault();







    const text = input.trim();







    const imgs = attachedImages;







    if (!text && imgs.length === 0) return;







    setBusy(true);







    setError("");







    try {







      let id = conversationId;







      if (!id) {







        const c = await api<Conversation>("/api/v1/conversations", {







          method: "POST",







          body: JSON.stringify({







            title: titleFromMessage(text || "Image chat"),







            ...(activeProjectId ? { projectId: activeProjectId } : {})







          })







        });







        id = c.id;







        setConversationId(id);







        setConversations(prev => [c, ...prev]);







      }







      setInput("");







      setAttachedImages([]);







      // If the user attached an image AND asked to edit it, edit it locally
      // and stop here (produces a new downloadable image).
      if (imgs.length > 0 && id && await maybeEditImage(text, imgs, id)) {

        setAttachedImages([]);

        setBusy(false);

        return;

      }

      // If this is an image-generation request, handle it and stop here.

      if (imgs.length === 0 && id && await maybeGenerateImage(text, id)) {

        setBusy(false);

        return;

      }







      const token = localStorage.getItem("ynaiudan_token");







      const controller = new AbortController();







      abortRef.current = controller;







      const response = await fetch(`${API}/api/v1/chat/stream`, {







        method: "POST",







        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },







        body: JSON.stringify({ conversationId: id, model: selectedModel, message: text, root: chatFolder || undefined, images: imgs.length ? imgs : undefined }),







        signal: controller.signal







      });







      if (!response.ok || !response.body) {







        const body = await response.json().catch(() => ({}));







        throw new Error(body.error ?? "AI streaming request failed");







      }







      setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: "USER", content: (text || "") + (imgs.length ? `${text ? "\n" : ""}\u{1f5bc}\ufe0f ${imgs.length} image${imgs.length > 1 ? "s" : ""} attached` : ""), createdAt: new Date().toISOString() }]);







      const reader = response.body.getReader();







      const decoder = new TextDecoder();







      let buffer = "";







      let assistantText = "";







      const assistantId = `assistant-${Date.now()}`;







      while (true) {







        const { value, done } = await reader.read();







        if (done) break;







        buffer += decoder.decode(value, { stream: true });







        const events = buffer.split("\n\n");







        buffer = events.pop() ?? "";







        for (const event of events) {







          const line = event.split("\n").find(l => l.startsWith("data: "));







          if (!line) continue;







          const payload = JSON.parse(line.slice(6));







          if (payload.type === "error") throw new Error(payload.error ?? "AI error");




          // Tool activity (list_files / read_file / write_file / run_command) —
          // attach to the assistant message so it renders as its own step card,
          // exactly like the Computer Access panel. This is what makes the chat
          // show WHAT the AI is doing and WHAT it changed.
          if (payload.type === "step" || payload.type === "result") {
            const step = { kind: payload.type, tool: payload.tool, detail: payload.detail, ok: payload.ok } as ToolStep;
            setMessages(prev => {
              const existing = prev.find(m => m.id === assistantId);
              if (existing) return prev.map(m => m.id === assistantId ? { ...m, steps: [...(m.steps ?? []), step] } : m);
              return [...prev, { id: assistantId, role: "ASSISTANT", content: assistantText, steps: [step], createdAt: new Date().toISOString() }];
            });
            continue;
          }
          if (payload.type === "changed") {
            const files = (payload.changedFiles ?? []) as string[];
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, changedFiles: files } : m));
            continue;
          }







          if (payload.type === "text") {







            assistantText += payload.text;







            setMessages(prev => {







              const existing = prev.find(m => m.id === assistantId);







              if (existing) return prev.map(m => m.id === assistantId ? { ...m, content: assistantText } : m);







              return [...prev, { id: assistantId, role: "ASSISTANT", content: assistantText, createdAt: new Date().toISOString() }];







            });







          }







        }







      }







    } catch (e) {







      if (e instanceof DOMException && e.name === "AbortError") {







        // User stopped generation — not an error.







      } else {







        setError(e instanceof Error ? e.message : "Unable to send message");







      }







    } finally {







      setBusy(false);







      abortRef.current = null;







    }







  }















  function stopGenerating() {







    abortRef.current?.abort();







    abortRef.current = null;







    setBusy(false);







  }















  async function onPickImages(files: FileList | null) {







    if (!files || files.length === 0) return;







    const readers: Promise<string>[] = [];







    for (const file of Array.from(files).slice(0, 6)) {







      if (!file.type.startsWith("image/")) continue;







      if (file.size > 8 * 1024 * 1024) { setError(`Image "${file.name}" is too large (max 8MB).`); continue; }







      readers.push(new Promise<string>((resolve, reject) => {







        const fr = new FileReader();







        fr.onload = () => resolve(String(fr.result));







        fr.onerror = () => reject(new Error("read failed"));







        fr.readAsDataURL(file);







      }));







    }







    try {







      const urls = await Promise.all(readers);







      setAttachedImages(prev => [...prev, ...urls].slice(0, 6));







    } catch {







      setError("Could not read one of the images.");







    }







    if (fileInputRef.current) fileInputRef.current.value = "";







  }















  function onPasteComposer(e: React.ClipboardEvent) {







    const items = e.clipboardData?.items;







    if (!items) return;







    const files: File[] = [];







    for (const it of Array.from(items)) {







      if (it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) files.push(f); }







    }







    if (files.length) {







      e.preventDefault();







      const dt = new DataTransfer();







      files.forEach(f => dt.items.add(f));







      void onPickImages(dt.files);







    }







  }















  useEffect(() => {







    if (chatFolder) localStorage.setItem("ynaiudan_chat_folder", chatFolder);







    else localStorage.removeItem("ynaiudan_chat_folder");







  }, [chatFolder]);















  const initials = (user.displayName || user.email || "?").trim().charAt(0).toUpperCase();















  return (







    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>







      <aside className="sidebar">







        <div className="side-top">







          {!collapsed && <Brand />}







          <button className="collapse-btn" onClick={toggleCollapsed} title={collapsed ? "Expand" : "Collapse"}>







            {collapsed ? "»" : "«"}







          </button>







        </div>















        {/* ---- Primary navigation (Amazon Quick-style) ---- */}







        <nav className="side-nav">







          <button className="nav-item" onClick={startNewConversation} title="New chat">







            <span className="nav-ico">✎</span>{!collapsed && <span className="nav-label">New chat</span>}







          </button>







          <button className={`nav-item ${infoPanel === "activity" ? "active" : ""}`} onClick={() => { startNewConversation(); setInfoPanel("activity"); }} title="Activity">







            <span className="nav-ico">🕑</span>{!collapsed && <span className="nav-label">Activity</span>}







          </button>







          <button className="nav-item" onClick={() => { setSearchOpen(true); setActiveProjectId(null); setInfoPanel(null); }} title="Library">







            <span className="nav-ico">📚</span>{!collapsed && <span className="nav-label">Library</span>}







          </button>







          <button className={`nav-item ${infoPanel === "plugins" ? "active" : ""}`} onClick={() => { startNewConversation(); setInfoPanel("plugins"); }} title="Plugins">







            <span className="nav-ico">🧩</span>{!collapsed && <span className="nav-label">Plugins</span>}







          </button>







          <button className={`nav-item ${infoPanel === "explore" ? "active" : ""}`} onClick={() => { startNewConversation(); setInfoPanel("explore"); }} title="Explore">







            <span className="nav-ico">⋯</span>{!collapsed && <span className="nav-label">Explore</span>}







          </button>







          <button className="nav-item" onClick={() => { setInfoPanel(null); setShowAppearance(true); }} title="Settings">







            <span className="nav-ico">⚙</span>{!collapsed && <span className="nav-label">Settings</span>}







          </button>







        </nav>















        {!collapsed && (







          <div className="side-section">







            <div className="conv-head">







              <span className="side-label">Projects</span>







              <button className="clear-all add" onClick={createProject} title="New project">+ New</button>







            </div>







            <div className="side-list">







              {projects.length === 0 && <div className="side-empty">No projects yet</div>}







              {projects.map(p => (







                <button







                  type="button"







                  className={`side-item project ${p.id === activeProjectId ? "active" : ""}`}







                  key={p.id}







                  onClick={() => selectProject(p.id)}







                  title={p.name}







                >







                  <span className="dot" /> <span className="label">{p.name}</span>







                </button>







              ))}







            </div>







          </div>







        )}















        {!collapsed && pinnedConversations.length > 0 && (







          <div className="side-section">







            <div className="conv-head">







              <span className="side-label">Pinned</span>







            </div>







            <div className="side-list">







              {pinnedConversations.map(c => (







                <div







                  className={`side-item conversation ${c.id === conversationId ? "active" : ""}`}







                  key={`pin-${c.id}`}







                  onClick={() => openConversation(c.id)}







                  title={c.title}







                >







                  <span className="label">{c.title}</span>







                  <span className="row-actions">







                    <button className="row-btn" title="Unpin" onClick={e => togglePin(c.id, e)}>📌</button>







                  </span>







                </div>







              ))}







            </div>







          </div>







        )}















        {!collapsed && (







          <div className="side-section grow">







            <div className="conv-head recents-head">







              <span className="side-label">







                {activeProject ? `Chats · ${activeProject.name}` : "Recents"}







              </span>







              <span className="recents-actions">







                <button className="recents-ico" onClick={startNewConversation} title="New chat">✎</button>







                <button className={`recents-ico ${searchOpen ? "active" : ""}`} onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearch(""); }} title="Search chats">⌕</button>







                <span className="recents-menu-wrap">







                  <button className={`recents-ico ${recentsMenuOpen ? "active" : ""}`} onClick={() => setRecentsMenuOpen(o => !o)} title="More options">⋯</button>







                  {recentsMenuOpen && (







                    <>







                      <div className="menu-backdrop" onClick={() => setRecentsMenuOpen(false)} />







                      <div className="recents-menu" onClick={e => e.stopPropagation()}>







                        <button className="recents-menu-item" onClick={() => { setRecentsMenuOpen(false); startNewConversation(); }}>







                          <span className="rm-ico">✎</span> New chat







                        </button>







                        <button className="recents-menu-item" onClick={() => { setRecentsMenuOpen(false); setSearchOpen(true); }}>







                          <span className="rm-ico">⌕</span> Search chats







                        </button>







                        {filteredConversations.length > 0 && (







                          <button className="recents-menu-item danger" onClick={() => { setRecentsMenuOpen(false); clearAllConversations(); }}>







                            <span className="rm-ico">🗑</span> Delete all shown







                          </button>







                        )}







                      </div>







                    </>







                  )}







                </span>







              </span>







            </div>







            {searchOpen && (







              <div className="search-box recents-search">







                <span className="search-ico">⌕</span>







                <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats" />







                {search && <button className="search-clear" onClick={() => setSearch("")}>×</button>}







              </div>







            )}







            <div className="side-list scroll">







              {filteredConversations.length === 0 && (







                <div className="side-empty">{search ? "No matches" : "No conversations yet"}</div>







              )}







              {grouped.map(([label, items]) => (







                <div className="conv-group" key={label}>







                  <span className="side-label sub">{label}</span>







                  {items.map(c => (







                    <div







                      className={`side-item conversation ${c.id === conversationId ? "active" : ""} ${editingId === c.id ? "editing" : ""}`}







                      key={c.id}







                      onClick={() => openConversation(c.id)}







                      onDoubleClick={e => beginRename(c, e)}







                      title={c.title}







                    >







                      {editingId === c.id ? (







                        <input







                          className="rename-input"







                          autoFocus







                          value={editValue}







                          onChange={e => setEditValue(e.target.value)}







                          onClick={e => e.stopPropagation()}







                          onBlur={() => commitRename(c.id)}







                          onKeyDown={e => {







                            if (e.key === "Enter") { e.preventDefault(); commitRename(c.id); }







                            if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }







                          }}







                        />







                      ) : (







                        <>







                          <span className="label">{c.title}</span>







                          <span className="row-actions">







                            <button className={`row-btn ${pinned.includes(c.id) ? "pinned" : ""}`} title={pinned.includes(c.id) ? "Unpin" : "Pin"} onClick={e => togglePin(c.id, e)}>📌</button>







                            <button className="row-btn" title="Move to project" onClick={e => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }}>⋯</button>







                            <button className="row-btn" title="Rename" onClick={e => beginRename(c, e)}>✎</button>







                            <button className="row-btn del" title="Delete" onClick={e => deleteConversation(c.id, e)}>🗑</button>







                          </span>







                          {menuFor === c.id && (







                            <div className="row-menu" onClick={e => e.stopPropagation()}>







                              <div className="row-menu-label">Move to project</div>







                              <button className={`row-menu-item ${!c.projectId ? "active" : ""}`} onClick={() => moveConversation(c.id, null)}>







                                No project







                              </button>







                              {projects.map(p => (







                                <button key={p.id} className={`row-menu-item ${c.projectId === p.id ? "active" : ""}`} onClick={() => moveConversation(c.id, p.id)}>







                                  <span className="dot" /> {p.name}







                                </button>







                              ))}







                              {projects.length === 0 && (







                                <button className="row-menu-item create" onClick={async () => { await createProject(); }}>







                                  + Create a project







                                </button>







                              )}







                            </div>







                          )}







                        </>







                      )}







                    </div>







                  ))}







                </div>







              ))}







            </div>







          </div>







        )}















        {collapsed && <div className="side-section grow" />}















        <div className="side-footer">







          <div className="avatar" title={user.displayName}>{initials}</div>







          {!collapsed && (







            <div className="who">







              <div className="who-name">{user.displayName}</div>







              <div className="who-email">{user.email}</div>







            </div>







          )}







          {!collapsed && <button className="logout" onClick={onLogout} title="Sign out">⎋</button>}







        </div>







      </aside>















      <main className="chat-area">







        <header>







          <span className="chat-title">{activeConversation?.title ?? "New conversation"}</span>







          {activeProject && <span className="chat-badge">{activeProject.name}</span>}







          <div className="header-actions">







            <button







              className={`folder-chip ${chatFolder ? "active" : ""}`}







              onClick={() => setShowChatPicker(true)}







              title={chatFolder ? `AI is working on: ${chatFolder}` : "Select a folder for the AI to access"}







            >







              <span className="fc-ico">📁</span>







              <span className="fc-label">{chatFolder ? chatFolder.split(/[\\/]/).filter(Boolean).pop() : "Select folder"}</span>







              {chatFolder && <span className="fc-clear" onClick={(e) => { e.stopPropagation(); setChatFolder(""); }} title="Clear">×</span>}







            </button>







            <button className="foot-btn" onClick={() => setShowComputer(true)} title="Computer access">🖥</button>







            <button className="foot-btn" onClick={() => setShowAppearance(true)} title="Appearance">🎨</button>
            <button className="foot-btn" onClick={appearance.toggleTheme} title={appearance.theme === "dark" ? "Switch to bright" : "Switch to dark"}>
              {appearance.theme === "dark" ? "☀" : "☾"}
            </button>







          </div>







        </header>







        <section className="messages">







          {infoPanel && messages.length === 0 ? (







            <div className="info-panel">







              <h1 className="info-title">







                {infoPanel === "activity" ? "🕑 Activity" : infoPanel === "plugins" ? "🧩 Plugins" : "⋯ Explore"}







              </h1>







              {infoPanel === "activity" && (







                <div className="info-body">







                  <p>Your most recent conversations across all projects.</p>







                  <div className="info-list">







                    {conversations.slice(0, 12).map(c => (







                      <button key={c.id} className="info-row" onClick={() => { setInfoPanel(null); openConversation(c.id); }}>







                        <span className="info-row-title">{c.title}</span>







                        <span className="info-row-meta">{new Date(c.updatedAt).toLocaleString()}</span>







                      </button>







                    ))}







                    {conversations.length === 0 && <p className="info-empty">No activity yet.</p>}







                  </div>







                </div>







              )}







              {infoPanel === "plugins" && (



                <div className="info-body">



                  <p>Toggle the capabilities the assistant may use. Some plugins also have a quick action.</p>



                  <div className="plugin-grid">



                    {[

                      { id: "files", ico: "📂", name: "File access", desc: "Read & edit files in your selected folder", action: () => { setInfoPanel(null); setShowChatPicker(true); }, actionLabel: "Pick folder" },

                      { id: "commands", ico: "🖥", name: "Run commands", desc: "Build, typecheck, install in your project", action: () => { setInfoPanel(null); setShowComputer(true); }, actionLabel: "Open terminal" },

                      { id: "vision", ico: "🖼", name: "Vision", desc: "Read attached screenshots & images", action: () => { setInfoPanel(null); fileInputRef.current?.click(); }, actionLabel: "Attach image" },

                      { id: "imagegen", ico: "🎨", name: "Image generation", desc: "Create images from a text prompt", action: () => { setInfoPanel(null); setInput("/image "); }, actionLabel: "Try it" },

                      { id: "github", ico: "🐙", name: "GitHub", desc: "Branches, commits & pull requests", action: null, actionLabel: "" },

                      { id: "web", ico: "🔎", name: "Web research", desc: "Look things up online", action: () => { setInfoPanel(null); setInput("Search the web for "); }, actionLabel: "Search" }

                    ].map(pl => (

                      <div className={`plugin-card ${pluginOn(pl.id) ? "on" : "off"}`} key={pl.id}>

                        <div className="plugin-head">

                          <span className="plugin-ico">{pl.ico}</span>

                          <span className="plugin-name">{pl.name}</span>

                          <button

                            type="button"

                            className={`plugin-switch ${pluginOn(pl.id) ? "on" : ""}`}

                            onClick={() => togglePlugin(pl.id)}

                            title={pluginOn(pl.id) ? "Disable" : "Enable"}

                            role="switch"

                            aria-checked={pluginOn(pl.id)}

                          >

                            <span className="knob" />

                          </button>

                        </div>

                        <div className="plugin-desc">{pl.desc}</div>

                        {pl.action && pluginOn(pl.id) && (

                          <button type="button" className="plugin-action" onClick={pl.action}>{pl.actionLabel} →</button>

                        )}

                      </div>

                    ))}



                  </div>



                </div>



              )}







              {infoPanel === "explore" && (







                <div className="info-body">







                  <p>Quick ways to get started:</p>







                  <div className="info-cards">







                    <button className="info-card" onClick={() => { setInfoPanel(null); setInput("Create an image of "); }}>🎨 Create an image</button>







                    <button className="info-card" onClick={() => { setInfoPanel(null); setInput("Write or edit "); }}>✍ Write or edit</button>







                    <button className="info-card" onClick={() => { setInfoPanel(null); setInput("Review my project and suggest improvements"); }}>🧐 Review my code</button>







                    <button className="info-card" onClick={() => { setInfoPanel(null); setInput("Search the web for "); }}>🌐 Search the web</button>







                  </div>







                </div>







              )}







            </div>







          ) : messages.length === 0 ? (







            <div className="welcome">







              <img src="/ynlogo.png" alt="YN Software" className="welcome-logo" />







              <h1>What can I help you build?</h1>







              <p>Real AI powered by the configured provider. Coding and agent tools plug into the same secure tool layer.</p>







              <button className={`folder-chip ${chatFolder ? "active" : ""}`} style={{ marginTop: 14 }} onClick={() => setShowChatPicker(true)}>







                <span className="fc-ico">📁</span>







                <span className="fc-label">{chatFolder ? `Working on: ${chatFolder}` : "Select a folder so I can read & fix your code"}</span>







              </button>







            </div>







          ) : (







            messages.map(m => (







              <article className={`message ${m.role.toLowerCase()}`} key={m.id}>







                <strong>{m.role === "USER" ? user.displayName : "YnAiUdan"}</strong>







                {m.steps && m.steps.length > 0 && (
                  <div className="chat-steps">
                    {m.steps.map((row, i) => (
                      <div className={`ca-log-row ${row.kind === "result" ? (row.ok === false ? "err" : "ok") : ""}`} key={i}>
                        <span className="tag">{row.tool}</span>
                        <span className="body">{row.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                {m.content.trim() && <div className="bubble">{renderMessageContent(m.content)}</div>}
                {m.changedFiles && m.changedFiles.length > 0 && (
                  <div className="chat-changed">✅ Updated: {m.changedFiles.join(", ")}</div>
                )}







              </article>







            ))







          )}







          {busy && <div className="typing"><span></span><span></span><span></span></div>}







          <div ref={messagesEndRef} />







        </section>







        {error && <div className="inline-error">{error}</div>}







        <form className="composer-wrap" onSubmit={send}>
          <div className="composer-topbar">
            <button type="button" className="new-conv-btn" onClick={startNewConversation} title="Start a new conversation">
              <span className="ncb-ico">➕</span>
              <span className="ncb-label">New conversation</span>
            </button>
          </div>







          {attachedImages.length > 0 && (







            <div className="img-strip">







              {attachedImages.map((src, i) => (







                <div className="img-thumb" key={i}>







                  <img src={src} alt={`attachment ${i + 1}`} />







                  <button type="button" className="img-del" title="Remove" onClick={() => setAttachedImages(prev => prev.filter((_, j) => j !== i))}>×</button>







                </div>







              ))}







            </div>







          )}







          <div className="composer">
            <button
              type="button"
              className="attach-btn"
              title="Upload image / screenshot"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >+</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={e => void onPickImages(e.target.files)}
            />
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={onPasteComposer}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e as unknown as FormEvent); } }}
              placeholder="Message YnAiUdan…  (paste or attach a screenshot)"
              rows={2}
              disabled={busy}
            />
            <div className="composer-right">
              <div className="model-picker">
                <button type="button" className="model-btn" onClick={() => setModelMenuOpen(o => !o)} title="Choose model">
                  <span className="model-tag">{MODEL_OPTIONS.find(m => m.id === selectedModel)?.tag ?? "✨"}</span>
                  <span className="model-name">{MODEL_OPTIONS.find(m => m.id === selectedModel)?.label ?? "Smart"}</span>
                  <span className="model-caret">▾</span>
                </button>
                {modelMenuOpen && (
                  <>
                    <div className="menu-backdrop" onClick={() => setModelMenuOpen(false)} />
                    <div className="model-menu" onClick={e => e.stopPropagation()}>
                      {MODEL_OPTIONS.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className={`model-opt ${m.id === selectedModel ? "active" : ""}`}
                          onClick={() => { setSelectedModel(m.id); localStorage.setItem(MODEL_KEY, m.id); setModelMenuOpen(false); }}
                        >
                          <span className="model-opt-tag">{m.tag}</span>
                          <span className="model-opt-text">
                            <span className="model-opt-label">{m.label}</span>
                            <span className="model-opt-blurb">{m.blurb}</span>
                          </span>
                          {m.id === selectedModel && <span className="model-opt-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {busy ? (
                <button type="button" className="stop-btn" onClick={stopGenerating} title="Stop generating">
                  <span className="stop-ico" /> Stop
                </button>
              ) : (
                <button className="send-btn" disabled={!input.trim() && attachedImages.length === 0}>Send</button>
              )}
            </div>
          </div>

        </form>







      </main>















      {showAppearance && <AppearanceModal appearance={appearance} onClose={() => setShowAppearance(false)} />}







      {showComputer && <ComputerAccessModal onClose={() => setShowComputer(false)} />}







      {showChatPicker && (







        <FolderPicker







          initial={chatFolder}







          onClose={() => setShowChatPicker(false)}







          onPick={(picked) => { setShowChatPicker(false); setChatFolder(picked); }}







        />







      )}







    </div>







  );







}















function Root() {







  const appearance = useAppearance();







  const [user, setUser] = useState<User | null>(null);







  useEffect(() => {







    api<{ user: User }>("/api/v1/auth/me").then(r => setUser(r.user)).catch(() => localStorage.removeItem("ynaiudan_token"));







  }, []);







  if (!user) return <AuthScreen onLogin={setUser} appearance={appearance} />;







  return <App user={user} onLogout={() => { localStorage.removeItem("ynaiudan_token"); setUser(null); }} appearance={appearance} />;







}















createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);







