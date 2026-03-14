/**
 * Aria2 TypeScript SDK (Full Implementation)
 * 支持 Fetch (HTTP) 与 WebSocket 双通信模式
 */

export * from "./aria2_core.ts";
import { Aria2ClientCore, type Aria2DownloadStatus, type Aria2GlobalStat, type Aria2Options } from "./aria2_core.ts";

import { getLogger } from "@logtape/logtape";
const logger = getLogger("aria2");
// const logger = console;

// --- 1. 类型定义 (Types) ---

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

export class Aria2Client extends Aria2ClientCore {
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

  constructor(options?: {
    host?: string;
    port?: number;
    secret?: string;
    secure?: boolean;
  }) {
    super(options);

    this.wsUrl = `${options?.secure ? "wss" : "ws"}://${options?.host ?? "localhost"}:${options?.port ?? 6800}/jsonrpc`;

    const httpPost = this.sendJson;

    // 核心请求方法：优先 WS，失败或未连接则降级 HTTP
    this.sendJson = (url: string, payload) => {
      // 优先尝试 WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return new Promise((resolve, reject) => {
          const id: string = (payload as any).id;
          // 设置 10 秒超时防止 Promise 挂起
          const timeout = setTimeout(() => {
            if (this.pendingRequests.has(id)) {
              this.pendingRequests.delete(id);
              reject(new Error("[Aria2] WebSocket Request Timeout"));
            }
          }, 10000);

          this.pendingRequests.set(id, { resolve, reject, timeout });
          logger.trace(`[Aria2] WebSocket send {*}`, { payload });
          this.ws!.send(JSON.stringify(payload));
        });
      }

      // 降级使用 HTTP Fetch
      logger.trace("[Aria2] HTTP send {*}", { payload });
      return httpPost(url, payload);
    };
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

  // === 任务 API ===

  pause(gid: string): Promise<string> {
    return this.request("pause", [gid]);
  }

  unpause(gid: string): Promise<string> {
    return this.request("unpause", [gid]);
  }

  remove(gid: string): Promise<string> {
    return this.request("remove", [gid]);
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
