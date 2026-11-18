export const browseScales=[1,.75,.5,.4];
export function steppedScale(value,delta) {
  const index=Math.max(0,browseScales.indexOf(value));
  return browseScales[Math.max(0,Math.min(browseScales.length-1,index+(delta>0?1:-1)))];
}
