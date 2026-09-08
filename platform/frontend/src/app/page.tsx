"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Contact = {
  name: string;
  company: string;
  location: string;
  website: string;
};

type Evidence = { claim?: string; source_url?: string | null };
type SearchStrategy = {
  title_boolean?: string;
  keyword_boolean?: string;
  lead_filters?: Record<string, unknown>;
  account_filters?: Record<string, unknown>;
  why_it_should_rediscover_anchor?: string[];
  what_was_broadened?: string[];
  likely_false_positives?: string[];
};

type ContactAnalysis = {
  input?: Partial<Contact>;
  resolution?: {
    resolved?: boolean;
    resolved_person?: string | null;
    resolved_company?: string | null;
    confidence?: number;
    ambiguity_note?: string | null;
  };
  person_profile?: {
    current_title?: string | null;
    function?: string | null;
    management_level?: string;
    sales_navigator_seniority?: string[];
    confidence?: number;
    basis?: string;
    evidence?: Evidence[];
  };
  company_profile?: {
    industry?: string | null;
    niche_terms?: string[];
    headquarters_or_service_area?: string | null;
    employee_estimate?: {
      low?: number;
      high?: number;
      best_guess?: number;
      linkedin_headcount_band?: string | null;
      confidence?: string;
      basis?: string;
    };
    revenue_estimate?: {
      low_usd?: number;
      high_usd?: number;
      confidence?: string;
      basis?: string;
      is_publicly_reported?: boolean;
    };
    evidence?: Evidence[];
  };
  validation_search?: SearchStrategy;
  expansion_search?: SearchStrategy;
};

type StrategyResult = {
  summary?: string;
  contacts?: ContactAnalysis[];
  combined_strategy?: {
    available?: boolean;
    shared_buyer_pattern?: string;
    archetypes?: Array<{
      name?: string;
      based_on_contacts?: string[];
      title_boolean?: string;
      keyword_boolean?: string;
      lead_filters?: Record<string, unknown>;
      why?: string[];
    }>;
  };
  human_validation_steps?: string[];
  validation_warnings?: string[];
  meta?: {
    generated_at?: string;
    model?: string;
    web_research_enabled?: boolean;
    input_contact_count?: number;
    loaded_from_cache?: boolean;
  };
};

type RunRecord = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  progress: number;
  result: StrategyResult | null;
  error: string | null;
};

type Health = {
  status: "ok";
  api_key_configured: boolean;
  model: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const emptyContact = (): Contact => ({ name: "", company: "", location: "", website: "" });

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = payload?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) {
      const message = detail.map((item) => {
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return String(item);
      }).join(" · ");
      throw new Error(message);
    }
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function formatUsd(value?: number): string {
  if (!value) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && value >= 1000) return formatUsd(value);
  return String(value);
}

function Confidence({ value }: { value?: number | string }) {
  const label = typeof value === "number" ? `${Math.round(value * 100)}% confidence` : `${value ?? "Unknown"} confidence`;
  return <span className="confidence-pill">{label}</span>;
}

function BooleanField({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="boolean-field">
      <div><span>{label}</span><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
      <code>{value || "No Boolean query returned"}</code>
    </div>
  );
}

function Filters({ title, values }: { title: string; values?: Record<string, unknown> }) {
  const entries = Object.entries(values ?? {}).filter(([, value]) => formatFilterValue(value) !== "—");
  return (
    <div className="filter-block">
      <span>{title}</span>
      {entries.length ? (
        <dl>{entries.map(([key, value]) => (
          <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{formatFilterValue(value)}</dd></div>
        ))}</dl>
      ) : <p>No structured filters returned.</p>}
    </div>
  );
}

function buildClaudeSalesNavigatorPrompt(search?: SearchStrategy): string {
  const listFilters = (values?: Record<string, unknown>) => {
    const entries = Object.entries(values ?? {}).filter(([, value]) => formatFilterValue(value) !== "—");
    return entries.length
      ? entries.map(([key, value]) => `- ${key.replaceAll("_", " ")}: ${formatFilterValue(value)}`).join("\n")
      : "- None provided";
  };

  return `Use the current LinkedIn Sales Navigator tab and configure this search for me.

Work carefully and use the values exactly as written. Clear conflicting values in the corresponding fields, but do not change filters that are not listed. For multi-value filters, select every listed value. If LinkedIn uses a slightly different label, choose the closest unambiguous match. If a value is unavailable or ambiguous, leave that field unchanged and tell me which value could not be applied.

TITLE BOOLEAN
${search?.title_boolean || "No title Boolean provided"}

KEYWORD BOOLEAN
${search?.keyword_boolean || "No keyword Boolean provided"}

LEAD FILTERS
${listFilters(search?.lead_filters)}

ACCOUNT FILTERS
${listFilters(search?.account_filters)}

Apply the filters in Sales Navigator. Do not send messages, save leads, save accounts, or start outreach. When finished, summarize what you applied and list anything you could not match.`;
}

function ClaudeChromePrompt({ search }: { search?: SearchStrategy }) {
  const [copied, setCopied] = useState(false);
  const prompt = buildClaudeSalesNavigatorPrompt(search);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="claude-prompt">
      <div className="claude-prompt-heading">
        <div><span>Claude in Chrome</span><strong>Fill this search in Sales Navigator</strong></div>
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy prompt"}</button>
      </div>
      <p>Copy this into Claude while your Sales Navigator search is open.</p>
      <textarea readOnly value={prompt} aria-label="Claude in Chrome Sales Navigator prompt" rows={10} />
    </div>
  );
}

function SearchCard({ title, eyebrow, search }: { title: string; eyebrow: string; search?: SearchStrategy }) {
  return (
    <article className="search-card">
      <header><div><span>{eyebrow}</span><h3>{title}</h3></div></header>
      <BooleanField label="Title Boolean" value={search?.title_boolean} />
      <BooleanField label="Keyword Boolean" value={search?.keyword_boolean} />
      <div className="filter-grid">
        <Filters title="Lead filters" values={search?.lead_filters} />
        <Filters title="Account filters" values={search?.account_filters} />
      </div>
      {(search?.why_it_should_rediscover_anchor?.length || search?.what_was_broadened?.length) ? (
        <div className="search-rationale">
          <strong>{search.why_it_should_rediscover_anchor ? "Why it should work" : "What was broadened"}</strong>
          <ul>{(search.why_it_should_rediscover_anchor ?? search.what_was_broadened ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}
      <ClaudeChromePrompt search={search} />
    </article>
  );
}

function EvidenceList({ items = [] }: { items?: Evidence[] }) {
  if (!items.length) return <p className="muted-copy">No source evidence returned.</p>;
  return (
    <ul className="evidence-list">
      {items.map((item, index) => (
        <li key={`${item.claim}-${index}`}>
          <span>{item.claim || "Supporting source"}</span>
          {item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">Open source ↗</a> : <em>Inferred</em>}
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([emptyContact()]);
  const [agencyContext, setAgencyContext] = useState("");
  const [refresh, setRefresh] = useState(false);
  const [useWeb, setUseWeb] = useState(true);
  const [searchContextSize, setSearchContextSize] = useState<"low" | "medium" | "high">("low");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState(0);
  const [feedbackState, setFeedbackState] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestJson<Health>(`${API_URL}/health`)
      .then((value) => { setHealth(value); setHealthError(false); })
      .catch(() => setHealthError(true));
  }, []);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const record = await requestJson<RunRecord>(`${API_URL}/api/runs/${runId}`);
        if (cancelled) return;
        setRun(record);
        if (record.status === "queued" || record.status === "running") {
          timer = window.setTimeout(poll, 1800);
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Could not read research progress");
      }
    };

    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [runId]);

  const updateContact = (index: number, field: keyof Contact, value: string) => {
    setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const removeContact = (index: number) => {
    setContacts((current) => current.length === 1 ? [emptyContact()] : current.filter((_, itemIndex) => itemIndex !== index));
  };

  const submitRun = async () => {
    setError(null);
    const prepared = contacts.map((contact) => ({
      name: contact.name.trim(),
      company: contact.company.trim(),
      location: contact.location.trim() || null,
      website: contact.website.trim() || null,
    }));
    if (prepared.some((contact) => !contact.name || !contact.company)) {
      setError("Every buyer needs both a person name and company.");
      return;
    }

    try {
      const accepted = await requestJson<{ id: string }>(`${API_URL}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: prepared,
          agency_context: agencyContext,
          refresh,
          use_web: useWeb,
          search_context_size: searchContextSize,
        }),
      });
      setRun({ id: accepted.id, status: "queued", stage: "Waiting for a research worker", progress: 5, result: null, error: null });
      setRunId(accepted.id);
      setActiveContact(0);
      setFeedbackState(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not start the research run");
    }
  };

  const importWorkbook = async (event: ChangeEvent<HTMLInputElement>) => {
    const workbook = event.target.files?.[0];
    if (!workbook) return;
    setError(null);
    const form = new FormData();
    form.append("workbook", workbook);
    try {
      const imported = await requestJson<Array<Partial<Contact>>>(`${API_URL}/api/contacts/import`, { method: "POST", body: form });
      if (!imported.length) throw new Error("The workbook did not contain any contact rows.");
      setContacts(imported.map((contact) => ({
        name: contact.name ?? "",
        company: contact.company ?? "",
        location: contact.location ?? "",
        website: contact.website ?? "",
      })));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import the workbook");
    } finally {
      event.target.value = "";
    }
  };

  const downloadResult = () => {
    if (!run?.result) return;
    const href = URL.createObjectURL(new Blob([JSON.stringify(run.result, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `reverse-boolean-strategy-${run.id.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const sendFeedback = async (outcome: "found" | "not_found" | "partial") => {
    if (!run) return;
    setFeedbackState("Saving…");
    try {
      await requestJson(`${API_URL}/api/runs/${run.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, contact_index: activeContact, notes: "" }),
      });
      setFeedbackState(outcome === "found" ? "Found — saved" : outcome === "partial" ? "Partially found — saved" : "Not found — saved");
    } catch (feedbackError) {
      setFeedbackState(feedbackError instanceof Error ? feedbackError.message : "Could not save feedback");
    }
  };

  const isRunning = run?.status === "queued" || run?.status === "running";
  const result = run?.result;
  const analyses = result?.contacts ?? [];
  const analysis = analyses[activeContact];
  const employee = analysis?.company_profile?.employee_estimate;
  const revenue = analysis?.company_profile?.revenue_estimate;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Reverse Boolean Lab home">
          <span className="brand-mark" aria-hidden="true">RB</span>
          <span><strong>Reverse Boolean Lab</strong><small>Buyer intelligence workspace</small></span>
        </a>
        <div className="topbar-actions">
          <Link className="nav-link" href="/outreach">Outreach tracker</Link>
          <div className={`engine-status ${healthError ? "offline" : ""}`}>
            <span className="status-dot" />
            {healthError ? "Engine unavailable" : health ? `${health.model} · ${health.api_key_configured ? "ready" : "key needed"}` : "Checking engine"}
          </div>
        </div>
      </header>

      <section className="workspace-heading">
        <div>
          <p className="eyebrow">New analysis</p>
          <h1>Turn known buyers into a repeatable search strategy.</h1>
          <p className="lede">Start with the people you already know. The research engine reconstructs their buyer pattern, then builds anonymous validation and expansion searches.</p>
        </div>
        <div className="run-meta"><span>Research mode</span><strong>{useWeb ? `${searchContextSize} web context` : "Model only"}</strong></div>
      </section>

      <section className="work-grid">
        <div className="panel input-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><div><h2>Define the signal</h2><p>Tell the engine what you sell and who already responds.</p></div></div>
            <>
              <input ref={fileInput} className="file-input" type="file" accept=".xlsx" onChange={importWorkbook} />
              <button className="text-button" type="button" onClick={() => fileInput.current?.click()}>Import Excel</button>
            </>
          </div>

          <label className="field-block">
            <span>Agency context</span>
            <textarea value={agencyContext} onChange={(event) => setAgencyContext(event.target.value)} placeholder="We sell AI lead follow-up systems to residential HVAC contractors…" rows={3} />
            <small>Used to distinguish meaningful buying signals from surface-level similarities.</small>
          </label>

          <div className="contacts-heading">
            <div><h3>Known buyers</h3><span>{contacts.length} anchor{contacts.length === 1 ? "" : "s"}</span></div>
            <button className="secondary-button" type="button" onClick={() => setContacts((current) => [...current, emptyContact()])}>+ Add buyer</button>
          </div>

          <div className="contact-list">
            {contacts.map((contact, index) => (
              <div className="contact-card" key={index}>
                <div className="contact-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="contact-fields">
                  <label><span>Person name</span><input value={contact.name} onChange={(event) => updateContact(index, "name", event.target.value)} placeholder="Jane Smith" /></label>
                  <label><span>Company</span><input value={contact.company} onChange={(event) => updateContact(index, "company", event.target.value)} placeholder="Southern Heating" /></label>
                  <label><span>Location <em>optional</em></span><input value={contact.location} onChange={(event) => updateContact(index, "location", event.target.value)} placeholder="Charlotte, NC" /></label>
                  <label><span>Website <em>optional</em></span><input value={contact.website} onChange={(event) => updateContact(index, "website", event.target.value)} placeholder="company.com" /></label>
                </div>
                <button className="remove-button" type="button" aria-label={`Remove buyer ${index + 1}`} onClick={() => removeContact(index)}>×</button>
              </div>
            ))}
          </div>

          <details className="research-settings">
            <summary>Research settings</summary>
            <div>
              <label><input type="checkbox" checked={useWeb} onChange={(event) => setUseWeb(event.target.checked)} /><span>Use public web research</span></label>
              <label><span>Search depth</span><select value={searchContextSize} disabled={!useWeb} onChange={(event) => setSearchContextSize(event.target.value as "low" | "medium" | "high")}><option value="low">Low · economical</option><option value="medium">Medium</option><option value="high">High · thorough</option></select></label>
            </div>
          </details>

          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          {run?.status === "failed" ? <div className="error-banner" role="alert"><strong>Research failed.</strong> {run.error}</div> : null}

          <div className="run-controls">
            <label className="checkbox-row"><input type="checkbox" checked={refresh} onChange={(event) => setRefresh(event.target.checked)} /><span>Ignore cache and run fresh research</span></label>
            <button className="primary-button" type="button" disabled={isRunning || healthError} onClick={submitRun}>{isRunning ? "Researching…" : "Generate strategy"}<span aria-hidden="true">→</span></button>
          </div>
        </div>

        <aside className="panel process-panel">
          <div className="panel-heading compact"><div><span className="step-number">02</span><div><h2>Research pipeline</h2><p>{run?.stage ?? "A visible, auditable process."}</p></div></div></div>
          {run ? <div className="progress-track" aria-label={`${run.progress}% complete`}><span style={{ width: `${run.progress}%` }} /></div> : null}
          <ol className="pipeline-list">
            {[
              ["Resolve identities", "Match the exact person and company."],
              ["Collect evidence", "Gather public sources and operating signals."],
              ["Map buyer patterns", "Separate facts, estimates, and shared traits."],
              ["Build searches", "Create validation and expansion logic."],
            ].map(([title, description], index) => (
              <li className={run && run.progress >= [10, 30, 75, 95][index] ? "active" : ""} key={title}><span>{index + 1}</span><div><strong>{title}</strong><small>{description}</small></div></li>
            ))}
          </ol>
          <div className="principle-card"><span>Core principle</span><p>AI explains ambiguous evidence. Deterministic checks guard the output.</p></div>
        </aside>
      </section>

      {result ? (
        <section className="results-section">
          <header className="results-header">
            <div><p className="eyebrow">Research complete</p><h2>{result.summary || "Your buyer strategy is ready."}</h2></div>
            <div className="results-actions"><span>{result.meta?.loaded_from_cache ? "Loaded from cache" : "Fresh analysis"}</span><button type="button" onClick={downloadResult}>Download JSON</button></div>
          </header>

          {(result.validation_warnings?.length ?? 0) > 0 ? <div className="warning-card"><strong>Review before using</strong><ul>{result.validation_warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}

          {(result.combined_strategy?.available && result.combined_strategy.shared_buyer_pattern) ? (
            <article className="combined-card"><span>Combined buyer pattern</span><p>{result.combined_strategy.shared_buyer_pattern}</p></article>
          ) : null}

          <nav className="contact-tabs" aria-label="Analyzed buyers">
            {analyses.map((item, index) => <button type="button" className={activeContact === index ? "active" : ""} onClick={() => { setActiveContact(index); setFeedbackState(null); }} key={`${item.input?.name}-${index}`}><span>{index + 1}</span>{item.input?.name || `Buyer ${index + 1}`}<small>{item.input?.company}</small></button>)}
          </nav>

          {analysis ? (
            <div className="analysis-workspace">
              <div className="profile-grid">
                <article className="profile-card">
                  <header><span>Buyer profile</span><Confidence value={analysis.person_profile?.confidence} /></header>
                  <h3>{analysis.person_profile?.current_title || "Title unresolved"}</h3>
                  <p>{analysis.person_profile?.function || "Function unknown"} · {analysis.person_profile?.management_level || "Level unknown"}</p>
                  <div className="tag-list">{analysis.person_profile?.sales_navigator_seniority?.map((item) => <span key={item}>{item}</span>)}</div>
                  <blockquote>{analysis.person_profile?.basis || "No profile basis returned."}</blockquote>
                  <EvidenceList items={analysis.person_profile?.evidence} />
                </article>

                <article className="profile-card">
                  <header><span>Company profile</span><Confidence value={employee?.confidence} /></header>
                  <h3>{analysis.company_profile?.industry || "Industry unresolved"}</h3>
                  <p>{analysis.company_profile?.headquarters_or_service_area || "Service area unknown"}</p>
                  <div className="metric-row"><div><small>Employees</small><strong>{employee?.best_guess ? `~${employee.best_guess}` : "Unknown"}</strong><span>{employee?.linkedin_headcount_band || "No LinkedIn band"}</span></div><div><small>Revenue range</small><strong>{revenue?.low_usd || revenue?.high_usd ? `${formatUsd(revenue?.low_usd)}–${formatUsd(revenue?.high_usd)}` : "Unknown"}</strong><span>{revenue?.is_publicly_reported ? "Publicly reported" : `${revenue?.confidence ?? "Unknown"} confidence`}</span></div></div>
                  <blockquote>{revenue?.basis || employee?.basis || "No company estimate basis returned."}</blockquote>
                  <EvidenceList items={analysis.company_profile?.evidence} />
                </article>
              </div>

              <div className="search-grid">
                <SearchCard title="Rediscover the anchor" eyebrow="Validation search" search={analysis.validation_search} />
                <SearchCard title="Find adjacent buyers" eyebrow="Expansion search" search={analysis.expansion_search} />
              </div>

              <aside className="feedback-card">
                <div><span>Close the learning loop</span><strong>Did the validation search find this buyer?</strong><small>This outcome becomes structured training evidence for future rules and Hermes evaluations.</small></div>
                <div className="feedback-actions"><button type="button" onClick={() => sendFeedback("found")}>Yes, found</button><button type="button" onClick={() => sendFeedback("partial")}>Partially</button><button type="button" onClick={() => sendFeedback("not_found")}>Not found</button>{feedbackState ? <em>{feedbackState}</em> : null}</div>
              </aside>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
