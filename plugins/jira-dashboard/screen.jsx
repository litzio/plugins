import {
  completion, createJql, dateFields, demoDetail, labels, overdue, parseDemoJql,
  people, priorities, projects, schema, searchDemo, shift, statuses, today, types,
} from "./demo.mjs";
import styles from "./style.mjs";
import { persistLast, persistViews, preferenceKey, readPreferences } from "./preferences.mjs";

const navigation = ["Overview", "Issues", "Board", "Analytics", "Saved views"];
const defaultSort = { field: "updated", direction: "DESC" };
const initial = { project: ["AT"], created: [shift(today, -30), shift(today, -1)] };
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = date => date ? dateFormat.format(new Date(date)) : "—";
const defaultColumns = ["id", "summary", "status", "priority", "assignee", "due", "updated"];
const tableColumns = ["id", "summary", "project", "type", "status", "priority", "assignee", "reporter", "created", "due", "updated", "resolved"];
const person = id => people.find(user => user.id === id);
const projectName = key => projects.find(([id]) => id === key)?.[1] ?? key;
const columnNames = { id: "Key", summary: "Summary" };
const metricNames = { active: "In progress", unresolved: "Unresolved", resolved: "Resolved", overdue: "Overdue", assigned: "Assigned to me" };

let requestSequence = 0;
function useJira(React, invoke, operation, args, enabled) {
  const [state, setState] = React.useState({ value: null, error: "", loading: false });
  const serialized = JSON.stringify(args);
  const query = JSON.stringify(Object.fromEntries(Object.entries(args).filter(([key]) => !["refresh", "refreshRevision", "retry"].includes(key))));
  React.useEffect(() => {
    if (!enabled) {
      setState({ value: null, error: "", loading: false });
      return;
    }
    const requestId = "desk-" + Date.now() + "-" + ++requestSequence;
    let active = true, pending = true;
    setState(previous => ({ ...previous, value: previous.query === query ? previous.value : null, query, error: "", loading: true }));
    invoke(operation, { ...JSON.parse(serialized), requestId }).then(value => {
      if (active) setState({ value, query, error: "", loading: false });
    }, error => {
      if (active) setState(previous => ({ value: error.code === "jira_http_401" ? null : previous.value,
        query, error: error.message, loading: false, code: error.code }));
    }).finally(() => { pending = false; });
    return () => {
      active = false;
      if (pending) void invoke("cancel", { requestId }).catch(() => {});
    };
  }, [enabled, invoke, operation, serialized, query]);
  return enabled && state.query === query ? state : { value: null, error: "", loading: enabled };
}

function nameFor(field, value) {
  if (field === "project") return projectName(value);
  if (["assignee", "reporter"].includes(field)) return person(value)?.name ?? value;
  if (field === "metric") return metricNames[value];
  return value;
}

function Actor({ id, account }) {
  const user = account ?? person(id);
  return user ? <span className="line"><span className="avatar" aria-hidden="true">{user.initials}</span>{user.name}</span> : "—";
}

function Tabs({ names, current, select, label }) {
  return <nav aria-label={label}>{names.map(name =>
    <button key={name} type="button" aria-pressed={name === current} onClick={() => select(name)}>{name}</button>
  )}</nav>;
}

function Chart({ React, sample, from, to, dateAnchor, onPeriod }) {
  const firstDay = from || shift(dateAnchor, -30);
  const lastDay = to || dateAnchor;
  const span = Math.max(1, Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / 86_400_000) + 1);
  const step = Math.max(1, Math.ceil(span / 5));
  const weeks = Array.from({ length: Math.min(5, Math.ceil(span / step)) }, (_, i) => {
    const range = [shift(firstDay, i * step), [lastDay, shift(firstDay, (i + 1) * step - 1)].sort()[0]];
    const counts = ["created", "resolved"].map(field => sample.filter(item => item[field] >= range[0] && item[field] <= range[1]).length);
    return { range, counts };
  });
  const peak = Math.max(1, ...weeks.flatMap(week => week.counts));
  const [hover, setHover] = React.useState(null);
  const percentage = value => value / peak * 85 + 5;
  return <section className="panel pad">
    <div className="between"><div><h2>Issue flow</h2><p>{sample.length} most recently updated issues in scope</p></div>
      <small>■ Created <span className="success">■ Resolved</span></small></div>
    <div className="chartbody" aria-label="Created and resolved issues by period">
      <svg className="chartlines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1].map(series => <polyline key={series} points={weeks.map((week, i) =>
          [((i + 0.5) / weeks.length) * 100, 100 - percentage(week.counts[series])].join(",")).join(" ")}
          stroke={series ? "var(--j-success)" : "var(--j-accent)"} strokeWidth="2.25" vectorEffect="non-scaling-stroke" fill="none" />)}
      </svg>
      {weeks.map(({ range, counts }, i) => {
        const label = shortDate(range[0]) + "–" + shortDate(range[1]) + ": " + counts[0] + " created, " + counts[1] + " resolved";
        return <button className="chartcol" key={range[0]} aria-label={label + ". Show issues created in this period."}
          onClick={() => onPeriod(range)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
          onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
          <span className="chartpair" aria-hidden="true">
            {counts.map((count, j) => <i key={j} style={{ bottom: percentage(count) + "%" }} />)}
          </span><small>{shortDate(range[0])}</small>
          {hover === i && <span className="panel chart-tip" aria-hidden="true">{label}</span>}
        </button>;
      })}
    </div>
  </section>;
}

function Distribution({ sample, name, field, open }) {
  const grouped = new Map();
  for (const issue of sample) grouped.set(issue[field], (grouped.get(issue[field]) ?? 0) + 1);
  const entries = [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <section className="panel pad"><h2>{name}</h2><p>{sample.length} retrieved issues</p>
    <div className="bars">{entries.map(([value, count]) => <button type="button" className="barrow" key={value}
      disabled={!value} onClick={() => open(field, [value])} title={(nameFor(field, value) || "Unassigned") + ": " + count}>
      <span>{(field === "assignee" && sample.find(issue => issue.assignee === value)?.assigneeUser?.name) || nameFor(field, value) || "Unassigned"}</span>
      <span className="bar" aria-hidden="true"><span style={{ width: (100 * count / entries[0][1]) + "%" }} /></span><b>{count}</b>
    </button>)}</div></section>;
}

function Overview({ React, ui, results, filters, sampleLimit, analyze, open, inspect, analytics, onExtend, live, snapshot }) {
  const sample = live ? snapshot?.sample ?? [] : results.slice(0, sampleLimit);
  const total = live ? snapshot?.total : results.length;
  const resolved = live ? snapshot?.counts.resolved : results.filter(completion).length;
  const over = live ? snapshot?.counts.overdue : results.filter(overdue).length;
  const value = (key, demo) => live ? snapshot?.counts[key] : demo();
  const metrics = [
    ["Total issues", total, null], ["In progress", value("active", () => results.filter(i => ["In progress", "In review"].includes(i.status)).length), "active"],
    ["Unresolved", value("unresolved", () => total - resolved), "unresolved"], ["Resolved", resolved, "resolved"], ["Overdue", over, "overdue"],
    ["Resolution rate", total && resolved != null ? (resolved / total * 100).toFixed(1) + "%" : "—", "resolved"],
    ["Assigned to me", value("assigned", () => results.filter(i => i.assignee === people[0].id).length), "assigned"],
  ];
  const cutoff = live ? new Date().toISOString().slice(0, 10) : today;
  const due = live ? snapshot?.due : results.filter(i => !i.resolved && i.due >= today && i.due <= shift(today, 7)).sort((a, b) => a.due.localeCompare(b.due));
  const byFields = [["Status", "status"], ["Priority", "priority"], ["Issue type", "type"], ["Workload", "assignee"]];
  const item = issue => <button type="button" key={issue.id} className="due" onClick={event => inspect(issue, event.currentTarget)}>
    <span><span className="key">{issue.id}</span><strong>{issue.summary}</strong></span><small>{shortDate(issue.due)}</small></button>;
  return <>
    {!analytics && <div className="panel metrics" aria-label="All matching demo issues">{metrics.map(([label, count, condition]) =>
      <button key={label} onClick={() => open("metric", condition ? [condition] : [])}><small>{label}</small>
        <span className={condition === "overdue" ? "danger" : ""}>{count ?? "—"}</span></button>)}</div>}
    <div className="hero"><Chart React={React} sample={sample} from={filters.created?.[0]} to={filters.created?.[1]} dateAnchor={cutoff}
      onPeriod={range => open("created", range)} />
      <section className="panel pad"><h2>Due in the next 7 days</h2><p>Open issues ordered by due date</p>
        {due?.length ? due.slice(0, 3).map(item) : <p>{due ? "No issues due in this period." : "Due issues unavailable."}</p>}
        <ui.Button size="sm" variant="ghost" onClick={() => open("due", [cutoff, shift(cutoff, 7)], "unresolved")}>View due issues →</ui.Button>
      </section>
    </div>
    <div className="dist">{byFields.map(([name, field]) => <Distribution key={field} {...{ name, field, sample, open }} />)}</div>
    <div className="panel pad between"><h2>Recently updated</h2>{(live ? snapshot?.recent ?? [] : results.slice(0, 2)).map(issue =>
      <ui.Button key={issue.id} variant="ghost" onClick={event => inspect(issue, event.currentTarget)}><span className="key">{issue.id}</span> {issue.summary}</ui.Button>)}
      {analytics ? <ui.Button size="sm" onClick={onExtend} disabled={sampleLimit >= 200 || sampleLimit >= (total ?? 0)}>Expand sample →</ui.Button>
        : <ui.Button size="sm" onClick={analyze}>Open analytics →</ui.Button>}</div>
  </>;
}

function FilterPicker({ React, ui, invoke, live, field, values, update, close, remember }) {
  const [term, setTerm] = React.useState("");
  const [committed, setCommitted] = React.useState("");
  const [focus, setFocus] = React.useState(0);
  const listId = React.useId();
  const isPeople = ["assignee", "reporter"].includes(field);
  const isDate = dateFields.includes(field);
  const typeValue = field === "summary" || field === "id";
  const searchValue = isPeople || live ? committed : term;
  React.useEffect(() => {
    if (!isPeople && !live) return;
    const timer = setTimeout(() => setCommitted(term.trim()), 350);
    return () => clearTimeout(timer);
  }, [term, isPeople, live]);
  const remote = useJira(React, invoke, "lookup", { field, query: committed },
    live && !isDate && !typeValue && (!isPeople || committed.length >= 2) && (field !== "label" || committed.length >= 2));
  const source = isPeople ? people : field === "project" ? projects.map(([id, name]) => ({ id, name }))
    : ({ status: statuses, priority: priorities, type: types, label: labels }[field] ?? []).map(id => ({ id, name: id }));
  const options = live ? remote.value ?? [] : source.filter(user => (user.name + " " + user.id).toLowerCase().includes(searchValue.toLowerCase())).slice(0, 15);
  const limited = isPeople || (live && field === "label");
  const searching = (isPeople || live) && term.trim() !== committed;
  const visible = (limited && term.trim().length < 2) || searching || remote.loading || remote.error ? [] : options;
  const toggle = id => update(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  function choose(option) { remember(field, option); toggle(option.id); }
  return <section className="panel pad popover" aria-label={schema[field][0]} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  }}>
    <div className="between"><h3>{schema[field][0]}</h3><ui.Button variant="ghost" size="sm" onClick={close}>Done</ui.Button></div>
    {isDate ? ["From", "To"].map((label, i) => <label key={label}>{label}<input type="date" value={values[i] ?? ""}
      onChange={event => { const range = [values[0] ?? "", values[1] ?? ""]; range[i] = event.target.value; update(range.some(Boolean) ? range : []); }} /></label>)
      : typeValue ? <label>{schema[field][0]}<ui.Input value={values[0] ?? ""} onChange={event => update(event.target.value ? [event.target.value] : [])} /></label>
      : <>
        <label>{isPeople ? "Search name or ID" : "Find option"}<input autoFocus value={term} role="combobox" aria-autocomplete="list"
          aria-expanded="true" aria-controls={listId} aria-activedescendant={visible[focus] ? listId + "-" + focus : undefined}
          onChange={event => { setTerm(event.target.value); setFocus(0); }} onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setFocus(index => Math.max(0, Math.min(visible.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
            }
            if (event.key === "Enter" && visible[focus]) { event.preventDefault(); choose(visible[focus]); }
          }} /></label>
        {visible.length === 0 && <small role="status">{limited && term.trim().length < 2 ? "Type at least 2 characters" : searching || remote.loading ? "Searching…" : remote.error || "No matches"}</small>}
        <div id={listId} role="listbox" aria-label={schema[field][0] + " matches"} aria-multiselectable="true">{visible.map((option, i) =>
          <button key={option.id} id={listId + "-" + i} type="button" className="option" role="option" tabIndex={-1}
            aria-selected={values.includes(option.id)} onClick={() => choose(option)} style={focus === i ? { outline: "1px solid var(--j-accent)" } : undefined}>
            {isPeople && <span className="avatar">{option.initials}</span>}
            <span className="display"><strong>{option.name}</strong>{isPeople && <small>{option.id}</small>}</span>{values.includes(option.id) ? "✓" : null}</button>)}</div>
        {isPeople && visible.length > 0 && <small>↑ ↓ Move · Enter Select · Esc Close</small>}
      </>}
  </section>;
}

function Filters({ React, ui, invoke, live, draft, setDraft, submit, mode, setMode, jql, setJql, generated, error, save, recent, recall, scopeOnly, remember, known }) {
  const [field, setField] = React.useState("");
  const [add, setAdd] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [history, setHistory] = React.useState(false);
  const searchInput = React.useRef(null);
  React.useEffect(() => {
    function focusSearch(event) {
      if (event.key === "/" && !event.altKey && !event.ctrlKey && !event.metaKey &&
          !event.target.closest("input,textarea,select,[contenteditable=true]") && searchInput.current) {
        event.preventDefault();
        searchInput.current.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const patch = (key, values) => setDraft(current => ({ ...current, [key]: values }));
  return <div className="relative">
    <div className="between">
      <div className="line">
        {!scopeOnly && <label className="search"><ui.Input ref={searchInput} aria-label="Issue key or summary" placeholder="Issue key or summary  /"
          value={draft.summary?.[0] ?? ""} onChange={e => patch("summary", e.target.value ? [e.target.value] : [])}
          onKeyDown={e => { if (e.key === "Enter") submit(); }} /></label>}
        {!scopeOnly && <><ui.Button aria-pressed={mode === "Basic"} onClick={() => setMode("Basic")}>Basic</ui.Button>
          <ui.Button aria-pressed={mode === "JQL"} onClick={() => { if (mode !== "JQL") setJql(generated); setMode("JQL"); }}>JQL</ui.Button></>}
      </div>
      {!scopeOnly && <div className="line"><ui.Button onClick={() => setHistory(!history)}>Recent</ui.Button><ui.Button onClick={save}>Save view</ui.Button>
        <ui.Button variant="default" onClick={submit}>Search</ui.Button></div>}
    </div>
    {history && <div className="panel pad" aria-label="Recent searches">{recent.length ? recent.map((item, i) =>
      <div key={i}><ui.Button variant="ghost" onClick={() => { recall(item); setHistory(false); }}>{item.title}</ui.Button></div>) : <p>No recent searches.</p>}</div>}
    {(mode === "Basic" || scopeOnly) && <div className="line" style={{ marginTop: 8 }}>
      {Object.entries(draft).filter(([, values]) => values.length).map(([key, values]) =>
        <span key={key} className="line"><ui.Button size="sm" onClick={() => key === "metric" ? patch(key, []) : setField(key)}>
          {schema[key]?.[0] ?? "Scope"} · {values.filter(Boolean).map(value => known[key]?.[value] ?? nameFor(key, value)).join(dateFields.includes(key) ? " – " : ", ")}</ui.Button>
          <ui.Button variant="ghost" size="sm" aria-label={"Clear " + (schema[key]?.[0] ?? "scope")} onClick={() => patch(key, [])}>×</ui.Button></span>)}
      <ui.Button size="sm" onClick={() => setAdd(!add)}>+ Add filter</ui.Button><ui.Button size="sm" variant="ghost" onClick={() => setDraft({})}>Clear</ui.Button>
      {scopeOnly ? <ui.Button size="sm" onClick={submit}>Apply scope</ui.Button> : <ui.Button size="sm" variant="ghost" onClick={() => setShow(!show)}>{show ? "Hide JQL" : "Show JQL"}</ui.Button>}
    </div>}
    {add && <div className="line panel pad" aria-label="Available filters">{Object.entries(schema).map(([key, [label]]) =>
      <ui.Button key={key} size="sm" onClick={() => { setField(key); setAdd(false); }}>{label}</ui.Button>)}</div>}
    {field && <FilterPicker key={field} {...{ React, ui, invoke, live, field, remember }} values={draft[field] ?? []} update={values => patch(field, values)} close={() => setField("")} />}
    {mode === "JQL" && !scopeOnly && <label><small>{live ? "JQL" : "JQL · demo supports basic clauses and ORDER BY"}</small>
      <textarea maxLength={8192} spellCheck="false" value={jql} onChange={event => setJql(event.target.value)} /></label>}
    {show && mode === "Basic" && !scopeOnly && <pre style={{ whiteSpace: "pre-wrap" }}>{generated}</pre>}
    {error && <ui.Notice tone="error">{error}</ui.Notice>}
  </div>;
}

function IssueTable({ React, ui, page, total, received, loading, offset, next, previous, sort, onSort, selected, inspect, exportRows, exporting }) {
  const [visibleColumns, setVisibleColumns] = React.useState(defaultColumns);
  const [compact, setCompact] = React.useState(false);
  const [customize, setCustomize] = React.useState(false);
  const [selection, setSelection] = React.useState(new Set());
  const [widths, setWidths] = React.useState({});
  const allSelected = page.length > 0 && page.every(issue => selection.has(issue.id));
  const select = (ids, include) => setSelection(current => {
    const nextSelection = new Set(current);
    for (const id of ids) { if (include) nextSelection.add(id); else nextSelection.delete(id); }
    return nextSelection;
  });
  const cell = (issue, key) => {
    if (key === "summary") return <button onClick={event => inspect(issue, event.currentTarget)}>{issue.summary}</button>;
    if (key === "id") return <button className="key" onClick={event => inspect(issue, event.currentTarget)}>{issue.id}</button>;
    if (["assignee", "reporter"].includes(key)) return <Actor id={issue[key]} account={issue[key + "User"]} />;
    if (dateFields.includes(key)) return <span className={key === "due" && overdue(issue) ? "danger" : ""}>{shortDate(issue[key])}</span>;
    if (key === "status") return <ui.Status tone={completion(issue) ? "ok" : "neutral"} label={issue.status} />;
    if (key === "project") return issue.projectName ?? nameFor(key, issue[key]);
    return nameFor(key, issue[key]);
  };
  return <>
    <div className="between"><h2>{total} results{selection.size > 0 && <small> · {selection.size} selected</small>}</h2>
      <div className="line"><ui.Button size="sm" disabled={exporting || !page.some(issue => selection.has(issue.id))}
        onClick={() => exportRows(page.filter(issue => selection.has(issue.id)))}>Export selected on page</ui.Button>
        <ui.Button size="sm" onClick={() => setCustomize(!customize)}>Columns</ui.Button>
        <ui.Button size="sm" aria-pressed={compact} onClick={() => setCompact(!compact)}>Compact</ui.Button></div></div>
    {customize && <div className="line panel pad" aria-label="Column visibility">{tableColumns.map(key =>
      <label key={key}><input type="checkbox" checked={visibleColumns.includes(key)} disabled={key === "id"}
        onChange={() => setVisibleColumns(current => current.includes(key) ? current.filter(c => c !== key) : tableColumns.filter(c => c === key || current.includes(c)))} />
        {columnNames[key] ?? schema[key][0]}</label>)}</div>}
    {!page.length ? <ui.EmptyState title="No matching issues" description="Change the search conditions and try again." /> :
      <div className="panel"><div className="tableViewport" tabIndex={0} aria-label="Issue search results">
        <table className={compact ? "compact" : ""}><thead><tr><th><input type="checkbox" aria-label="Select page" checked={allSelected}
          onChange={() => select(page.map(i => i.id), !allSelected)} /></th>{visibleColumns.map(key =>
          <th key={key} scope="col" aria-sort={sort.field === key ? (sort.direction === "ASC" ? "ascending" : "descending") : undefined}>
            <div className="between" style={{ minWidth: widths[key] }}><button onClick={() => onSort(key)}>{columnNames[key] ?? schema[key][0]} {sort.field === key ? (sort.direction === "ASC" ? "↑" : "↓") : ""}</button>
              {customize && <input type="range" min="75" max="460" value={widths[key] ?? (key === "summary" ? 270 : 100)}
                aria-label={(columnNames[key] ?? schema[key][0]) + " column width"} onChange={e => setWidths(current => ({ ...current, [key]: Number(e.target.value) }))} style={{ width: 62 }} />}
            </div></th>)}{page.some(issue => issue.url) && <th scope="col">Jira</th>}</tr></thead>
          <tbody>{page.map(issue => <tr key={issue.id} aria-selected={selected?.id === issue.id || selection.has(issue.id)}>
            <td><input type="checkbox" aria-label={"Select " + issue.id} checked={selection.has(issue.id)} onChange={() => select([issue.id], !selection.has(issue.id))} /></td>
            {visibleColumns.map(key => <td key={key}>{cell(issue, key)}</td>)}
            {issue.url && <td><a href={issue.url} target="_blank" rel="noopener noreferrer" aria-label={"Open " + issue.id + " in Jira"}>↗</a></td>}
          </tr>)}</tbody></table>
      </div><div className="pagination between"><small>{offset + 1}–{offset + page.length} of {total}</small><div className="line">
        <ui.Button size="sm" disabled={loading || offset === 0} onClick={previous}>Previous</ui.Button><ui.Button size="sm" disabled={loading || !received || offset + received >= total} onClick={next}>Next</ui.Button>
      </div></div></div>}
  </>;
}

function Board({ React, ui, page, offset, total, received, loading, next, previous, inspect }) {
  const [expanded, setExpanded] = React.useState({});
  return <>
    <div className="between"><h2>Issues by status</h2><small>{page.length} loaded · {total} matching · Read-only view</small></div>
    <div className="columns">{(page.some(issue => issue.url) ? [...new Set(page.map(issue => issue.status).filter(Boolean))] : statuses).map(status => {
      const items = page.filter(issue => issue.status === status);
      const limit = expanded[status] ?? 3;
      return <section className="lane panel" key={status}><header className="between"><h3>{status} · {items.length}</h3><small>{Math.min(limit, items.length)} shown</small></header>
        {items.slice(0, limit).map(issue => <button type="button" className="ticket panel" key={issue.id} onClick={event => inspect(issue, event.currentTarget)}>
          <span className="between"><span className="key">{issue.id}</span><small>{issue.type} · {issue.priority}</small></span><strong>{issue.summary}</strong>
          <span className="between"><span className="avatar" title={(issue.assigneeUser ?? person(issue.assignee))?.name}>{(issue.assigneeUser ?? person(issue.assignee))?.initials}</span>
            <small className={overdue(issue) ? "danger" : ""}>{shortDate(issue.due)}{overdue(issue) ? " · Overdue" : ""}</small></span></button>)}
        {limit < items.length && <ui.Button size="sm" onClick={() => setExpanded(current => ({ ...current, [status]: limit + 5 }))}>Show {Math.min(5, items.length - limit)} more</ui.Button>}
      </section>;
    })}</div>
    <div className="between"><small>{page.length ? offset + 1 : 0}–{offset + page.length} of {total}</small><div className="line">
      <ui.Button size="sm" disabled={loading || !offset} onClick={previous}>Previous</ui.Button>
      <ui.Button size="sm" disabled={loading || !received || offset + received >= total} onClick={next}>Next issue page</ui.Button>
    </div></div>
  </>;
}

function Details({ React, ui, invoke, live, issue, close, inspect }) {
  const [tab, setTab] = React.useState("Overview");
  const [startAt, setStartAt] = React.useState(0);
  const data = useJira(React, invoke, "detail", { key: issue.id, tab, startAt }, live);
  const summary = live ? data.value ?? {} : demoDetail(issue);
  return <aside className="panel pad details" aria-label={"Issue " + issue.id} tabIndex={-1}
    onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <div className="between"><span className="key">{issue.id} · {issue.projectName ?? projectName(issue.project)}</span>
      <span className="line">{issue.url && <a href={issue.url} target="_blank" rel="noopener noreferrer">Open in Jira ↗</a>}
        <ui.Button size="sm" variant="ghost" onClick={close} autoFocus>Close</ui.Button></span></div>
    <h2>{issue.summary}</h2>
    <div className="line"><ui.Status tone={completion(issue) ? "ok" : "neutral"} label={issue.status} /><span>{issue.priority}</span>
      {overdue(issue) && <span className="danger">Overdue · {shortDate(issue.due)}</span>}</div>
    <Tabs label="Issue detail" names={["Overview", "Comments", "Attachments", "History"]} current={tab} select={name => { setTab(name); setStartAt(0); }} />
    {data.loading && <p role="status">Loading issue details…</p>}
    {data.error && <ui.Notice tone="error">{data.error}</ui.Notice>}
    {tab === "Overview" && <>
      <dl>{[["Assignee", <Actor id={issue.assignee} account={issue.assigneeUser} />], ["Reporter", <Actor id={issue.reporter} account={issue.reporterUser} />], ...["created", "updated", "due", "resolved"].map(key =>
        [schema[key][0], shortDate(issue[key])])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <section><h3>Description</h3><p>{summary.description}</p></section>
      <section><h3>Labels</h3><p>{live ? (summary.labels ?? issue.labels ?? []).join(", ") : issue.label}</p></section>
      <section><h3>Related issues</h3>{[["Parent", summary.parent], ["Related", summary.related]].filter(([, row]) => row).map(([relation, row]) =>
        <ui.Button key={relation} size="sm" variant="ghost" onClick={() => inspect(row)}>{relation} · {row.id} · {row.summary}</ui.Button>)}
        {summary.relationships?.map((row, i) => <a key={i} href={row.url} target="_blank" rel="noopener noreferrer">{row.role} · {row.key} · {row.summary}</a>)}</section>
    </>}
    {tab === "Comments" && summary.comments?.map((comment, index) => <section key={index}><strong>{comment.author} · {shortDate(comment.date)}</strong><p>{comment.text}</p></section>)}
    {tab === "Comments" && summary.next != null && <ui.Button size="sm" disabled={data.loading} onClick={() => setStartAt(summary.next)}>Next comments</ui.Button>}
    {tab === "Attachments" && <section>{summary.attachments?.map((file, i) => <p key={i}>{file.name} · {file.size}</p>)}</section>}
    {tab === "History" && summary.history?.map((entry, index) => <section key={index}><small>{shortDate(entry.date)}</small><p>{entry.text}</p></section>)}
    {tab === "History" && summary.historyLimited && <small>Open Jira for the full history.</small>}
    {!data.loading && !data.error && ((tab === "Comments" && summary.comments?.length === 0) || (tab === "Attachments" && summary.attachments?.length === 0) ||
      (tab === "History" && summary.history?.length === 0)) && <p>No entries.</p>}
  </aside>;
}

export default function Screen(props) {
  const { React, invoke } = props;
  const [choice, setChoice] = React.useState(null);
  const [retry, setRetry] = React.useState(0);
  const configuration = useJira(React, invoke, "configuration", {}, true);
  const source = choice ?? (configuration.value?.configured ? "jira" : "demo");
  const live = source === "jira";
  const identity = useJira(React, invoke, "identity", { retry }, live);
  const storageKey = preferenceKey(live, identity.value?.preferenceScope);
  if ((choice === null && configuration.loading) || (live && !storageKey && identity.loading)) {
    return <LoadingPreferences ui={props.ui} />;
  }
  return <DashboardPreferences key={storageKey ?? source} {...props} {...{ live, identity, storageKey }}
    retryConnection={() => setRetry(current => current + 1)}
    changeSource={() => setChoice(source === "jira" ? "demo" : "jira")} />;
}

function LoadingPreferences({ ui }) {
  return <ui.ScreenLayout status={<ui.Status tone="progress" label="Loading dashboard preferences" />} />;
}

function DashboardPreferences(props) {
  const { React, ui, storage, storageKey } = props;
  const [preferences, setPreferences] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    readPreferences(storage, storageKey).then(value => {
      if (active) setPreferences(value);
    });
    return () => { active = false; };
  }, [storage, storageKey]);
  return preferences ? <Dashboard {...props} preferences={preferences} /> : <LoadingPreferences ui={ui} />;
}

function Dashboard({ React, ui, invoke, live, identity, storage, storageKey, preferences, retryConnection, changeSource, saveDocument, pickPath }) {
  const [storageFailures, setStorageFailures] = React.useState(preferences.failures);
  function savePreference(name, write, value) {
    write(storage, storageKey, value).then(
      () => setStorageFailures(current => ({ ...current, [name]: false })),
      () => setStorageFailures(current => ({ ...current, [name]: true })),
    );
  }
  const last = preferences.last;
  const startScope = live ? { created: [shift(new Date().toISOString().slice(0, 10), -30), ""] } : initial;
  const [screen, setScreen] = React.useState(last?.screen ?? "Overview");
  const [filters, setFilters] = React.useState(last?.filters ?? startScope);
  const [draft, setDraft] = React.useState(last?.filters ?? startScope);
  const [sort, setSort] = React.useState(last?.sort ?? defaultSort);
  const [mode, setMode] = React.useState(last?.rawJql ? "JQL" : "Basic");
  const [jql, setJql] = React.useState(last?.rawJql ?? "");
  const [error, setError] = React.useState("");
  const [recent, setRecent] = React.useState([]);
  const [saved, setSaved] = React.useState(preferences.views);
  const [offset, setOffset] = React.useState(0);
  const [pageHistory, setPageHistory] = React.useState([]);
  const [activeJql, setActiveJql] = React.useState(last?.rawJql ?? "");
  const [pendingJql, setPendingJql] = React.useState(null);
  const [known, setKnown] = React.useState({});
  const [refresh, setRefresh] = React.useState(0);
  const [sampleLimit, setSampleLimit] = React.useState(50);
  const [selected, setSelected] = React.useState(null);
  const [refreshed, setRefreshed] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState(null);
  const trigger = React.useRef(null);
  const activeScope = screen === "Overview" || screen === "Analytics";
  const hasProject = Boolean(filters.project?.length);
  const ready = live && Boolean(identity.value);
  const overview = useJira(React, invoke, "overview", { filters, refresh: Boolean(refresh), refreshRevision: refresh, extended: sampleLimit > 50 },
    ready && activeScope && hasProject);
  const queried = useJira(React, invoke, "search", { filters, sort, startAt: offset, jql: activeJql, refresh: Boolean(refresh), refreshRevision: refresh },
    ready && !activeScope && screen !== "Saved views" && (hasProject || Boolean(activeJql)));
  const results = React.useMemo(() => live ? [] : searchDemo(filters, sort), [live, filters, sort]);
  const page = live ? queried.value?.rows ?? [] : results.slice(offset, offset + 50);
  const total = live ? queried.value?.total ?? 0 : results.length;
  const received = live ? queried.value?.received ?? 0 : page.length;
  const network = activeScope ? overview : queried;
  const authFailed = [identity, network].some(result => result.code === "jira_http_401");
  const generated = createJql(draft, sort, live);

  React.useEffect(() => {
    if (!pendingJql || pendingJql.rawJql !== activeJql) return;
    if (queried.value) savePreference("last", persistLast, pendingJql);
    if (queried.value || queried.error) setPendingJql(null);
  }, [pendingJql, activeJql, queried.value, queried.error, storageKey]);

  function inspect(issue, element) {
    if (!selected && element) trigger.current = element;
    setSelected(issue);
  }
  function close() {
    setSelected(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function apply(filters, sort, remember, rawJql = "", target = screen) {
    setFilters(filters);
    setDraft(filters);
    setSort(sort);
    setOffset(0);
    setPageHistory([]);
    setActiveJql(rawJql);
    setRefresh(0);
    setSelected(null);
    setError("");
    const applied = { filters, sort, rawJql, screen: target };
    setPendingJql(live && rawJql ? applied : null);
    if (!live || !rawJql) savePreference("last", persistLast, applied);
    if (remember) {
      const title = rawJql || createJql(filters, sort, live);
      setRecent(list => [{ filters, sort, title, rawJql }, ...list.filter(item => item.title !== title)].slice(0, 8));
    }
  }
  function submit() {
    try {
      if (!activeScope && mode === "JQL") {
        if (live) {
          if (!jql.trim()) throw new Error("Enter a JQL expression.");
          apply(filters, sort, true, jql.trim());
          return;
        }
        const parsed = parseDemoJql(jql);
        apply(parsed.filters, parsed.sort, true);
      } else {
        const invalid = dateFields.some(field => draft[field]?.[0] && draft[field]?.[1] && draft[field][0] > draft[field][1]);
        if (invalid) throw new Error("The end date must be on or after the start date.");
        apply(draft, sort, true);
      }
    } catch (e) { setError(e.message); }
  }
  function drill(field, values, metric) {
    const next = { ...filters, [field]: values };
    if (metric) next.metric = [metric];
    setScreen("Issues");
    setMode("Basic");
    apply(next, sort, true, "", "Issues");
  }
  function changeScreen(name) { setScreen(name); setSelected(null); setError(""); setRefresh(0); }
  function recall(item) {
    apply(item.filters, item.sort, false, item.rawJql, "Issues");
    setMode(item.rawJql ? "JQL" : "Basic");
    if (item.rawJql) setJql(item.rawJql);
    setScreen("Issues");
  }
  function save() {
    const title = activeJql || createJql(filters, sort, live);
    if (!saved.some(item => item.title === title)) updateViews([...saved, { title, filters, sort, rawJql: activeJql }]);
    setScreen("Saved views");
  }
  function updateViews(views) {
    setSaved(views);
    savePreference("views", persistViews, views);
  }
  async function exportRows(rows) {
    setExporting(true);
    setExportStatus(null);
    try {
      const destination = await pickPath({ kind: "folder" });
      if (!destination) return;
      const title = live ? "Jira issue review" : "Jira issue review · demo";
      const table = [["Key", "Summary", "Status", "Assignee", "Due"],
        ...rows.map(issue => [issue.id, issue.summary, issue.status, (issue.assigneeUser ?? person(issue.assignee))?.name ?? "", issue.due])];
      const result = await saveDocument({ name: (live ? "jira-review-" : "jira-demo-review-") + Date.now() + ".md", folder: destination.path, open: true,
        authoring: { title, inputs: [{ key: "review", blocks: [
          { kind: "paragraph", text: (live ? "" : "Demo data · ") + rows.length + " selected " + (rows.length === 1 ? "issue" : "issues") },
          { kind: "table", rows: table },
        ] }] } });
      setExportStatus({ text: result.opening?.status === "refused" ? "Report saved. Open it from the selected folder." : "Report saved." });
    } catch (error) {
      if (error?.name !== "AbortError") setExportStatus({ error: true, text: "Could not save the report. Check the open folder and try again." });
    } finally {
      setExporting(false);
    }
  }
  const resultsProps = { React, ui, page, total, offset, inspect, received, loading: network.loading,
    previous: () => { setOffset(pageHistory.at(-1) ?? 0); setPageHistory(current => current.slice(0, -1)); setRefresh(0); setSelected(null); },
    next: () => { if (!received) return; setPageHistory(current => [...current, offset]); setOffset(offset + received); setRefresh(0); setSelected(null); } };
  function remember(field, option) {
    setKnown(current => ({ ...current, [field]: { ...current[field], [option.id]: option.name } }));
  }
  const connected = live && identity.value && !authFailed;
  const status = live ? connected ? "Connected as " + identity.value.name : identity.loading ? "Connecting" : "Jira unavailable" : "Demo data";
  return <ui.ScreenLayout details={filters.project?.map(value => known.project?.[value] ?? projectName(value)).join(", ")} description="Jira issue trends and filters"
    status={<ui.Status tone={connected ? "ok" : authFailed ? "error" : "neutral"} label={status} />}
    actions={<><ui.Button variant="ghost" onClick={changeSource}>{live ? "Use demo" : "Use Jira"}</ui.Button>
      <ui.Button onClick={() => {
        setRefreshed(new Date().toLocaleTimeString());
        if (live && !connected) retryConnection();
        setRefresh(current => current + 1);
      }}>Refresh</ui.Button></>}>
    <style>{styles}</style>
    <div className="jd">
      {storageFailures.last && <ui.Notice tone="warning">Could not restore or remember the last search.</ui.Notice>}
      {storageFailures.views && <ui.Notice tone="warning">Could not restore or remember saved views.</ui.Notice>}
      <Tabs label="Dashboard views" names={navigation} current={screen} select={changeScreen} />
      {screen === "Saved views" ? <section className="panel pad"><h2>Saved views</h2><p>{storageKey && !storageFailures.views ? "Stored on this Litzio Host" : "Available for this session"}</p>
        {saved.length ? saved.map(item => <div key={item.title} className="between"><ui.Button variant="ghost" onClick={() => recall(item)}>{item.title}</ui.Button>
          <ui.Button size="sm" onClick={() => updateViews(saved.filter(other => other !== item))}>Remove</ui.Button></div>) : <p>No saved views.</p>}</section>
        : <>
          <Filters {...{ React, ui, invoke, live, draft, setDraft, submit, mode, setMode, jql, setJql, generated, error, save, recent, recall, remember, known }} scopeOnly={activeScope} />
          {exportStatus && <ui.Notice tone={exportStatus.error ? "error" : "success"}>{exportStatus.text}</ui.Notice>}
          {identity.error && <ui.Notice tone="error">{identity.error}</ui.Notice>}
          {network.loading && <p role="status">Loading Jira results…</p>}
          {network.error && <ui.Notice tone="error">{network.error}</ui.Notice>}
          {live && activeScope && activeJql && <small>Advanced JQL is applied in Issues and Board. This view uses the project scope.</small>}
          {live && network.value?.at && <small>{network.error ? "Last successful result" : "Retrieved"} · {new Date(network.value.at).toLocaleString()}</small>}
          {!live && activeScope && <small>{results.length} matching demo issues · Snapshot {today}{refreshed ? " · refreshed " + refreshed : ""}</small>}
          {live && !hasProject && !activeJql && <div className="panel pad"><h2>Choose a Jira project</h2><p>Open Add filter, select Project, then apply the scope.</p></div>}
          {!authFailed && (!live || (ready && (hasProject || (!activeScope && activeJql)))) &&
          <div className={selected ? "work split" : "work"}>
            <div className="jd results">
              {activeScope ? <Overview {...{ React, ui, results, filters, sampleLimit, inspect, live }} snapshot={overview.value} analytics={screen === "Analytics"}
                analyze={() => changeScreen("Analytics")} open={drill} onExtend={() => { setSampleLimit(200); setRefresh(0); }} />
                : screen === "Board" ? <Board key={offset + createJql(filters, sort, live)} {...resultsProps} />
                : <IssueTable {...resultsProps} {...{ exportRows, exporting }} sort={sort} selected={selected}
                  onSort={field => {
                    if (activeJql) { setError("Edit ORDER BY in the advanced search to sort these results."); return; }
                    const sorting = { field, direction: sort.field === field && sort.direction === "ASC" ? "DESC" : "ASC" };
                    setSort(sorting);
                    savePreference("last", persistLast, { filters, sort: sorting, screen });
                    setOffset(0); setPageHistory([]); setRefresh(0);
                  }} />}
            </div>
            {selected && <Details key={selected.id} {...{ React, ui, invoke, live, inspect, close }} issue={selected} />}
          </div>}
        </>}
    </div>
  </ui.ScreenLayout>;
}
