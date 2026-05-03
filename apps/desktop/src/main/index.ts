import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import type { Agent, LlmProvider, UserProfile } from "@yomitomo/shared";
import { deleteAgent, deleteProvider, readStore, saveAgent, saveProvider, saveUser } from "./store";
import { testProvider } from "./llm";
import { clearLogFile, getLogPath, logInfo, readLogFile } from "./logger";
import { broadcastStatus, startLocalServer } from "./server";

let mainWindow: BrowserWindow | null = null;
const appIconPath = join(__dirname, "../../resources/icon.png");

app.setName("@yomitomo/desktop");

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    title: "Yomitomo",
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  logInfo("app.ready", { logPath: getLogPath() });
  if (process.platform === "darwin" && app.dock) app.dock.setIcon(appIconPath);
  registerIpc();
  await startLocalServer();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

function registerIpc() {
  ipcMain.handle("store:get", () => readStore());
  ipcMain.handle("log:path", () => getLogPath());
  ipcMain.handle("log:read", () => readLogFile());
  ipcMain.handle("log:clear", () => clearLogFile());
  ipcMain.handle("user:save", (_event, input: Partial<UserProfile>) => saveUser(input));
  ipcMain.handle("provider:save", async (_event, input: Partial<LlmProvider>) => {
    const store = await saveProvider(input);
    broadcastStatus();
    return store;
  });
  ipcMain.handle("provider:delete", async (_event, id: string) => {
    const store = await deleteProvider(id);
    broadcastStatus();
    return store;
  });
  ipcMain.handle("provider:test", async (_event, id: string) => {
    try {
      const store = await readStore();
      const provider = store.providers.find((item) => item.id === id);
      if (!provider) return { ok: false, message: "Provider 不存在" };
      return testProvider(provider);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Provider 测试失败" };
    }
  });
  ipcMain.handle("agent:save", async (_event, input: Partial<Agent>) => {
    const store = await saveAgent(input);
    broadcastStatus();
    return store;
  });
  ipcMain.handle("agent:delete", async (_event, id: string) => {
    const store = await deleteAgent(id);
    broadcastStatus();
    return store;
  });
}
