import { constants } from "node:fs";
import { appendFile, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";

const LOG_FILE_NAME = "yomitomo-agent.log";
const LEGACY_LOG_FILE_NAME = "reader-agent.log";

export function logInfo(event: string, data?: Record<string, unknown>) {
  void writeLog("info", event, data);
}

export function logError(event: string, error: unknown, data?: Record<string, unknown>) {
  void writeLog("error", event, {
    ...data,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error
  });
}

export function getLogPath() {
  return join(app.getPath("userData"), LOG_FILE_NAME);
}

function legacyLogPath() {
  return join(app.getPath("appData"), "@reader", "desktop", LEGACY_LOG_FILE_NAME);
}

async function writeLog(level: "info" | "error", event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    data
  });

  console[level === "error" ? "error" : "log"]("[Yomitomo]", event, data || "");
  await mkdir(dirname(getLogPath()), { recursive: true });
  await copyFile(legacyLogPath(), getLogPath(), constants.COPYFILE_EXCL).catch(() => undefined);
  await appendFile(getLogPath(), `${line}\n`, "utf8");
}
