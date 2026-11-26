// Keep the current document mounted until conversion and content saves have settled.
export function useFileHandoff(React, handoff, busy, content) {
  React.useEffect(() => {
    if (!handoff || busy || content.held) return;
    let current = true;
    content.settled().then(() => {
      if (current && !content.pending()) handoff();
    });
    return () => { current = false; };
  }, [handoff, busy, content.held]);
}
