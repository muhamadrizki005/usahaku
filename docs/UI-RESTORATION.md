# UI baseline restored

User instruction, 21 October 2026: retain the user's design and reverse visual changes made independently by the agent.

Reference: `C:\Projek Software\usahaku-design-system.zip`. The original `usahaku-saa-s-prototype.zip` is an older, different export and is not the visual reference for this project.

Explicit user clarification: retain each page's original palette, including dashboard teal `#0f766e` and login/onboarding blue `#1835d9`. The revised handoff at `usahaku-v0/docs/HANDOFF-USAHAKU-DESIGN-SYSTEM.md` revokes the older palette direction. Do not normalize all pages to either color.

Later explicit typography request (21 October 2026): the user prefers their onboarding screenshot typography and requested fixing Inter loading. The unloaded Inter declaration was verified to render Times New Roman. Inter is now self-hosted and applied, with original size/weight/line-height/tracking retained after measurement. This authorized correction supersedes treating the ZIP's missing-font state as a visual baseline. See `docs/TYPOGRAPHY-ONBOARDING.md` and `artifacts/typography/comparison.html`. Palettes, component layouts, and backend were not changed for this correction.

Restored views from the reference, with their original layout/classes:

- Owner login and signup, including the original split layout, forms, footer, and Google buttons.
- Category selection and identity form, including the logo preview and description draft controls.
- Setup checklist, original modals, and business summary; these are pages again rather than unconditional redirects.
- Main dashboard, sidebar, cards, chart area, and account menu. The extra top account bar and replacement foundation dashboard were removed.
- Email verification page. New recovery/account screens reuse that existing page frame. Staff management uses the existing setup modal instead of the independently designed staff page.

Backend adapters intentionally remain: authenticated user/business props, server actions, forced password change, role/tenant guards, real staff operations, and real logout. Demo authentication bypasses from the ZIP were not restored. Unsupported categories remain disabled because the agreed competition scope is store/warung.

Identity image/description remain browser draft previews as in the original prototype; they are not represented as uploaded database profile fields. Draft keys are scoped to the verified user/business. Products, hours, and payment preview controls from the original setup remain prototype UI; no operational product/inventory/POS backend was added.

Preserved user-requested changes: landing width 1800px, sticky navigation, scroll fade, and functional Google OAuth initiation. No initial database migration or data reset was performed; demo users are not used as test accounts.

Future changes must follow root `AGENTS.md`: connect functionality to this design without independently changing its appearance.

Follow-up corrections: restored the ZIP typography tokens, removed broad form/link CSS overrides, shared the exact original login frame between owner and staff, and restored the setup staff modal's description, owner/member rows, plus button, and initially collapsed blue form. Username, temporary-password feedback, reset, deactivation, and real account data are necessary additions for the authorized account functionality.

Visual verification used a temporary local copy of the ZIP at the same 1440×1000 viewport. Empty login/signup, category, identity, setup, summary, dashboard, and staff modal were captured side by side in `artifacts/ui-reference/`. Sampled computed styles (colors, typography, padding, borders) matched. The reference copy has no connection to the live database; its unused Google-font initialization and middleware were disabled only in that temporary copy. Data-dependent text, available categories, staff actions, and successful-auth feedback intentionally differ from the prototype. This is not a claim that every interactive state is pixel-identical.

To repeat the comparison, serve a separate ZIP reference on localhost, set `UI_REFERENCE_URL` to that origin, and run `npm.cmd run test:e2e` against the production test server on port 3100. Without that variable, the existing account suite runs normally. Never point the reference origin at a production website or supply it real credentials.

Verification after restoration: production build and six local tests passed. Browser E2E passed on the final build, covering the original onboarding flow, owner login/logout, admin/cashier creation and forced password changes, resets, deactivation/reactivation, server action tampering, hosted tenant isolation, and recovery using Admin API generated links. Temporary accounts were removed and demo data remained identical. Google initiation reached Google's sign-in page with PKCE; completing a Google account login was not automated. Public registration/recovery email delivery remains unverified because Supabase returned its email send rate limit. Screenshots of the restored login, onboarding, dashboard, and staff modal are in `artifacts/qa-*.png`.
