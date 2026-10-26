# Production provider verification

The application adapters are complete, but a provider is production-ready only after its live probe and browser journey have passed with production-equivalent credentials.

## Controlled automated probes

Set the normal production variables from `.env.example`, then add:

```env
PROVIDER_TEST_EMAIL_TO=operations-test@example.com
PROVIDER_TEST_CLOUDFRONT_OBJECT_KEY=provider-verification/known-clean-object.txt
# Optional staging-only malware probe; point to a locally supplied EICAR file.
PROVIDER_TEST_GUARDDUTY_EICAR_FILE=C:\path\to\eicar.com.txt
```

Run configuration-only validation first:

```powershell
npm run verify:providers
```

Run network probes in an approved staging or production-equivalent environment:

```powershell
npm run verify:providers -- --live
```

Live mode verifies the configured email adapter, S3 put/head/get/delete, a signed CloudFront GET when enabled, enabled OAuth authorization endpoints, and an error-monitoring event. It also waits for an exact-version `NO_THREATS_FOUND` object tag when GuardDuty is configured, or performs a clean INSTREAM probe when ClamAV is configured. The script exits non-zero when a configured probe fails.

The S3 and GuardDuty probes clean up their own objects. The quarantine bucket must have versioning and GuardDuty-managed object tagging enabled. Leave `PROVIDER_TEST_GUARDDUTY_EICAR_FILE` unset in production; use it only for an explicitly controlled staging test. The email and error-monitoring probes intentionally create marked external records. Use a dedicated recipient and confirm the event in the monitoring provider.

## Manual sign-off

Automated endpoint reachability does not complete OAuth verification. For Google and LinkedIn, use the deployed frontend to complete consent, callback, session creation, state validation and account-linking behavior with each approved redirect URI.

For email, confirm delivery, sender authentication, link origins and bounce handling. For files, upload through the deployed browser, wait for malware scanning, verify authorized signed download, verify expiry, and confirm an unrelated user is denied. Record the provider, environment, timestamp, operator and evidence in the release record.
