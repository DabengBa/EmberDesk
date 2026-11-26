---
description: "Inbound IP, Host/DNS rebinding, outbound SSRF, CSRF and secret-handling boundaries that must stay distinct across server middleware changes."
kind: technical
topic: security-boundaries
id: INV-SERVER-SECURITY-BOUNDARIES
paths: [src/server-main.ts, src/middleware/whitelist.ts, src/middleware/hostWhitelist.ts, src/config-schema.ts, src/endpoints/secrets.ts, src/util.ts, src/middleware/validateFileName.ts]
enforcement: fresh-audit
---

# Server Security Boundaries

WHEN Express middleware order changes, IF focused route/order tests have not proved the new order, THEN the existing order MUST be preserved: security middleware, body parsing, CORS, auth/whitelist/host checks, sessions, CSRF, static/public routes, auth wall, private routes, uploads, error handler, final 404.

WHEN an inbound-IP, Host/DNS-rebinding, or outbound-SSRF control is changed, IF `whitelistMode`, `hostWhitelist`, and `privateAddressWhitelist` are merged or substituted for one another, THEN the change MUST be rejected; they MUST cover inbound IPs, Host/DNS rebinding, and outbound SSRF protection respectively. WHEN proxying is changed, IF `requestProxy` is merged with `privateAddressWhitelist`, THEN the change MUST be rejected; proxying and SSRF filtering MUST stay separate.

WHEN a security incident is being diagnosed, IF disabling CSRF, exposing secrets, or loosening proxy/whitelist behavior is proposed as a convenience fix, THEN the change MUST be rejected.

WHEN a path or filename is validated, IF ad hoc traversal logic replaces `sanitize-filename`, `validateAvatarUrlMiddleware`, `getFileNameValidationFunction`, or `isPathUnderParent`, THEN the change MUST be rejected. WHEN secret data is read or written, IF code accesses `secrets.json` directly instead of `SecretManager` and exported secret helpers, THEN the change MUST be rejected.

WHEN a deployment emits listen, private-request-filter, untrusted-host, or similar runtime warnings while the service remains healthy, IF those warnings are used to disable CSRF, host checks, whitelist behavior, or SSRF protection, THEN the change MUST be rejected.
