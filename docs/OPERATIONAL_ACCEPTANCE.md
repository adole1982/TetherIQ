# Operational Acceptance Ledger

This ledger records acceptance evidence for the LiteLLM-centered TetherMesh release candidate on branch `codex/security-remediation-ci`.

| Area | Status | Evidence | Remaining work |
|---|---|---|---|
| LiteLLM sidecar packaging and startup | PASS | Release run 43 (`34503072557`) and Windows native baseline run 43 (`34503072635`) passed sidecar security, packaging, readiness, and process-tree smoke checks on all advertised release targets. | None identified by CI. |
| Gateway readiness and authenticated model routes | PASS | Native `test_gateway_route` checks readiness and authenticated `/v1/models`; packaged run 42 returned one authenticated model route on a dynamic loopback port. | Repeat on run-43 install during final user-facing acceptance. |
| Bedrock Claude path | PASS | Run-42 packaged app authenticated a Bedrock route and Claude Code returned exact `TETHERMESH_OK`. | Repeat once against run-43 package. |
| OpenRouter, DeepSeek, and Mistral route mapping | PASS (code/CI) | Commit `18919676e46e3a4698ff973971c728ec5931a1da` adds provider prefixes and credential environment mappings; frontend/contract CI passed. | Live credentials are intentionally not required for CI. |
| Google Vertex AI | OUT OF SCOPE | Removed from the advertised provider list for this release because LiteLLM requires Google ADC/project/location rather than a generic API key. The provider type and config support remain available for a future release. | Add a dedicated ADC/project/location setup flow before re-advertising it. |
| Provider credential storage and validation | PASS / PARTIAL | Secure vault save and non-secret validation are covered by native and Python security suites; Bedrock bearer-token route works. | Define and document generic AWS credential semantics separately from bearer-token mode. |
| Client snippets and dynamic ports | PASS (source/CI) | Platform-aware snippet generation and dynamic-port handling are covered by commit `c990c79` and subsequent CI. | Live verification beyond Claude Code remains open. |
| Spend caps and reset audit trail | PASS (source/CI) | Atomic budget, daily/monthly caps, reset adjustments, crash recovery, and authorization suites pass in CI. | Exercise one control-plane mutation in the final packaged run. |
| Fallback routing | PASS (validation/source) | LiteLLM config generation and air-gapped routing-graph validation cover fallback targets and cycles. | Live upstream-failure fallback remains unverified without a controlled test provider. |
| Telemetry, redaction, and SSE | PASS (source/CI) | Secret-scrubbing, telemetry authorization, structured traces, stream accounting, and SSE implementation are covered by security suites. | Observe one live stream and telemetry event in the final packaged run. |
| Sidecar lifecycle and restart recovery | PASS (source/CI) | Lifecycle and crash-recovery suites pass; route-sync retry fixes saved-credential restart behavior. | Repeat close/reopen and route recovery on the final package. |
| Clean packaged Windows install | PASS (launch) | Run-43 artifact `10163117949`, digest `sha256:587594606b8cdcd822523c7606141b6b07ec197b8291cb3ad0f81ab8ef1d5104`, installed into an isolated directory and launched successfully. | Complete final gateway, Bedrock, restart, and stream checks on this exact install. |

## Final acceptance gate

The release is not marked fully accepted until the remaining runtime checks are completed. Vertex is explicitly excluded from this candidate and is reserved for a future release with a dedicated ADC/project/location setup flow.

