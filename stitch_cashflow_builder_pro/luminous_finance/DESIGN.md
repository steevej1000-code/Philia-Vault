---
name: Luminous Finance
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#9d4300'
  on-secondary: '#ffffff'
  secondary-container: '#fd761a'
  on-secondary-container: '#5c2400'
  tertiary: '#6d3bd7'
  on-tertiary: '#ffffff'
  tertiary-container: '#b090ff'
  on-tertiary-container: '#4600a7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb690'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#783200'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#23005c'
  on-tertiary-fixed-variant: '#5516be'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 16px
  card-gap: 20px
---

## Brand & Style
The design system is engineered to transform the often-anxious experience of financial management into a moment of clarity and optimism. The brand personality is "Sophisticated Growth"—combining the precision of a wealth management tool with the approachability of a lifestyle app.

The aesthetic leans heavily into **Modern Glassmorphism** with a focus on tactile depth. By utilizing frosted glass effects and soft, multi-layered shadows, the UI creates a sense of spatial hierarchy where financial data floats over a luminous, airy background. The goal is to evoke an emotional response of "controlled abundance," where assets feel vibrant and liabilities feel manageable rather than alarming.

## Colors
The palette is divided into functional emotional zones. 

- **Assets & Growth:** A vibrant "Emerald-to-Cyan" gradient represents accumulation. Use the Primary Emerald for positive balances and the Mint/Cyan accents for secondary indicators.
- **Liabilities & Flow:** Expenses are rendered in "Coral-to-Raspberry" tones. These are intentionally warm and "non-anxious" to encourage engagement rather than avoidance.
- **Premium Intelligence:** The Electric Purple and Gold accents are reserved strictly for AI-driven insights, wealth-building milestones, and premium-tier features.
- **Surfaces:** The background uses a very light blue tint (`#F8FAFC`) to reduce glare and provide a crisp contrast for the white frosted glass cards.

## Typography
The typography system pairs **Montserrat** for high-impact headlines with **Plus Jakarta Sans** for interface elements and body text. Montserrat’s geometric, rounded nature provides a "premium-tech" feel for large numbers and section headers. Plus Jakarta Sans is used for its exceptional legibility and friendly, open counters, which keep data-heavy screens feeling light.

For financial figures, use a medium or semi-bold weight to ensure "at-a-glance" readability. Label styles should always be in uppercase with slight letter spacing to differentiate metadata from primary content.

## Layout & Spacing
The design system utilizes a **Fluid Grid** with a soft 8px spacing logic. 

- **Containers:** Content is housed in "Glass Containers" that follow a 12-column grid on desktop and a single column on mobile. 
- **Margins:** Mobile views require a 24px safe-area margin to ensure the soft shadows of glass cards are not clipped by the screen edge.
- **Rhythm:** Vertical rhythm is strictly enforced in 8px increments. Use 24px spacing between distinct content modules and 12px between items within a module (e.g., list items).

## Elevation & Depth
This design system employs a **Layered Glassmorphism** approach:

1.  **Level 0 (Base):** The off-white/blue-tinted background.
2.  **Level 1 (Cards):** Pure white surfaces with 60% opacity and a 20px background blur. These feature a subtle 1px inner border (white, 40% opacity) to simulate a glass edge.
3.  **Level 2 (Active/Premium):** Enhanced with "Ambient Shadows"—diffused, large-radius shadows (Blur: 30px, Y: 10px) tinted with the primary emerald or secondary coral color at 10% opacity.
4.  **Level 3 (Modals):** Full-screen blurs with high-contrast surfaces to focus the user on critical financial actions.

## Shapes
A **Rounded** shape language is used to maintain the "friendly/premium" balance. 

- **Standard Elements:** Buttons and input fields use a 0.5rem (8px) radius.
- **Information Containers:** Cards and large modules use `rounded-lg` (16px) to emphasize the soft, approachable nature of the data.
- **Interactive Pill-styles:** Small tags, chips, and the primary "Add Transaction" buttons use a full pill-shape (circular ends) to denote high interactivity.

## Components
- **Glass Cards:** The signature component. Always include a subtle linear gradient border and a backdrop filter. Use for balance overviews and investment summaries.
- **Vibrant Buttons:** Primary buttons use a 3-stop linear gradient (Cyan -> Mint -> Emerald). They should have a "glow" shadow matching the gradient's mid-tone.
- **Non-Anxious Inputs:** Expense fields should use the soft Peach tint for focus states rather than harsh reds, paired with clear, rounded iconography.
- **Data Visuals:** Charts should use thick, rounded line caps (Stroke: 4px+). Use area gradients for charts—Emerald for growth, Coral for spending—with a 20% opacity fill to maintain the glass aesthetic.
- **AI Insights:** Specialized "Magic" cards featuring a subtle Electric Purple border-glow and Gold iconography to highlight automated wealth-building tips.