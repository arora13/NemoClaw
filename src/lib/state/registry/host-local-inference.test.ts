// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { OLLAMA_PROXY_PORT } from "../../core/ollama-proxy-port";
import { OLLAMA_LOCAL_CREDENTIAL_ENV } from "../../inference/ollama/contract";

import * as proxy from "../../inference/ollama/proxy-backend";

import { serializedHostLocalInferenceReceipt } from "../../../../test/helpers/host-local-inference-receipt";
import {
  cloneSandboxHostLocalInferenceReceipt,
  nativeLocalAttachmentMatchesHostLocalReceipt,
} from "./host-local-inference";

import { nativeLocalAttachmentMatchesSelectedEndpoint } from "../../onboard/inference-providers/native-local-attachment";

describe("protected compatible endpoint attachment", () => {
  const credentials = {
    selected: OLLAMA_LOCAL_CREDENTIAL_ENV,
    attachment: OLLAMA_LOCAL_CREDENTIAL_ENV,
    authMode: "authenticated" as const,
  };
  const endpoint = `http://host.openshell.internal:${OLLAMA_PROXY_PORT}/v1`;

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "matches the recorded %s backend through the configured proxy",
    (host) => {
      vi.spyOn(proxy, "readProxyBackendIdentity").mockReturnValue({
        kind: "compatible-endpoint",
        url: `http://${host}:8000`,
      });
      expect(
        nativeLocalAttachmentMatchesSelectedEndpoint(
          "compatible-endpoint",
          `http://${host}:8000/v1/`,
          endpoint,
          undefined,
          credentials,
        ),
      ).toBe(true);
    },
  );

  it.each([
    { name: "different backend", backend: "http://localhost:11434" },
    { name: "missing backend", backend: null },
    { name: "unclassified backend", kind: "unknown" as const },
    { name: "Ollama backend", kind: "ollama" as const },
    { name: "wrong selected credential", selected: "OTHER_TOKEN" },
    { name: "wrong attachment credential", attachment: "OTHER_TOKEN" },
    { name: "sentinel authentication", authMode: "sentinel" as const },
    { name: "foreign proxy host", endpoint: `http://other.internal:${OLLAMA_PROXY_PORT}/v1` },
    { name: "backend used as proxy", endpoint: "http://host.openshell.internal:8000/v1" },
    { name: "unsupported backend port", source: "http://localhost:9001/v1" },
    { name: "remote backend", source: "http://example.com:8000/v1" },
    { name: "wrong path", source: "http://localhost:8000/other" },
    { name: "query", source: "http://localhost:8000/v1?token=fixture" },
  ])("rejects a proxy route with $name", (scenario) => {
    vi.spyOn(proxy, "readProxyBackendIdentity").mockReturnValue({
      kind: scenario.kind ?? "compatible-endpoint",
      url: scenario.backend === undefined ? "http://localhost:8000" : scenario.backend,
    });
    expect(
      nativeLocalAttachmentMatchesSelectedEndpoint(
        "compatible-endpoint",
        scenario.source ?? "http://localhost:8000/v1",
        scenario.endpoint ?? endpoint,
        undefined,
        {
          selected: scenario.selected ?? credentials.selected,
          attachment: scenario.attachment ?? credentials.attachment,
          authMode: scenario.authMode ?? credentials.authMode,
        },
      ),
    ).toBe(false);
  });
});

describe("sandbox host-local inference receipt transport", () => {
  it("clones only complete canonical receipt transports", () => {
    const valid = serializedHostLocalInferenceReceipt();

    expect(cloneSandboxHostLocalInferenceReceipt(valid)).toBe(valid);
    expect(cloneSandboxHostLocalInferenceReceipt(null)).toBeNull();
    expect(cloneSandboxHostLocalInferenceReceipt(undefined)).toBeUndefined();
    expect(cloneSandboxHostLocalInferenceReceipt(valid.trimEnd())).toBeUndefined();
    expect(cloneSandboxHostLocalInferenceReceipt("[]\n")).toBeUndefined();
    expect(cloneSandboxHostLocalInferenceReceipt('{"providerId": "mxc"}\n')).toBeUndefined();
    expect(
      cloneSandboxHostLocalInferenceReceipt('{"apiKey":"must-not-persist"}\n'),
    ).toBeUndefined();
    expect(
      cloneSandboxHostLocalInferenceReceipt(`{"value":"${"a".repeat(33 * 1024)}"}\n`),
    ).toBeUndefined();
  });
});

it.each([
  {
    name: "exact bridge",
    application: "https://inference.local/v1",
    endpoint: "http://mxc.internal:8000/v1",
    receipt: serializedHostLocalInferenceReceipt(),
    expected: true,
  },
  {
    name: "foreign endpoint",
    application: "https://inference.local/v1",
    endpoint: "http://sibling.internal:8000/v1",
    receipt: serializedHostLocalInferenceReceipt(),
    expected: false,
  },
  {
    name: "unpublished application",
    application: "http://127.0.0.1:8000/v1",
    endpoint: "http://mxc.internal:8000/v1",
    receipt: serializedHostLocalInferenceReceipt(),
    expected: false,
  },
  {
    name: "missing receipt",
    application: "https://inference.local/v1",
    endpoint: "http://mxc.internal:8000/v1",
    receipt: undefined,
    expected: false,
  },
  {
    name: "malformed receipt",
    application: "https://inference.local/v1",
    endpoint: "http://mxc.internal:8000/v1",
    receipt: "{}",
    expected: false,
  },
])("matches native attachment only for $name", ({ application, endpoint, receipt, expected }) => {
  expect(nativeLocalAttachmentMatchesHostLocalReceipt(application, endpoint, receipt)).toBe(
    expected,
  );
  expect(
    nativeLocalAttachmentMatchesSelectedEndpoint("vllm-local", application, endpoint, receipt),
  ).toBe(expected);
});

it.each([
  {
    name: "canonical endpoint",
    provider: "compatible-endpoint",
    selected: "http://host.openshell.internal:11434/v1",
    expected: true,
  },
  {
    name: "canonical trailing slash",
    provider: "compatible-endpoint",
    selected: "http://host.openshell.internal:11434/v1/",
    expected: true,
  },
  {
    name: "loopback gateway mapping",
    provider: "compatible-endpoint",
    selected: "http://127.0.0.1:11434/v1/",
    expected: true,
  },
  {
    name: "wrong provider mapping",
    provider: "ollama-local",
    selected: "http://127.0.0.1:11434/v1",
    expected: false,
  },
  {
    name: "unsupported loopback port",
    provider: "compatible-endpoint",
    selected: "http://localhost:11436/v1",
    expected: false,
  },
  {
    name: "wrong route path",
    provider: "compatible-endpoint",
    selected: "http://localhost:11434/other",
    expected: false,
  },
  {
    name: "endpoint credentials",
    provider: "compatible-endpoint",
    selected: "http://secret@host.openshell.internal:11434/v1",
    expected: false,
  },
  {
    name: "endpoint query",
    provider: "compatible-endpoint",
    selected: "http://host.openshell.internal:11434/v1?token=secret",
    expected: false,
  },
  {
    name: "endpoint fragment",
    provider: "compatible-endpoint",
    selected: "http://host.openshell.internal:11434/v1#fragment",
    expected: false,
  },
  {
    name: "missing selection",
    provider: "compatible-endpoint",
    selected: undefined,
    expected: false,
  },
])("matches selected native endpoint only for $name", ({ provider, selected, expected }) => {
  expect(
    nativeLocalAttachmentMatchesSelectedEndpoint(
      provider,
      selected,
      "http://host.openshell.internal:11434/v1",
      undefined,
    ),
  ).toBe(expected);
});
