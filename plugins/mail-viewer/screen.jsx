const SHOWN = 3;
const person = p => (p.name && p.address ? `${p.name} <${p.address}>` : p.name || p.address);

function size(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function People({ React, ui, list }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <span>
      {shown.map(person).join(", ")}
      {list.length > SHOWN && !all && <>{" "}<ui.Button variant="ghost" size="sm" onClick={() => setAll(true)}>외 {list.length - SHOWN}명</ui.Button></>}
    </span>
  );
}

function Screen({ React, ui, invoke, pickPath }) {
  const { useState } = React;
  const [mail, setMail] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function choose() {
    let picked;
    try { picked = await pickPath({ kind: "file", extensions: [".eml"] }); }
    catch (e) {
      if (e?.name === "AbortError") return;
      setError("메일 파일을 고를 수 없습니다. 열린 폴더가 없다면 왼쪽 탐색기의 ‘폴더 열기’에서 메일 파일이 든 폴더를 먼저 여세요.");
      return;
    }
    if (!picked) return;
    setReading(true); setError("");
    try { setMail(await invoke("read", { path: picked.path })); }
    catch (e) { setMail(null); setError(e.message || "파일을 읽지 못했습니다."); }
    finally { setReading(false); }
  }

  const chooseButton = <ui.Button variant="default" disabled={reading} onClick={choose}>메일 파일 고르기</ui.Button>;
  const status = reading ? <ui.Status tone="progress" label="메일 읽는 중" />
    : error ? <ui.Status tone="error" label="열지 못함" />
      : mail ? <ui.Status tone={mail.problems.length ? "warning" : "ok"} label={mail.problems.length ? "일부만 읽음" : "메일 읽음"} /> : undefined;

  if (!mail) {
    return (
      <ui.ScreenLayout width="narrow" status={status} actions={error ? chooseButton : undefined}>
        {error && <ui.Notice tone="error">{error}</ui.Notice>}
        {!error && <ui.EmptyState title="메일 파일을 고르세요" description="열린 폴더의 .eml 파일을 고르면 제목, 보낸 사람, 받는 사람, 날짜와 본문, 첨부 목록을 보여 줍니다." action={chooseButton} />}
      </ui.ScreenLayout>
    );
  }

  const rows = mail.attachments.map((a, i) => ({ id: i, name: a.name, kind: a.kind, size: size(a.size) }));
  return (
    <ui.ScreenLayout width="narrow" description={mail.name} status={status} actions={chooseButton}>
      <style>{`
.mail-viewer-body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:inherit;line-height:1.6}
.mail-viewer-section{display:flex;flex-direction:column;gap:var(--space-3);margin-top:var(--space-6)}
`}</style>
      {error && <ui.Notice tone="error">{error}</ui.Notice>}
      {mail.problems.map(p => <ui.Notice key={p}>{p}</ui.Notice>)}
      <h2 className="type-section-title">{mail.subject || "(제목 없음)"}</h2>
      <div>
        <ui.Row kind="fact" label="보낸 사람">{mail.from.map(person).join(", ") || "—"}</ui.Row>
        <ui.Row kind="fact" label="받는 사람">{mail.to.length ? <People React={React} ui={ui} list={mail.to} /> : "—"}</ui.Row>
        {mail.cc.length > 0 && <ui.Row kind="fact" label="참조"><People React={React} ui={ui} list={mail.cc} /></ui.Row>}
        <ui.Row kind="fact" label="날짜">{mail.date ? <span title={mail.date.original || undefined}>{mail.date.text}</span> : "—"}</ui.Row>
      </div>
      <section className="mail-viewer-section" aria-label="본문">
        {mail.body.from === "html" && <ui.Status variant="plain" tone="neutral" label="HTML 메일을 글자로 바꿔 보입니다" />}
        {mail.body.text ? <div className="mail-viewer-body">{mail.body.text}</div> : <ui.EmptyState title="본문이 없습니다" />}
      </section>
      {rows.length > 0 && (
        <section className="mail-viewer-section" aria-label="첨부 파일">
          <h3>첨부 파일 {rows.length}개</h3>
          <ui.DataTable title="첨부 파일" rows={rows} rowKey="id" columns={["name", "kind", "size"]} labels={{ name: "이름", kind: "종류", size: "크기" }} />
        </section>
      )}
    </ui.ScreenLayout>
  );
}
export { Screen as default };
