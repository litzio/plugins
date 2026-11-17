export function imageKeys(blocks) {
  return new Map(blocks.filter(b => ['table','figure'].includes(b.kind))
    .map((b,i) => [b.id, `${b.kind}-${String(i+1).padStart(3,'0')}`]));
}

export async function imageReceipt(image) {
  const bytes = Uint8Array.from(atob(image.base64), c => c.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {key:image.key, sha256:Array.from(digest, b=>b.toString(16).padStart(2,'0')).join('')};
}
