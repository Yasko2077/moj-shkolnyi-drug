# Deploy the private Ынтымак tester preview

This repository is intentionally private. The preview must remain a non-indexed test environment; it is not the production launch.

## Render Static Site

1. An adult project owner signs in to Render and connects the GitHub account that can read the private repository.
2. Create a Static Site from `Yasko2077/moj-shkolnyi-drug`.
3. Select branch `test/yntymak-supabase-audit`.
4. Use the repository's `render.yaml` Blueprint, or enter:
   - Build Command: `node scripts/build-static.mjs`
   - Publish Directory: `dist`
5. Confirm the preview URL and verify that it shows the Ынтымак tester landing page. Keep automatic deploys gated by successful checks.
6. Keep the site non-indexed. Do not attach a custom public school domain yet.

The build uses an explicit allow-list. Only the browser app shell and public browser configuration are copied into `dist/`. SQL migrations, internal audit documents, admin provisioning templates and repository runbooks are excluded.

## Before external school testers are invited

- Keep Supabase cloud feature flags off until the matching migrations have been applied to a separate Supabase staging project and the RLS tests have passed there.
- An adult owner must configure Auth email confirmation, the exact Render preview URL in Site URL / Redirect URLs, and custom SMTP. Supabase's built-in mailer is not suitable for sending account confirmation and password recovery to an unrestricted set of external school addresses.
- CAPTCHA must be integrated and verified before opening self-service sign-up broadly. Do not disable email confirmation as a workaround.
- Use synthetic data only. Do not enter real student details or sensitive safeguarding reports.
- Nesterov and other administrators are invited to create ordinary tester accounts first. The adult owner then grants separate, time-limited `verification_representative` assignments in Supabase SQL Editor using `supabase/admin/assign_privileged_accounts.sql.template`. Never put their real UUIDs or emails in Git.

## Current limitations

A successful static deployment publishes the website shell, not a production backend. Cloud initiatives, projects, events, news, polls, elections and hosted AI remain disabled until staging migration and integration checks have been completed. This preview must not be treated as an approved citywide student service.
