/**
 * Aria2 TypeScript SDK (Core)
 */

// --- 1. 类型定义 (Types) ---

export type Aria2Status =
  | "active"
  | "waiting"
  | "paused"
  | "error"
  | "complete"
  | "removed";

export interface Aria2File {
  index: string;
  path: string;
  length: string;
  completedLength: string;
  selected: string;
  uris: Array<{ uri: string; status: "used" | "waiting" }>;
}

export interface Aria2BTInfo {
  announceList: string[][];
  comment?: string;
  creationDate?: number;
  mode: "single" | "multi";
  info: { name: string };
}

export interface Aria2DownloadStatus {
  gid: string;
  status: Aria2Status;
  totalLength: string;
  completedLength: string;
  uploadLength: string;
  bitfield?: string;
  downloadSpeed: string;
  uploadSpeed: string;
  infoHash?: string;
  numSeeders?: string;
  seeder?: string;
  pieceLength: string;
  numPieces: string;
  connections: string;
  errorCode?: string;
  errorMessage?: string;
  followedBy?: string[];
  following?: string;
  belongsTo?: string;
  dir: string;
  files: Aria2File[];
  bittorrent?: Aria2BTInfo;
  verifiedLength?: string;
  verifyIntegrityPending?: string;
}

export interface Aria2GlobalStat {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
  numStoppedTotal: string;
}

export interface Aria2Version {
  version: string;
  enabledFeatures: string[];
}

export interface Aria2Options {
  dir?: string;
  out?: string;
  header?: string[];
  split?: string;
  "max-connection-per-server"?: string;
  "user-agent"?: string;
  "all-proxy"?: string;
  "max-download-limit"?: string;
  "max-upload-limit"?: string;
  [key: string]: any;
}

// --- 2. 客户端实现 (Client) ---

export class Aria2ClientCore {
  private secret: string;
  private httpUrl: string;
  protected sendJson!: (url: string, payload: unknown) => Promise<any>;

  constructor(options?: {
    host?: string;
    port?: number;
    secret?: string;
    secure?: boolean;

    postJson?: (url: string, payload: unknown) => Promise<any>;
  }) {
    const { host = "localhost", port = 6800, secret = "", secure = false } = options ?? {};
    this.httpUrl = `${secure ? "https" : "http"}://${host}:${port}/jsonrpc`;
    this.secret = secret;

    this.sendJson = async (url: string, payload: unknown) => {
      const result = await (options?.postJson ?? postJson)(url, payload);
      if (result.error) throw new Error(`[Aria2 Error] ${result.error.code}: ${result.error.message}`);
      return result.result;
    };
  }

  request<T>(method: string, params: any[] = []): Promise<T> {
    const id = crypto.randomUUID();
    const rpcParams = this.secret ? [`token:${this.secret}`, ...params] : params;
    const payload = {
      jsonrpc: "2.0",
      id,
      method: `aria2.${method}`,
      params: rpcParams,
    };

    return this.sendJson(this.httpUrl, payload);
  }

  addUri(uris: string[], options: Aria2Options = {}): Promise<string> {
    return this.request("addUri", [uris, options]);
  }

  tellStatus(gid: string, keys?: (keyof Aria2DownloadStatus)[]): Promise<Aria2DownloadStatus> {
    return this.request("tellStatus", keys ? [gid, keys] : [gid]);
  }

  getVersion(): Promise<Aria2Version> {
    return this.request("getVersion");
  }
}

export async function postJson<Req = unknown, Res = any>(url: string, payload: Req): Promise<Res> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}
