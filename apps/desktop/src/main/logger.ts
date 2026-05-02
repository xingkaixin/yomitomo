import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

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
  return join(app.getPath("userData"), "reader-agent.log");
}

async function writeLog(level: "info" | "error", event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    data
  });

  console[level === "error" ? "error" : "log"]("[Reader Agent]", event, data || "");
  await appendFile(getLogPath(), `${line}\n`, "utf8");
}
