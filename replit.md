# Deriv Bot

## Overview

Deriv Bot is a web-based automated trading platform that allows users to create trading bots without coding. The application uses a visual block-based programming interface (powered by Blockly) to let users design trading strategies. Users can build bots from scratch, use quick strategies, or import existing bot configurations. The platform supports both demo and real trading accounts through the Deriv trading API.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Framework
- **React 18** with TypeScript as the primary UI framework
- **MobX** for state management across the application
- Stores are organized in `src/stores/` with a root store pattern that aggregates domain-specific stores (client, dashboard, chart, run-panel, etc.)

### Build System
- **Rsbuild** as the primary build tool (modern, fast bundler)
- Webpack configuration available as fallback
- Babel for transpilation with support for decorators and class properties

### Visual Programming
- **Blockly** library for the drag-and-drop bot building interface
- Custom blocks and toolbox configurations for trading-specific operations
- Workspace serialization for saving/loading bot strategies

### Trading Integration
- **@deriv/deriv-api** for WebSocket-based communication with Deriv trading servers
- Real-time market data streaming and order execution
- Support for multiple account types (demo, real, wallet-based)

### Authentication
- OAuth2-based authentication flow with OIDC support
- Token Management Backend (TMB) integration for enhanced session handling
- Multi-account support with account switching capabilities

### Charting
- **@deriv/deriv-charts** for displaying market data and trade visualizations
- Real-time chart updates during bot execution

### PWA Support
- Service worker for offline capabilities
- Installable as a Progressive Web App on mobile devices
- Offline fallback page

### Internationalization
- **@deriv-com/translations** for multi-language support
- CDN-based translation loading with Crowdin integration

### Analytics & Monitoring
- **RudderStack** for event tracking and analytics
- **Datadog** for session replay and performance monitoring
- **TrackJS** for error tracking in production

## External Dependencies

### Deriv Ecosystem Packages
- `@deriv-com/auth-client` - Authentication client
- `@deriv-com/analytics` - Analytics integration
- `@deriv-com/quill-ui` / `@deriv-com/quill-ui-next` - UI component library
- `@deriv-com/translations` - Internationalization
- `@deriv/deriv-api` - Trading API client
- `@deriv/deriv-charts` - Charting library

### Cloud Services
- **Cloudflare Pages** - Deployment platform
- **Google Drive API** - Bot strategy storage and sync
- **LiveChat** - Customer support integration
- **Intercom** - In-app messaging (feature-flagged)
- **GrowthBook** - Feature flag management
- **Survicate** - User surveys

### Third-Party Libraries
- `blockly` - Visual programming blocks
- `mobx` / `mobx-react-lite` - State management
- `react-router-dom` - Client-side routing
- `formik` - Form handling
- `@tanstack/react-query` - Server state management
- `js-cookie` - Cookie management
- `localforage` - Client-side storage
- `lz-string` / `pako` - Compression utilities

## Recent Changes

### SaintDBot Theme Overhaul (March 2026)
- Full platform rebranded from Deriv red (#ff444f) to **deep navy + gold** color scheme
- Color psychology: navy = trust/authority, gold = wealth/premium (Goldman Sachs, Bloomberg palette)
- `src/styles/saintdbot-theme.scss` — new comprehensive theme layer overriding all Deriv defaults
  - CSS token overrides: `--brand-red-coral`, `--brand-orange`, all button/border/fill variables → gold
  - Dark theme backgrounds: `#070d1a` (body) → `#0a1628` (sections) → `#0d1e36` (cards)
  - Header: deep navy + 2px gold bottom border + gold hover states
  - Primary buttons: gold gradient with navy text + glow shadow
  - Custom gold scrollbars, gold tab indicators, gold selection highlight
- `index.html` splash screen fully updated to gold:
  - Constellation particles & connections → gold
  - SAINTDBOT title gradient → white-to-gold
  - Corner brackets, progress bar, badge text → gold
  - PWA theme-color → `#f0b429`

### Free Bots Feature (December 2025)
- Added Free Bots page with 12 pre-built trading bot templates
- Bot cards display with category filtering (Speed Trading, AI Trading, Pattern Analysis, etc.)
- Click-to-load functionality that imports bot XML into Bot Builder
- Responsive card design with hover effects and loading states
- Bot XML files stored in `/private-bots/` directory (not web-accessible)
- Gated server-side endpoint `/api/bot/:filename` validates Deriv token via WS authorize, checks loginid against `config/allowed-accounts.json` allowlist, then streams the XML. Token sent as `Authorization: Bearer` header. Implemented in `scripts/bot-api.cjs`, wired into `scripts/serve.js` (production) and `rsbuild.config.ts` `setupMiddlewares` (dev).
- Files: `src/pages/free-bots/index.tsx`, `src/pages/free-bots/free-bots.scss`

### Wealth Switcher Bot (May 2026)
- Rebuilt `Saint_WealthSwitcher_2026.xml` (430 lines, 1079 blocks) from 6 exported SVG block files
- Architecture: 6 top-level blocks — trade_definition, before_purchase, after_purchase, 2× tick_analysis, procedures_defnoreturn
- Market: Volatility 10 (1s) Index · Trade type: Digits Over/Under (Both) · Duration: Ticks
- Dual-signal system: S1 uses 1st Over Digit (P1=2), S2 uses 2nd Over Digit (P2=4)
- Tick analysis 1: sorts last N digits, builds Digit 0–9 sub-lists, calculates Over N% / Under N% for all 9 threshold pairs
- Tick analysis 2: notifies blue (current digit stats) + green notifications per prediction digit showing Over/Under percentages
- Before purchase: S1 fires Over purchase when Over N% ≥ threshold (90→10 for digits 0–8); fires Under when Under N% ≥ threshold (9→1); S2 fires Over only
- After purchase: martingale on Total Lost; S1↔S2 state flip on loss/win; stop loss + target profit checks; trade_again
- Starts function: initialises 14 variables from 8 parameters (1st Over Digit, 2nd Over Digit, Amount, Profit, Ticks to analyze, Mart Splits, % Win Per Stake, Martingale Level)
- Default params: Stake $1, Profit $20, Ticks=15, Mart Splits=80, ReturnPct=1, MartLevel=1
- Added to bot menu in `src/constants/pages/free-bots/index.tsx` (id: 'saint-wealth-switcher', ownerOnly: true)