import http from "http";
import { WebSocketServer } from "ws";
import { ensurePortFree } from "../tests/utils/port-utils.js";

const PORT = 10002;

export function createApi() {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ service: "api", ok: true }));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.send("hello-from-api-ws");
  });

  return { server, wss };
}

export async function startApi() {
  await ensurePortFree(PORT, true);
  
  const { server, wss } = createApi();
  
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`api fixture running on port ${PORT}`);
      resolve({ server, wss });
    });
  });
}

export function stopApi(server, wss) {
  return new Promise((resolve) => {
    wss.close(() => {
      server.close(() => {
        resolve();
      });
    });
  });
}
