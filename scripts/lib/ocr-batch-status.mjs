import { join } from "node:path";
import { atomicWriteJson } from "./ocr-capture.mjs";

export const PROCESSING_STATUS_FILE = "processing-status.json";

export async function writeProcessingStatus(runDir, status, extra = {}) {
  const value = {
    status,
    updated_at: new Date().toISOString(),
    ...extra,
  };
  await atomicWriteJson(join(runDir, PROCESSING_STATUS_FILE), value);
  return value;
}
