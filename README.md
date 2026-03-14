@g9wp/aria2


A lightweight, modern, and type-safe client library for aria2. Designed to work seamlessly across different environments, including Node.js, Browsers, and Userscripts (Tampermonkey).

#  🚀 Key Features

* Dual Protocol Support: Seamlessly connect via HTTP or WebSocket (JSON-RPC).

*　Tampermonkey Ready: Built-in support for @g9wp/aria2/gm to handle cross-origin requests in userscripts effortlessly.

# 📦 Installation

```bash
deno install jsr:@g9wp/aria2

# pnpm 10.9+ and yarn 4.9+
pnpm add jsr:@g9wp/aria2
yarn add jsr:@g9wp/aria2

# npm, bun, and older versions of yarn or pnpm
npx jsr add @g9wp/aria2
bunx jsr add @g9wp/aria2
yarn dlx jsr add @g9wp/aria2
pnpm dlx jsr add @g9wp/aria2
```

# Example

1. Import and Config
* HTTP
```ts
import { Aria2Client } from "@g9wp/aria2";

const a = new Aria2Client({ port: 26800 });
```

* Websocket
```ts
import { Aria2Client } from "@g9wp/aria2";

using a = new Aria2Client(); // auto close websocket
await a.connect(); // connect websocket
// a.close(); // or manually close websocket
```

* Tampermonkey / Userscript
```ts
// ==UserScript==
// ...
// @connect      localhost
// @grant        GM.xmlHttpRequest
// ==/UserScript==
import { Aria2Client } from "@g9wp/aria2/gm"; // import gm version

const a = new Aria2Client({ host: "localhost" }); 
```

2. Operations
```ts
const version = await a.getVersion();
console.log({ version });

const url = "https://www.google.com/";
const gid = await a.addUri([url], { out: "google.html" });
console.log({ gid });

const status = await a.tellStatus(gid);
console.log({ gid, status });
```
