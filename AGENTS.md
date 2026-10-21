# Usahaku — preserve the user's UI

- The user owns the visual design. Use `C:\Projek Software\usahaku-design-system.zip` as the original UI reference; `components/original/` contains adapted views from it.
- The user supplied the official Usahaku logo on 21 October 2026. Use `public/brand/usahaku-logo.png` (unaltered source PNG) in place of the ZIP's temporary brand marks and favicon. Preserve its original colors and transparency; it does not authorize recoloring page palettes.
- Preserve the ZIP's palette separately for each page. Dashboard teal (`#0f766e`) and login/onboarding blue (`#1835d9`) both belong to the ZIP. Do not unify them. The user revoked palette instructions from the old handoff; the revised handoff confirms this ZIP takes precedence.
- Do not independently redesign layouts, palettes, spacing, typography, copy, cards, navigation, or forms when connecting the backend. Change visual design only when the user explicitly requests it.
- On 21 October 2026 the user explicitly requested typography matching their onboarding screenshots. Inter must actually load from `public/fonts/inter/InterVariable.woff2`; keep the local @font-face and preload. The ZIP's unloaded Inter declaration was rendering Times New Roman and must not be restored as a visual baseline. Existing typography sizes/weights/line heights/tracking were retained after measurement; before/after evidence is in `artifacts/typography/`.
- Preserve the changes explicitly requested by the user: landing width 1800px, sticky navbar, scroll fade, and Google sign-in. Do not roll these back as part of restoring the ZIP design.
- Bind verified server data/actions to the original views. Never restore the ZIP's demo login bypasses, client-controlled authorization, fake staff creation, or cross-account unscoped browser data.
- Pages that did not exist in the ZIP must reuse its existing page/form/modal components and visual treatment, rather than introduce another design.
- Owner and staff login share `components/original/login-frame.tsx`. Account/recovery screens use the ZIP verification frame; staff controls use its setup modal and blue form treatment. Do not add global CSS overrides that recolor unrelated pages.
- Operational products, inventory, and POS backend development remain out of scope until requested. Restoring their existing prototype views does not make them operational features.
- Keep Supabase demo accounts/data unchanged. Tests use new accounts and clean up only IDs created by that run.
