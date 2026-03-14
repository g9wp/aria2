/**
 * Aria2 TypeScript SDK (tampermonkey)
 *
 * require UserScript permissions:
 *    @grant GM.xmlHttpRequest
 *    @connect somehostname
 */
// ==UserScript==
// @connect      localhost
// @grant        GM.xmlHttpRequest
// ==/UserScript==

export * from "./aria2_core.ts";
import { Aria2ClientCore } from "./aria2_core.ts";

// --- 2. 客户端实现 (Client) ---

export class Aria2Client extends Aria2ClientCore {
  constructor(options?: {
    host?: string;
    port?: number;
    secret?: string;
    secure?: boolean;
  }) {
    super({
      ...options,
      postJson: async (url, payload) => {
        console.log(`[Aria2] GM.xmlHttpRequest`, { payload });
        const response = await GM.xmlHttpRequest({
          url,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify(payload),
          responseType: "json",
        });
        return response.response;
      },
    });
  }
}
