// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { gatewayReachableCompatibleEndpointUrl } from "../../inference/native-local/eligibility";
import { qualifiedNativeLocalEndpointUrl } from "../../inference/native-local/agent-config";
import { OLLAMA_PROXY_PORT } from "../../core/ollama-proxy-port";
import { OLLAMA_LOCAL_CREDENTIAL_ENV } from "../../inference/ollama/contract";
import {
  isLoopbackNoAuthCompatibleEndpointUrl,
  isLegacyRecordedLoopbackNoAuthCompatibleEndpointUrl,
} from "./compatible-endpoint-gateway-route";

import { readProxyBackendIdentity } from "../../inference/ollama/proxy-backend";

import { nativeLocalAttachmentMatchesHostLocalReceipt } from "../../state/registry/host-local-inference";

/** Match a normalized native attachment to its selected route using the existing endpoint owners. */
export function nativeLocalAttachmentMatchesSelectedEndpoint(
  provider: string,
  selectedEndpointUrl: string | null | undefined,
  attachmentEndpointUrl: string,
  serializedReceipt: string | null | undefined,
  credentials?: {
    selected: string | null | undefined;
    attachment: string;
    authMode: "authenticated" | "sentinel";
  },
): boolean {
  if (
    provider === "compatible-endpoint" &&
    (credentials?.selected === OLLAMA_LOCAL_CREDENTIAL_ENV ||
      credentials?.attachment === OLLAMA_LOCAL_CREDENTIAL_ENV)
  ) {
    if (
      credentials.selected !== OLLAMA_LOCAL_CREDENTIAL_ENV ||
      credentials.attachment !== OLLAMA_LOCAL_CREDENTIAL_ENV ||
      credentials.authMode !== "authenticated" ||
      !selectedEndpointUrl ||
      (!isLoopbackNoAuthCompatibleEndpointUrl(provider, selectedEndpointUrl) &&
        !isLegacyRecordedLoopbackNoAuthCompatibleEndpointUrl(provider, selectedEndpointUrl))
    )
      return false;
    const selected = new URL(selectedEndpointUrl);
    const proxyEndpoint = qualifiedNativeLocalEndpointUrl(
      `http://host.openshell.internal:${OLLAMA_PROXY_PORT}${selected.pathname}`,
    );
    if (!proxyEndpoint || attachmentEndpointUrl !== proxyEndpoint) return false;
    // The shared proxy address alone does not identify the selected backend.
    const backend = readProxyBackendIdentity();
    return backend.kind === "compatible-endpoint" && backend.url === selected.origin;
  }
  const gatewayEndpoint = gatewayReachableCompatibleEndpointUrl(provider, selectedEndpointUrl);
  return (
    attachmentEndpointUrl === qualifiedNativeLocalEndpointUrl(gatewayEndpoint ?? "") ||
    nativeLocalAttachmentMatchesHostLocalReceipt(
      selectedEndpointUrl,
      attachmentEndpointUrl,
      serializedReceipt,
    )
  );
}
