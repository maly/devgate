import { startApp, stopApp } from "./app.js";
import { startApi, stopApi } from "./api.js";
import { startAdmin, stopAdmin } from "./admin.js";
import { ensurePortFree } from "../tests/utils/port-utils.js";

const FIXTURE_PORTS = [10001, 10002, 10003];

let appInstance = null;
let apiInstance = null;
let adminInstance = null;

export async function startFixtures() {
  for (const port of FIXTURE_PORTS) {
    await ensurePortFree(port, true);
  }
  
  appInstance = await startApp();
  apiInstance = await startApi();
  adminInstance = await startAdmin();
  console.log("All fixtures started");
}

export async function stopFixtures() {
  if (appInstance) {
    await stopApp(appInstance.server, appInstance.wss);
  }
  if (apiInstance) {
    await stopApi(apiInstance.server, apiInstance.wss);
  }
  if (adminInstance) {
    await stopAdmin(adminInstance.server, adminInstance.wss);
  }
  console.log("All fixtures stopped");
}
