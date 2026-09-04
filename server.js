import express from "express";
import fs from "fs/promises";
import path from "path";
import worker from "./worker.js";

const app = express();
app.use(express.json());

let kvFile = process.env.KV_PATH || "/kv/spider-kv.json";
if (kvFile === "/kv" || kvFile.endsWith("/")) {
  kvFile = path.join(kvFile, "spider-kv.json");
}
let kvData = {};

try {
  kvData = JSON.parse(await fs.readFile(kvFile, "utf8"));
} catch {}

async function saveKV() {
  await fs.mkdir(path.dirname(kvFile), { recursive: true });
  await fs.writeFile(kvFile, JSON.stringify(kvData));
}

const SPIDER_KV = {
  async get(key) {
    return kvData[key] ?? null;
  },
  async put(key, value) {
    kvData[key] = value;
    await saveKV();
  },
  async delete(key) {
    delete kvData[key];
    await saveKV();
  }
};

// Minimal Cloudflare D1 compatibility layer
const memoryRows = [];
const spider_ai = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async run() { return { success: true }; },
          async all() { return { results: [] }; },
          async first() { return null; }
        };
      },
      async all() { return { results: [] }; },
      async run() { return { success: true }; }
    };
  }
};

const env = {
  ...process.env,
  SPIDER_KV,
  spider_ai
};

app.use(async (req, res) => {
  try {
    const url = `http://${req.headers.host}${req.originalUrl}`;
    const init = {
      method: req.method,
      headers: req.headers
    };

    if (!["GET","HEAD"].includes(req.method)) {
      init.body = JSON.stringify(req.body ?? {});
    }

    const request = new Request(url, init);
    const response = await worker.fetch(request, env);

    res.status(response.status);
    response.headers.forEach((v,k)=>res.setHeader(k,v));
    res.send(await response.text());

  } catch (e) {
    console.error("WORKER ERROR:", e);
    res.status(500).send(e.message);
  }
});

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`SpiderBot running on ${port}`);
});
