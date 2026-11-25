import { edges, flowState, nodes } from "./flow.mjs";

const preference = "document-import.flow.collapsed";
function connector(a,b) {
  const [x,y] = nodes[a], [u,v] = nodes[b];
  const side = Math.sign(u-x);
  return `M${x+60*side} ${y} H${(x+u)/2} V${v} H${u-61*side}`;
}
export function FlowToggle({React, ui, open, toggle, state, controls}) {
  const {label, failure, current} = flowState(state);
  return <ui.Button size="sm" variant="ghost" onClick={toggle} aria-expanded={open} aria-controls={controls}>
    {open ? "▾" : "▸"} 흐름 · {label}{current === failure && " 실패"}
  </ui.Button>;
}
export default function Flow({ React, ui, mode = "home", expanded, controls, ...state }) {
  const [ownOpen,setOpen] = React.useState(() => {
    if (mode !== "home") return mode === "run";
    try { return localStorage.getItem(preference) !== "1"; } catch { return true; }
  });
  const open = expanded ?? ownOpen;
  const [hover,setHover] = React.useState(null);
  const [focus,setFocus] = React.useState(null);
  const help = focus || hover;
  const uid = React.useId();
  const id = controls ?? uid;
  const {path,current,label,failure,remaining} = flowState(state);
  function toggle() {
    setOpen(!open);
    if (mode === "home") try { localStorage.setItem(preference,open ? "1" : "0"); } catch {}
  }
  const color = name => "var(--id-color-" + name + ")";
  if (expanded === false) return null;
  return <section className="import-flow" aria-label="변환과 검수 흐름" style={{flex:"0 0 auto",minWidth:0}}>
    {expanded === undefined && <div style={{display:"flex",alignItems:"center",gap:"var(--space-2)"}}>
      <ui.Button variant="ghost" size="sm" onClick={toggle} aria-expanded={open} aria-controls={id}>
        {open ? "▾" : "▸"} {mode === "home" ? "변환과 검수 흐름" : "흐름"}
      </ui.Button>
      {label && <span className="type-helper">{label}{failure === current && " 실패"}</span>}
    </div>}
    {open && <div id={id} style={{overflowX:"auto",maxWidth:"100%"}}>
      <svg viewBox="0 0 876 259" style={{width:"100%",maxWidth:960,minWidth:830,display:"block"}} role="group"
        aria-label={current ? path.map(n=>nodes[n][2]).join(" → ") + " 경로이며 현재 단계는 " + label + "입니다." : "PDF와 워드의 변환과 검수 흐름입니다."}>
        <defs><marker id={uid+"-tip"} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 Z" fill="context-stroke"/>
        </marker></defs>
        {edges.map(([a,b,d])=>{
          const active = path.includes(a) && path.includes(b) && !(a === "compare" && b === "approved" && path.includes("checks"));
          return <path key={a+b} d={d || connector(a,b)} fill="none" stroke={color(active ? "accent" : "border")}
            markerEnd={`url(#${uid}-tip)`} strokeWidth={active ? 2 : 1.5} strokeDasharray={b === "assistant" ? "3 4" : undefined}/>;
        })}
        {Object.entries(nodes).map(([key,[x,y,name,description,person]])=>{
          const selected = key === current, passed = path.includes(key), planned = key === "assistant";
          const stroke = color(key === failure ? "danger" : passed || focus === key ? "accent" : "border");
          const caption = selected && state.phase ? state.phase : name + (key === "checks" && remaining ? " "+remaining : "");
          return <g key={key} transform={`translate(${x} ${y})`} tabIndex={0} role="group" aria-label={caption + ". " + description}
            onMouseEnter={()=>setHover(key)} onMouseLeave={()=>setHover(null)} onFocus={()=>setFocus(key)} onBlur={()=>setFocus(null)}>
            <rect x="-60" y="-15" width="120" height="30" rx="6" fill={selected ? "color-mix(in srgb, var(--id-color-accent) 14%, var(--id-color-surface))" : color("surface")} stroke={stroke}
              strokeWidth={selected ? 3 : 1} strokeDasharray={planned ? "4 3" : undefined}/>
            {person && <circle cx="-51" r="2.5" fill={color("text-muted")}/>}
            <text x={person ? 3 : 0} textAnchor="middle" dominantBaseline="central" className="type-helper"
              style={{fill:color(selected ? "accent" : current && !passed ? "text-muted" : "text"),fontWeight:selected ? 700 : undefined}}>
              {key === failure ? "× " : ""}{caption}
            </text>
          </g>;
        })}
        <text x="7" y="248" role={help ? "tooltip" : undefined} className="type-helper" fill={color("text-muted")}>{help ? nodes[help][3] : "● 직접 하는 일"}</text>
      </svg>
    </div>}
  </section>;
}
