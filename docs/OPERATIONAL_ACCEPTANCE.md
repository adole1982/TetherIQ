# Operational Acceptance Ledger

This ledger records acceptance evidence for the LiteLLM-centered TetherMesh release candidate on branch `codex/security-remediation-ci`.

| Area | Status | Evidence | Remaining work |
|---|---|---|---|
| LiteLLM sidecar packaging and startup | PASS | Release run 45 (`34505807778`) and Windows native baseline run 45 (`34505807171`) passed sidecar security, packaging, readiness, and process-tree smoke checks on all four release targets. | None identified by CI. |
| Gateway readiness and authenticated model routes | PASS | Native `test_gateway_route` checks readiness and authenticated `/v1/models`; packaged run 42 returned one authenticated model route on a dynamic loopback port. Release run 45 published the final Windows package; user ran Test Gateway on that exact package and received `LiteLLM gateway authenticated with 1 model route on 127.0.0.1:50271`. | None for gateway readiness; Bedrock request and lifecycle checks remain open. |
| Bedrock Claude path | PASS | Run-42 packaged app authenticated a Bedrock route and Claude Code returned exact `TETHERMESH_OK`. | None for the authenticated request; live stream observation remains open. |
| OpenRouter, DeepSeek, and Mistral route mapping | PASS (code/CI) | Commit `18919676e46e3a4698ff973971c728ec5931a1da` adds provider prefixes and credential environment mappings; frontend/contract CI passed. | Live credentials are intentionally not required for CI. |
| Google Vertex AI | OUT OF SCOPE | Removed from the advertised provider list for this release because LiteLLM requires Google ADC/project/location rather than a generic API key. The provider type and config support remain available for a future release. | Add a dedicated ADC/project/location setup flow before re-advertising it. |
| Provider credential storage and validation | PASS / PARTIAL | Secure vault save and non-secret validation are covered by native and Python security suites; Bedrock bearer-token route works. | Define and document generic AWS credential semantics separately from bearer-token mode. |
| Client snippets and dynamic ports | PASS (source/CI) | Platform-aware snippet generation and dynamic-port handling are covered by commit `c990c79` and subsequent CI. | Live verification beyond Claude Code remains open. |
| Spend caps and reset audit trail | PASS (source/CI); BLOCKED (packaged mutation) | Atomic budget, daily/monthly caps, reset adjustments, crash recovery, and authorization suites pass in CI. | Exercise one control-plane mutation in the final packaged run. |
| Fallback routing | PASS (validation/source) | LiteLLM config generation and air-gapped routing-graph validation cover fallback targets and cycles. | Live upstream-failure fallback remains unverified without a controlled test provider. |
| Telemetry, redaction, and SSE | PASS (source/CI); FAIL (live telemetry) | Secret-scrubbing, telemetry authorization, structured traces, stream accounting, and SSE implementation are covered by security suites. | Live stream completed, but no TetherMesh telemetry or token counters appeared; diagnose issue #13 and retest. |
| Sidecar lifecycle and restart recovery | PASS | Lifecycle and crash-recovery suites pass; route-sync retry fixes saved-credential restart behavior. | None for restart and route recovery; live stream/telemetry remains open. |
| Clean packaged Windows install | PASS (launch); BLOCKED (runtime acceptance) | Release run 45 (`34505807778`) passed all four platform jobs. Windows artifact `10164281193` was downloaded, extracted, installed into `C:\Users\alexd\AppData\Local\Temp\tethermesh-run45-installed`, and `tethermesh.exe` launched successfully. | Complete final gateway, Bedrock, restart, and stream checks on this exact install. |

## Final acceptance gate

The release is not marked fully accepted until the remaining runtime checks are completed. Vertex is explicitly excluded from this candidate and is reserved for a future release with a dedicated ADC/project/location setup flow.
