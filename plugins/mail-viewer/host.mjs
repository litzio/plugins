import { PluginPublicError } from "@litzio/plugin-sdk";
import { readMail, MailError } from "./mail.mjs";

export function activate() {
  return {
    status: () => ({ available: true, message: "준비됨" }),
    operations: {
      // Mail content goes back to the screen only; nothing is logged.
      read: async ({ path }) => {
        try { return await readMail(path); }
        catch (e) { throw new PluginPublicError("mail_viewer_failed", e instanceof MailError ? e.message : "파일을 읽지 못했습니다."); }
      },
    },
    dispose() {},
  };
}
