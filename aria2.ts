/**
 * Aria2 TypeScript SDK (Full Implementation)
 * 支持 Fetch (HTTP) 与 WebSocket 双通信模式
 */

import { getLogger } from "@logtape/logtape";
const logger = getLogger("aria2");
// const logger = console;

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

export interface Aria2Notification {
  gid: string;
}

export type Aria2EventMap = {
  "onDownloadStart": Aria2Notification;
  "onDownloadPause": Aria2Notification;
  "onDownloadStop": Aria2Notification;
  "onDownloadComplete": Aria2Notification;
  "onDownloadError": Aria2Notification;
  "onBtDownloadComplete": Aria2Notification;
};

// --- 2. 客户端实现 (Client) ---

export class Aria2Client {
  private secret: string;
  private httpUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private listeners: Partial<
    { [K in keyof Aria2EventMap]: Array<(data: Aria2EventMap[K]) => void> }
  > = {};
  private pendingRequests = new Map<
    string,
    {
      // deno-lint-ignore no-explicit-any
      resolve: (value: any) => void;
      // deno-lint-ignore no-explicit-any
      reject: (reason?: any) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    options?: {
      host?: string;
      port?: number;
      secret?: string;
      secure?: boolean;
    },
  ) {
    const { host = "localhost", port = 6800, secret = "", secure = false } = options ?? {};
    this.httpUrl = `${secure ? "https" : "http"}://${host}:${port}/jsonrpc`;
    this.wsUrl = `${secure ? "wss" : "ws"}://${host}:${port}/jsonrpc`;
    this.secret = secret;
  }

  /**
   * 初始化 WebSocket 连接并开启事件监听
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        logger.info("[Aria2] WebSocket Connected");
        resolve();
      };

      this.ws.onerror = (err) => reject(err);

      this.ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        logger.trace("[Aria2] WebSocket message {*}", { data });

        // 1. 处理 RPC 响应 (匹配 ID)
        if (data.id && this.pendingRequests.has(data.id)) {
          const { resolve: res, reject: rej, timeout } = this.pendingRequests
            .get(data.id)!;
          clearTimeout(timeout);
          this.pendingRequests.delete(data.id);

          if (data.error) rej(data.error);
          else res(data.result);
        }

        // 2. 处理事件通知
        if (data.method && data.method.startsWith("aria2.on")) {
          const eventName = data.method.split(".")[1] as keyof Aria2EventMap;
          this.listeners[eventName]?.forEach((cb) => cb(data.params[0]));
        }
      };

      this.ws.onclose = () => {
        logger.info("[Aria2] WebSocket Closed");
        this.ws = null;
      };
    });
  }

  /**
   * 核心请求方法：优先 WS，失败或未连接则降级 HTTP
   */
  private async request<T>(method: string, params: any[] = []): Promise<T> {
    const id = crypto.randomUUID();
    const rpcParams = this.secret ? [`token:${this.secret}`, ...params] : params;
    const payload = {
      jsonrpc: "2.0",
      id,
      method: `aria2.${method}`,
      params: rpcParams,
    };

    // 优先尝试 WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve, reject) => {
        // 设置 10 秒超时防止 Promise 挂起
        const timeout = setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error("[Aria2] WebSocket Request Timeout"));
          }
        }, 10000);

        this.pendingRequests.set(id, { resolve, reject, timeout });
        logger.trace("[Aria2] WebSocket send {*}", { payload });
        this.ws!.send(JSON.stringify(payload));
      });
    }

    // 降级使用 HTTP Fetch
    logger.trace(`[Aria2] HTTP for: ${method}`, { payload });
    const response = await fetch(this.httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result.error) {
      throw new Error(
        `[Aria2 Error] ${result.error.code}: ${result.error.message}`,
      );
    }
    return result.result;
  }

  // === 任务 API ===

  addUri(uris: string[], options: Aria2Options = {}): Promise<string> {
    return this.request("addUri", [uris, options]);
  }

  pause(gid: string): Promise<string> {
    return this.request("pause", [gid]);
  }

  unpause(gid: string): Promise<string> {
    return this.request("unpause", [gid]);
  }

  remove(gid: string): Promise<string> {
    return this.request("remove", [gid]);
  }

  tellStatus(
    gid: string,
    keys?: (keyof Aria2DownloadStatus)[],
  ): Promise<Aria2DownloadStatus> {
    return this.request("tellStatus", keys ? [gid, keys] : [gid]);
  }

  tellActive(
    keys?: (keyof Aria2DownloadStatus)[],
  ): Promise<Aria2DownloadStatus[]> {
    return this.request("tellActive", keys ? [keys] : []);
  }

  tellWaiting(
    offset: number,
    num: number,
    keys?: (keyof Aria2DownloadStatus)[],
  ): Promise<Aria2DownloadStatus[]> {
    return this.request(
      "tellWaiting",
      keys ? [offset, num, keys] : [offset, num],
    );
  }

  tellStopped(
    offset: number,
    num: number,
    keys?: (keyof Aria2DownloadStatus)[],
  ): Promise<Aria2DownloadStatus[]> {
    return this.request(
      "tellStopped",
      keys ? [offset, num, keys] : [offset, num],
    );
  }

  // === 全局 API ===

  getGlobalStat(): Promise<Aria2GlobalStat> {
    return this.request("getGlobalStat");
  }

  getGlobalOption(): Promise<Aria2Options> {
    return this.request("getGlobalOption");
  }

  changeGlobalOption(options: Aria2Options): Promise<string> {
    return this.request("changeGlobalOption", [options]);
  }

  getVersion(): Promise<Aria2Version> {
    return this.request("getVersion");
  }

  // === 事件订阅 API ===

  /**
   * 订阅 Aria2 事件 (如下载完成、开始、错误等)
   */
  public on<K extends keyof Aria2EventMap>(
    event: K,
    callback: (data: Aria2EventMap[K]) => void,
  ): void {
    this.listeners[event] ??= [];
    this.listeners[event]!.push(callback);
  }

  /**
   * 关闭连接
   */
  public close(): void {
    this.ws?.close();
    this.pendingRequests.forEach(
      (req) => {
        clearTimeout(req.timeout);
        req.reject(new Error("closed"));
      },
    );
    this.pendingRequests.clear();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
