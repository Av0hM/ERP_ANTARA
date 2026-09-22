# Antara website theme and migration guide

**Source:** Project Antara website, repository `ANTARA-web-wizard-erp-main`  
**Snapshot date:** 20 September 2026  
**Purpose:** Transfer the visual system and interaction conventions into another project without copying the whole application.

## 1. Design direction

The site combines an immersive spacecraft journey with a restrained technical archive. The homepage uses a scroll-controlled space video, large mission statements, and a fixed instrument-like navigation bar. The rest of the site alternates graphite sections with warm paper-colored panels. Thin engineering grids, saffron accents, steel borders, and tightly set headings establish the identity.

Use real mission imagery as the focal point. Keep ornamental effects subtle. Content sections should read like an engineering journal: short eyebrows, clear headings, concise descriptions, and purposeful actions. Preserve generous space around content and use a consistent light/dark surface hierarchy.

This is **not a single unmodified token theme**. `src/index.css` contains an older space/purple token system; later rules in `src/App.css` supply much of the visible graphite/beige treatment. Copying only `:root` from `index.css` will not reproduce the current website.

## 2. Files included in this handoff

| File | Purpose |
| --- | --- |
| `THEME-HANDOFF.md` | This design and implementation reference |
| `theme.css` | Framework-independent, scoped starter stylesheet derived from the current design |
| `preview.html` | Standalone visual reference using the starter stylesheet |
| `source-tokens.css` | Exact root-token blocks extracted from the source, including older values |

The ZIP distribution also includes the existing badge, favicon, and social-preview card under `assets/`. The large journey video is intentionally referenced rather than duplicated; copy it separately only if required.

`theme.css` is a consolidated starting point, not a pixel-identical copy of every page. Its `.antara-theme` wrapper prevents global styles from leaking into the destination app. The `.at-*` class names are new handoff names; they are not the original production component names.

## 3. Color system

### Visible graphite and paper palette

| Role | Value | Application |
| --- | --- | --- |
| Graphite | `#0f1115` | Dark section foundations |
| Space panel | `#151921` | Upper stop of dark section gradients |
| Paper | `#e7dfd1` | Light section foundation |
| Paper highlight | `#ece4d7` | Upper stop of light section gradients |
| Card paper | `#eee6d8` → `#e5dccd` | Gallery, content, admin cards |
| Warm accent card | `#e8d9c2` → `#e2d1b8` | Emphasized content panels |
| Saffron | `#c9782b` | Eyebrows, subtle borders, mission progress |
| Steel | `#7d868c` | Grid and divider base |
| Ice | `#8fa9b5` | Secondary accents, outlines, navigation |
| Light heading | `#f2eee5` | Dark hero headings |
| Light body | `#f3efe7`, `#d8d3ca` | Dark archive text and supporting content |
| Dark heading | `#131821`, `#141a22`, `#171d25` | Light-section headings |
| Admin ink | `#172334` | Form content, admin status, labels |
| Secondary ink | `#3f444b` | Light-section descriptions |
| Light form field | `#fffdf9` | Admin input background |
| Light focus ring | `#286da0` | Keyboard focus on paper sections |
| Dark focus ring | `#7cc5ff` | Keyboard focus in album viewer |
| Destructive action | `#9c2020` on `#fff4f3` | Delete buttons |

### Older/global token palette still present

All five `--space-*` values (`990`, `950`, `900`, `850`, `800`) currently equal `#272757`. Both `--nebula-violet` and `--nebula-cyan` equal `#1E90FF`. `--cloud-white`, `--text-primary`, `--text-secondary`, and `--text-muted` all equal `#F0F4FF`. Those names do not describe distinct shades in the current source. Other global accents include amber `#f5a64a`, teal `#38bfb3`, rust `#b56538`, and deep ink `#040913`.

Retain these values only when reproducing those underlying surfaces. For a clean migration, use the role-based palette in `theme.css`. Always set text color explicitly on light surfaces; inheriting the global light text was a source of contrast problems in the admin UI.

## 4. Typography

Fonts are loaded from Google Fonts in `src/index.css`:

- **Sora:** weights 500, 600, 700. Hero and section headings; important card titles.
- **IBM Plex Sans:** weights 400, 500, 600. Body text, labels, eyebrows, controls.
- **Inter:** weights 400, 500, 600, 700. Fallback/supporting family.
- System fallback: `Segoe UI`, then `sans-serif`.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap">
```

For a deployment without Google Fonts access, self-host the appropriate licensed font files and replace this link with `@font-face`. Keep the fallback stack so the interface remains readable during loading.

| Token | Source value |
| --- | --- |
| Hero | `clamp(3.2rem, 8.8vw, 7.6rem)` |
| Display | `clamp(2.1rem, 5vw, 4.4rem)` |
| H2 | `clamp(1.55rem, 3.2vw, 2.8rem)` |
| H3 | `clamp(1.2rem, 2.2vw, 1.8rem)` |
| Large body | `clamp(1.02rem, 1.4vw, 1.16rem)` |
| Body | `1rem` |
| Caption | `0.78rem` |
| Admin hero override | `clamp(2rem, 4vw, 3.25rem)` |

Body line height is `1.7`. Base heading line height is `1.08`; the analog-theme headings use `1.02`, weight `700`, and letter spacing `-0.02em`. Eyebrows use weight `500`, uppercase, and letter spacing `0.14em`. Brand lettering uses approximately `0.18em` tracking. Avoid tight heading line heights for long body copy.

## 5. Spacing, sizing, and layout

The global spacing scale is `0.4, 0.7, 1, 1.3, 1.7, 2.2, 3, 4rem` (`--space-1` through `--space-8`). Use it consistently rather than inventing new gaps for every component.

- General container: `min(1140px, calc(100vw - 2rem))`.
- Main admin grids/toolbars: maximum `72rem`.
- General section vertical padding: `clamp(3.5rem, 8vw, 6rem)`.
- Frequent horizontal page padding: `clamp(1.25rem, 5vw, 4rem)`.
- Content grid gaps: `clamp(1.1rem, 2vw, 2rem)`.
- Gallery: three columns at desktop, one column at 900px and below.
- Admin: two columns at desktop (editor and list), one at 900px and below.
- Engineering texture: two 1px linear gradients, `44px × 44px` grid, with steel at 10–12% opacity. Mask it at the top and bottom and make the overlay non-interactive.

### Shape and elevation

Global rounded tokens are `0.6rem`, `0.95rem`, `1.25rem`, `1.6rem`, and `999px`. However, current editorial cards override those tokens to **`0.2rem`** corners. Controls and menus are moderately rounded; action buttons are often pills. Do not turn every card into a large rounded glass panel when reproducing the current look.

Cards use a 1px steel border at roughly 32–40% opacity and `0 10px 24px rgba(10,12,16,.18)` shadow. Hover can lift a card by 2px and use `0 14px 28px rgba(10,12,16,.24)`. Admin panels do not lift on hover.

## 6. Component catalogue

### Fixed navigation / HUD

The final production header is a full-width fixed transparent-to-graphite bar, not the earlier floating pill variant. Desktop minimum height is `5.3rem`, z-index `20`, backdrop blur `10px`. It contains the menu control, centered brand, and a thin progress meter. The meter blends saffron, warm tan, and ice.

The secondary floating navigation sits around `top: 5.6rem`, uses a `0.6rem` radius, and becomes horizontally scrollable on small screens. The side menu is a small graphite panel with thin ice borders and nested links. Keep content below the fixed header and avoid covering focused controls.

### Mission hero and scroll video

`VideoScrubber.tsx` positions a muted, inline video behind mission text and maps section scroll progress to video time using GSAP ScrollTrigger. There is no separate opening poster in the current homepage invocation. Keep media and text separate so the story remains readable. Do not autoplay audible content.

Video implementation is optional when transferring the theme. It requires the actual MP4, scroll controller, and section geometry; CSS alone will not reproduce it. Mobile uses native touch momentum. Reduced-motion users do not receive smooth-scroll/video scrubbing.

### Content and archive cards

Use a small uppercase eyebrow, prominent heading, concise supporting text, and a clearly labeled action. Paper cards sit within paper sections; dark archive cards sit within graphite sections. Use saffron or ice as a fine edge/detail rather than a large saturated fill.

### Gallery albums

Public album cards contain a thumbnail, title, summary, media count, and open action. Covers load lazily. Opening an album fetches its item metadata; the viewer mounts only the selected full image/video. Videos use `controls`, `playsInline`, and `preload="none"`. Numbered navigation avoids preloading every full image.

The native dialog is `min(1100px, 94vw)`, at most `92dvh`, dark `#0b111c`, with a 12px radius and a black 85% backdrop. The media stage is at most `58dvh`/620px and uses `object-fit: contain`. Escape closes it and focus returns to the album card. Preserve this accessibility and loading behavior when porting.

### Admin workspace

Use a compact dark page hero followed by paper sections. Forms need persistent visible labels, 44px minimum controls, light input surfaces, strong text contrast, blue keyboard focus, and clear disabled states. Place errors/status near the action as well as in a visible page status region.

Draft defaults, explicit publish/delete confirmation, stale-write protection, upload progress, and unsaved-edit recovery are application workflows, not CSS features. Port their behavior separately. A destructive action should use red text/border on a pale red surface and name the content being removed.

### Buttons and links

Primary buttons use a dark navy gradient, light text, a thin saffron outline, and often a pill radius. Secondary actions may use paper-colored fills and steel outlines. Hover/focus treatments must remain legible on both surface types. Do not communicate status through color alone.

## 7. Motion and responsive behavior

| Interaction | Current implementation |
| --- | --- |
| General easing token | `cubic-bezier(0.22, 0.8, 0.3, 1)` |
| Card hover | 180ms transform/border, 220ms shadow |
| Navigation visibility | 220ms transform and opacity |
| Homepage content reveal | opacity + 34px vertical travel, 0.88s, `power2.out` |
| Standard page hero reveal | 34px travel, 0.95s |
| Standard content reveal | 22px travel, 0.74s; stagger capped at 0.2s |
| CTA pulse | 0 to -2px, 2300ms, `inOutSine`, alternating |
| Smooth wheel scroll | Lenis `lerp: 0.1`, wheel multiplier 1 |
| Mobile scroll | Native momentum (`syncTouch: false`) |

Admin pages skip decorative page-reveal animations. Respect `prefers-reduced-motion` for all optional motion. Do not hide essential content until an animation library succeeds.

Breakpoints in the source are **900px** for major grid stacking, **720px** for mobile typography/navigation, and **700px** for additional admin/dialog adjustments. At 720px the final header height is `4.8rem`, floating nav moves to about `5rem`, and menus use narrower gutters. Test 390px, 720px, 900px, and a desktop width rather than relying on device names.

## 8. Assets and dependencies

| Source | Use |
| --- | --- |
| `src/assets/ANTARA_logo_badge-modified.png` | Mission badge/logo |
| `public/favicon.png` | Browser icon |
| `public/social-preview.png` | 1200 × 630 shared-link card |
| `scripts/create-social-preview.mjs` | Rebuild the share card from typography and existing logo |
| `src/assets/journey.mp4` | Scroll-driven mission video (roughly 22.7 MB in the build) |
| `public/journey-poster.webp` | Legacy poster asset; not currently passed to the homepage video |
| `src/Scene.tsx` | Existing 3D implementation reference; not the planned interactive satellite explorer |
| `src/components/Gallery.tsx`, `AlbumDialog.tsx` | Album loading and accessible viewer |
| `src/components/AdminAlbumMedia.tsx` | Media upload/editor workflows |
| `shared/page-meta.json` | Page titles/descriptions, separate from visual styling |

Current stack: React 19, TypeScript, Vite, custom CSS; GSAP/ScrollTrigger, Lenis, and animejs for motion; Three.js/React Three Fiber/Drei for 3D where used. The portable CSS requires none of these libraries. Do not install animation or 3D dependencies unless the destination actually uses those features.

Assets and Antara branding should only be copied if the destination is entitled to use them. The future clickable CubeSat/debrief page is not part of the implemented theme.

## 9. Migration steps

1. Copy this folder into the destination repository. Link `theme.css` and load the fonts.
2. Wrap the relevant layout in `.antara-theme`; use `.at-dark` and `.at-paper` to make surface/text pairing explicit.
3. Start with container, section, heading, card, button, and field primitives. `preview.html` shows the intended pairing.
4. Map destination components to these primitives. Replace branding, copy, and images deliberately.
5. Port navigation behavior, focus management, and responsive rules. Fixed headers require scroll offsets and sufficient top padding.
6. Add optional motion after the static layout works. Keep reduced-motion fallbacks.
7. Add gallery/media APIs only if needed. Preserve lazy media loading and HTTPS-safe URLs.
8. Test keyboard navigation, long headings, error messages, loading/empty states, 200% zoom, narrow screens, and light/dark contrast.
9. Compare with the live Antara pages or source screenshots. Resolve intentional differences rather than importing all legacy overrides.

### Minimal integration

```html
<link rel="stylesheet" href="theme.css">
<div class="antara-theme">
  <section class="at-section at-dark at-grid-texture">
    <div class="at-container">
      <p class="at-eyebrow">Mission control</p>
      <h1>Engineering with a purpose.</h1>
    </div>
  </section>
  <section class="at-section at-paper">
    <div class="at-container at-grid">
      <article class="at-card">
        <p class="at-eyebrow">Subsystem</p>
        <h2>Payload development</h2>
        <p>Short, specific project context.</p>
        <a class="at-button" href="/payload">Explore the work</a>
      </article>
    </div>
  </section>
</div>
```

## 10. Source-of-truth and known traps

- `App.css` contains multiple redesign layers and repeated selectors. Later/specific selectors change earlier appearances. The header's final overrides and the admin-specific selectors matter.
- `index.css` supplies global tokens and fonts, but its palette does not describe every visible surface. See `source-tokens.css` for exact raw values.
- The current `--text-muted` is the same color as primary text. Do not assume it provides a contrast hierarchy.
- Global `color-scheme: dark` is present in the source. The portable stylesheet explicitly sets light scheme on paper sections to avoid mismatched native controls.
- Keep the source CSS files and import order if reproducing the existing application exactly. For another project, prefer the consolidated scoped primitives and validate their appearance.
- Network/API/storage configuration is not a theme dependency. Never copy `.env`, secrets, database credentials, or admin tokens into the destination theme package.
