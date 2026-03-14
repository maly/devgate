import http from "http";
import { WebSocketServer } from "ws";
import { ensurePortFree } from "../tests/utils/port-utils.js";

const PORT = 10001;

export function createApp() {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("Hello from app");
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.send("hello-from-app-ws");
  });

  return { server, wss };
}

export async function startApp() {
  await ensurePortFree(PORT, true);
  
  const { server, wss } = createApp();
  
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`app fixture running on port ${PORT}`);
      resolve({ server, wss });
    });
  });
}

export function stopApp(server, wss) {
  return new Promise((resolve) => {
    wss.close(() => {
      server.close(() => {
        resolve();
      });
    });
  });
}
