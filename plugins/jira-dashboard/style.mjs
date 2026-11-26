export default `
.jd{--j-bg:var(--id-color-surface);--j-soft:var(--id-color-surface-subtle);--j-border:var(--id-color-border-subtle);--j-accent:var(--id-color-interaction);--j-muted:var(--id-color-text-muted);--j-success:var(--id-color-success);--j-bad:var(--id-color-danger);--j-warn:var(--id-color-warning);display:grid;gap:var(--space-4,16px);min-width:0;font-variant-numeric:tabular-nums}
.jd button,.jd input,.jd textarea,.jd select{font:inherit;color:inherit}
.jd button:not(:disabled){cursor:pointer}
.jd :focus-visible{outline:2px solid var(--j-accent);outline-offset:2px}
.jd h2,.jd h3,.jd p{margin:0}.jd p,.jd small{color:var(--j-muted)}
.jd button[aria-pressed=true],.jd button[aria-selected=true]{color:var(--j-accent);background:var(--j-soft)}
.jd nav,.jd .line,.jd .between{display:flex;align-items:center;gap:var(--space-2,8px);flex-wrap:wrap}
.jd .between{justify-content:space-between}
.jd nav{border-bottom:1px solid var(--j-border)}
.jd nav button{background:none;border:0;padding:var(--space-3,12px);border-bottom:2px solid transparent}
.jd nav button[aria-pressed=true]{border-color:var(--j-accent);font-weight:600}
.jd .panel{background:var(--j-bg);border:1px solid var(--j-border);border-radius:var(--id-radius-md,8px);min-width:0}
.jd .pad{padding:var(--space-4,16px)}
.jd .metrics{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.jd .metrics button{background:transparent;text-align:left;border:0;border-inline-end:1px solid var(--j-border);padding:var(--space-3,12px)}
.jd .metrics button:last-child{border:0}
.jd .metrics span{display:block;font-size:var(--font-size-xl,24px);font-weight:650;margin-top:var(--space-1,4px)}
.jd .danger{color:var(--j-bad)}.jd .success{color:var(--j-success)}.jd .warn{color:var(--j-warn)}
.jd .hero{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:var(--space-4,16px)}
.jd .dist{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-4,16px)}
.jd .bars{display:grid;gap:var(--space-1,4px);margin-top:var(--space-2,8px)}
.jd .barrow{display:grid;grid-template-columns:minmax(64px,1fr) minmax(25px,1fr) auto;align-items:center;gap:var(--space-2,8px);text-align:left;border:0;background:transparent;padding:var(--space-1,4px)}
.jd .barrow:hover,.jd .due:hover{background:var(--j-soft)}
.jd .bar{height:6px;border-radius:6px;background:var(--j-soft)}
.jd .bar span{display:block;height:100%;border-radius:inherit;background:var(--j-accent)}
.jd .due{display:flex;width:100%;justify-content:space-between;align-items:center;gap:var(--space-2,8px);text-align:left;background:transparent;border:0;border-bottom:1px solid var(--j-border);padding:var(--space-3,12px) 0}
.jd .due:last-child{border:0}.jd .due span:first-child{display:grid;gap:3px}
.jd .key{color:var(--j-accent);font-family:var(--font-family-mono,monospace);font-size:var(--font-size-xs,12px);font-weight:600}
.jd .chartbody{position:relative;min-height:192px;display:flex;align-items:stretch;margin-top:var(--space-4,16px)}
.jd .chartlines{position:absolute;top:0;left:0;width:100%;height:168px;pointer-events:none;background:repeating-linear-gradient(to top,transparent 0,transparent 24%,var(--j-border) 24%,var(--j-border) 25%)}
.jd .chartcol{position:relative;display:flex;flex:1;min-width:0;flex-direction:column;justify-content:flex-start;align-items:center;border:0;background:transparent;padding:0;gap:var(--space-1,4px)}
.jd .chartcol:hover,.jd .chartcol:focus-visible{background:color-mix(in srgb,var(--j-accent) 9%,transparent)}
.jd .chartpair{height:168px;position:relative;width:100%}
.jd .chartpair i{position:absolute;left:50%;transform:translate(-50%,50%);width:8px;height:8px;background:var(--j-bg);border:2px solid var(--j-accent);border-radius:50%}.jd .chartpair i:last-child{border-color:var(--j-success)}
.jd .chart-tip{position:absolute;z-index:1;top:20px;left:50%;transform:translateX(-50%);padding:6px 8px;font-size:var(--font-size-xs,12px);pointer-events:none;min-width:120px}
.jd .search{min-width:min(300px,100%)}.jd .spacer{flex:1}
.jd textarea{box-sizing:border-box;width:100%;min-height:78px;padding:var(--space-2,8px);background:var(--j-bg);border:1px solid var(--j-border);border-radius:var(--id-radius-sm,5px)}
.jd .relative{position:relative}.jd .popover{position:absolute;z-index:3;top:calc(100% + 5px);left:0;width:min(345px,82vw);box-shadow:0 8px 24px color-mix(in srgb,var(--id-color-text) 16%,transparent);display:grid;gap:var(--space-2,8px)}
.jd .popover label{display:grid;gap:2px}.jd .popover .option{display:flex;width:100%;gap:8px;align-items:center;text-align:left;background:none;border:0;padding:6px}.jd .popover .option[aria-selected=true]{background:var(--j-soft)}
.jd .option .display{display:grid;flex:1}.jd .option small{font-family:var(--font-family-mono,monospace)}
.jd .avatar{display:inline-grid;place-items:center;border-radius:50%;height:24px;width:24px;background:var(--j-soft);color:var(--j-accent);font-size:var(--font-size-xs,12px);font-weight:640;flex:none}
.jd .work{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-3,12px);align-items:start}
.jd .work.split{grid-template-columns:minmax(0,1fr) minmax(290px,37%)}
.jd .tableViewport{overflow:auto;max-height:510px}
.jd table{border-collapse:separate;border-spacing:0;width:100%;font-size:var(--font-size-sm,13px);text-align:left}
.jd th,.jd td{padding:9px 11px;border-bottom:1px solid var(--j-border);white-space:nowrap}
.jd th{position:sticky;top:0;background:var(--j-soft);z-index:1;font-weight:600}.jd th button,.jd td button{border:0;background:none;padding:0;text-align:left}
.jd td button:hover{text-decoration:underline}.jd tr[aria-selected=true]{background:var(--j-soft)}.jd .compact td{padding-block:4px}.jd .pagination{padding:var(--space-2,8px)}
.jd .columns{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:var(--space-2,8px);overflow-x:auto}
.jd .lane{padding:var(--space-2,8px);background:var(--j-soft)}
.jd .ticket{display:grid;gap:var(--space-2,8px);padding:var(--space-2,8px);width:100%;text-align:left;color:inherit;margin:var(--space-2,8px) 0;min-height:102px}
.jd .details{display:grid;gap:var(--space-3,12px);max-height:75vh;overflow:auto;scrollbar-gutter:stable}
.jd .details nav button{padding:6px}.jd .details section{display:grid;gap:var(--space-2,8px);border-top:1px solid var(--j-border);padding-top:var(--space-2,8px)}
.jd dl{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-2,8px);margin:0}.jd dt{color:var(--j-muted)}.jd dd{margin:0}
@media(max-width:1000px){.jd .dist{grid-template-columns:repeat(2,minmax(0,1fr))}.jd .metrics{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:760px){.jd .work.split{grid-template-columns:minmax(0,1fr)}.jd .work.split>.results{display:none}.jd .hero{grid-template-columns:minmax(0,1fr)}.jd .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
