// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { openRegularFileNoFollow } from "../../adapters/fs/regular-file";
import { SHARED_LOCAL_ADAPTER_STATE_DIR } from "../local-adapter-lifecycle";
import type { ProxyBackendKind } from "./proxy-status";

const MAX_PROXY_STATE_FILE_BYTES = 64 * 1024;

export type StoredProxyBackendKind = Exclude<ProxyBackendKind, "unknown">;
export type ProxyBackendDescriptor = {
  readonly schemaVersion: 1;
  readonly kind: StoredProxyBackendKind;
  readonly url: string;
};
export type ProxyBackendIdentity = {
  readonly kind: ProxyBackendKind;
  readonly url: string | null;
};

export function readProxyStateFile(filePath: string): string | null {
  let opened;
  try {
    opened = openRegularFileNoFollow(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw new Error(`Cannot safely read Ollama auth proxy state at ${filePath}`, { cause: error });
  }
  try {
    return opened.readBytes(MAX_PROXY_STATE_FILE_BYTES).toString("utf8").trim() || null;
  } finally {
    opened.close();
  }
}

function parseProxyBackendDescriptor(raw: string | null): ProxyBackendDescriptor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed?.schemaVersion !== 1 ||
      (parsed.kind !== "ollama" && parsed.kind !== "compatible-endpoint") ||
      typeof parsed.url !== "string" ||
      parsed.url.trim().length === 0
    ) {
      return null;
    }
    return { schemaVersion: 1, kind: parsed.kind, url: parsed.url };
  } catch {
    return null;
  }
}

export function readProxyBackendIdentity(
  root = SHARED_LOCAL_ADAPTER_STATE_DIR,
): ProxyBackendIdentity {
  const url = readProxyStateFile(path.join(root, "ollama-backend"));
  const descriptor = parseProxyBackendDescriptor(
    readProxyStateFile(path.join(root, "ollama-backend.json")),
  );
  return descriptor?.url === url ? { kind: descriptor.kind, url } : { kind: "unknown", url };
}
