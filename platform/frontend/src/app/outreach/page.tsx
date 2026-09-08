"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "sent" | "replied" | "follow-up" | "closed";
type TimelineItem = { id: string; date: string; kind: "sent" | "reply" | "note"; subject: string; body: string };
type Outreach = {
  id: string;
  name: string;
  company: string;
  email: string;
  status: Status;
  sentAt: string;
  subject: string;
  emailBody: string;
  nextStep: string;
  reflection: string;
  timeline: TimelineItem[];
};

const STORAGE_KEY = "reverse-boolean-outreach-v1";
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ name: "", company: "", email: "", sentAt: today(), subject: "", emailBody: "" });
const statusLabels: Record<Status, string> = { sent: "Awaiting reply", replied: "Replied", "follow-up": "Follow up", closed: "Closed" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export default function OutreachPage() {
  const [items, setItems] = useState<Outreach[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Outreach[];
        setItems(parsed);
        setSelectedId(parsed[0]?.id ?? null);
      }
    } catch { /* Ignore malformed local data and start fresh. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const visible = useMemo(() => items.filter((item) => {
    const matchesFilter = filter === "all" || item.status === filter;
    const haystack = `${item.name} ${item.company} ${item.email} ${item.subject}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  }), [items, filter, query]);

  const selected = items.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const awaiting = items.filter((item) => item.status === "sent" || item.status === "follow-up").length;
  const replies = items.filter((item) => item.status === "replied").length;
  const replyRate = items.length ? Math.round((replies / items.length) * 100) : 0;

  const addOutreach = (event: FormEvent) => {
    event.preventDefault();
    const id = crypto.randomUUID();
    const record: Outreach = {
      id, ...form, status: "sent", nextStep: "", reflection: "",
      timeline: [{ id: crypto.randomUUID(), date: form.sentAt, kind: "sent", subject: form.subject, body: form.emailBody }],
    };
    setItems((current) => [record, ...current]);
    setSelectedId(id);
    setForm(blank());
    setShowForm(false);
  };

  const updateSelected = (patch: Partial<Outreach>) => {
    if (!selected) return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  };

  const addTimeline = (kind: "reply" | "note") => {
    if (!selected) return;
    const label = kind === "reply" ? "Reply received" : "Follow-up note";
    const entry: TimelineItem = { id: crypto.randomUUID(), date: today(), kind, subject: label, body: "" };
    updateSelected({ status: kind === "reply" ? "replied" : selected.status, timeline: [...selected.timeline, entry] });
  };

  const removeSelected = () => {
    if (!selected || !window.confirm(`Delete outreach to ${selected.name}?`)) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  };

  return (
    <main className="app-shell outreach-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Reverse Boolean Lab home">
          <span className="brand-mark" aria-hidden="true">RB</span>
          <span><strong>Reverse Boolean Lab</strong><small>Buyer intelligence workspace</small></span>
        </Link>
        <nav className="topbar-actions" aria-label="Workspace navigation">
          <Link className="nav-link" href="/">Research lab</Link>
          <span className="nav-link active">Outreach tracker</span>
        </nav>
      </header>

      <section className="outreach-heading">
        <div><p className="eyebrow">Manual outreach</p><h1>Keep every conversation in view.</h1><p className="lede">Record what you sent, capture replies, and leave yourself a clear lesson for the next email.</p></div>
        <button className="primary-button" type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? "Close form" : "Log an email"}<span>+</span></button>
      </section>

      {showForm ? (
        <form className="panel outreach-form" onSubmit={addOutreach}>
          <div className="form-intro"><span className="step-number">NEW</span><div><h2>Log a sent email</h2><p>Save the exact message so you can learn from the outcome later.</p></div></div>
          <div className="outreach-form-grid">
            <label><span>Contact name</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" /></label>
            <label><span>Company</span><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Southern Heating" /></label>
            <label><span>Email address</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" /></label>
            <label><span>Date sent</span><input required type="date" value={form.sentAt} onChange={(e) => setForm({ ...form, sentAt: e.target.value })} /></label>
            <label className="wide"><span>Subject line</span><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Quick idea for Southern Heating" /></label>
            <label className="wide"><span>Email message</span><textarea required rows={5} value={form.emailBody} onChange={(e) => setForm({ ...form, emailBody: e.target.value })} placeholder="Paste the exact email you sent…" /></label>
          </div>
          <div className="form-actions"><button className="text-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit">Save email <span>→</span></button></div>
        </form>
      ) : null}

      <section className="stat-strip" aria-label="Outreach summary">
        <div><span>Total sent</span><strong>{items.length}</strong><small>all recorded outreach</small></div>
        <div><span>Awaiting action</span><strong>{awaiting}</strong><small>replies or follow-ups</small></div>
        <div><span>Replies</span><strong>{replies}</strong><small>{replyRate}% reply rate</small></div>
        <div className="storage-note"><span className="status-dot" /><p><strong>Saved on this device</strong><small>Your data stays in this browser until you clear it.</small></p></div>
      </section>

      <section className="outreach-workspace">
        <aside className="panel outreach-list-panel">
          <div className="list-tools">
            <input aria-label="Search outreach" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, companies…" />
            <div className="filter-row">
              {(["all", "sent", "replied", "follow-up"] as const).map((value) => <button type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value === "all" ? "All" : statusLabels[value]}</button>)}
            </div>
          </div>
          <div className="outreach-list">
            {!ready ? <p className="empty-state">Loading your outreach…</p> : visible.length ? visible.map((item) => (
              <button type="button" key={item.id} className={`outreach-row ${selected?.id === item.id ? "active" : ""}`} onClick={() => setSelectedId(item.id)}>
                <span className="avatar">{item.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                <span className="row-copy"><strong>{item.name}</strong><small>{item.company || item.email}</small><em>{item.subject}</em></span>
                <span className={`status-badge ${item.status}`}>{statusLabels[item.status]}</span>
                <time>{formatDate(item.sentAt)}</time>
              </button>
            )) : <div className="empty-state"><span>✉</span><strong>{items.length ? "No matches" : "No emails logged yet"}</strong><p>{items.length ? "Try a different search or filter." : "Log your first sent email to start building your outreach history."}</p></div>}
          </div>
        </aside>

        <article className="panel outreach-detail">
          {selected ? <>
            <header className="detail-header"><div><p className="eyebrow">Conversation record</p><h2>{selected.name}</h2><span>{selected.company || "No company"} · <a href={`mailto:${selected.email}`}>{selected.email}</a></span></div><label><span>Status</span><select value={selected.status} onChange={(e) => updateSelected({ status: e.target.value as Status })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></header>
            <div className="detail-actions"><button type="button" onClick={() => addTimeline("reply")}>+ Log reply</button><button type="button" onClick={() => addTimeline("note")}>+ Add timeline note</button></div>
            <section className="timeline"><h3>Email timeline</h3>{selected.timeline.map((event, index) => <div className={`timeline-event ${event.kind}`} key={event.id}><span className="timeline-marker" /><div className="event-heading"><span>{event.kind === "sent" ? "Email sent" : event.kind === "reply" ? "Reply received" : "Note added"}</span><time>{formatDate(event.date)}</time></div><input aria-label="Timeline entry title" value={event.subject} onChange={(e) => updateSelected({ timeline: selected.timeline.map((entry) => entry.id === event.id ? { ...entry, subject: e.target.value } : entry) })} /><textarea aria-label="Timeline entry details" rows={event.kind === "sent" ? 5 : 3} value={event.body} placeholder={event.kind === "reply" ? "Paste or summarize their reply…" : "What happened? What should you remember?"} onChange={(e) => updateSelected({ timeline: selected.timeline.map((entry) => entry.id === event.id ? { ...entry, body: e.target.value } : entry) })} />{index === 0 ? <small>Original message</small> : null}</div>)}</section>
            <section className="learning-grid"><label><span>Next move</span><textarea rows={4} value={selected.nextStep} onChange={(e) => updateSelected({ nextStep: e.target.value })} placeholder="Follow up Friday with a shorter note and one concrete result…" /></label><label><span>What can I do differently?</span><textarea rows={4} value={selected.reflection} onChange={(e) => updateSelected({ reflection: e.target.value })} placeholder="Was the subject specific? Was the ask too large? What signal was missing?" /></label></section>
            <button className="delete-record" type="button" onClick={removeSelected}>Delete this record</button>
          </> : <div className="detail-empty"><span>↙</span><h2>Select an email</h2><p>Its message history, reply notes, and lessons will appear here.</p></div>}
        </article>
      </section>
    </main>
  );
}
