## CHANGELOG

2.8.0

  Add rate limiting middleware
  Add account lockout
  Add auth test suite
  Add setAuthCookies helper
  Add db helper object
  Add JSON parse handling
  Add signup rollback
  Document password reset

2.7.0

  Update skateboard-ui 2.9.7
  Fix env variable consistency
  Add structured logging
  Add webhook idempotency

2.6.0

  Remove local SettingsView
  Use package SettingsView
  Update docs version refs

2.5.0

  Update skateboard-ui 2.9.3
  Update docs version refs
  Remove local file deps
  Add dark mode screenshot

2.4.0

  Update skateboard-ui 2.6.0
  Enable authOverlay default
  Remove Lifecycle page
  Add BlankView routes
  Add SettingsView sign-in card
  Fix BlankView title prop

2.3.0

  Update skateboard-ui 2.5.0
  Add ctaHeading constant
  Add sidebarCollapsed constant
  Add pricing.title constant
  Add pricing.extras constant
  Add navLinks constant
  Add footerLinks constant
  Add copyrightText constant
  Fix stripeProducts interval

2.2.2

  Update version 2.2.2
  Update skateboardVersion 2.2.2

1.8.1

  Add server.js JSDoc comments

1.8.0

  Add SettingsView component
  Add settings route
  Add next-themes dependency
  Remove rate limiting
  Disable authOverlay

1.7.0

  Update skateboard-ui 2.0.1
  Add flash prevention styles
  Update DropdownMenuTrigger render prop

1.6.1

  Narrow sidebar width
  Fix footer text truncation

1.6.0

  Add dashboard-01 UI
  Add DataTable component
  Add SectionCards component
  Add ChartAreaInteractive component
  Add dnd-kit drag reorder
  Add tanstack react-table
  Update HomeView composition
  Update AppSidebar layout
  Update Header quick create
  Update dark mode styles

1.5.3

  Add dashboard HomeView
  Add recharts dependency
  Update ChatView shadcn components
  Add Vite skateboard-ui exclude
  Add Tailwind source directive

1.5.2

  Update skateboard-ui 1.5.2

1.5.1

  Add authOverlay lazy auth
  Add requireAuth action gating
  Update skateboard-ui 1.5.1

1.5.0

  Update skateboard-ui 1.5.0
  Update version references

1.3.7

  Update skateboard-ui 1.3.7
  Add dark mode sidebar styles
  Add React dedupe aliases

1.2.7

  Auto-regenerate CSRF tokens
  Add CSRF diagnostic logging
  Normalize userID to string
  Update skateboard-ui 1.2.22

## [1.2.6] - 2026-01-22

### Changed
- Update skateboard-ui to 1.2.21 (CSRF fixes)

## [1.2.5] - 2026-01-22

### Fixed
- **CSRF Protection**: Fixed type mismatch where JWT userID (number/ObjectId) didn't match Map string keys, causing validation failures
- **CSRF Resilience**: Auto-regenerate CSRF tokens for authenticated users after server restart instead of returning 403
- **CSRF Logging**: Added diagnostic logging for CSRF validation failures to improve debugging

### Changed
- authMiddleware now normalizes userID to string for consistent Map key usage across middleware

1.2.5

  Update skateboard-ui 1.2.20

1.2.4

  Update skateboard-ui 1.2.19

1.2.3

  Add .dockerignore
  Update Dockerfile Node.js
  Remove backend Dockerfile

1.2.2

  Switch bcrypt to bcryptjs
  Add Node Dockerfile

1.2.1

  Add comprehensive JSDoc documentation
  Add documentation sync requirements

1.2.0

  Update skateboard-ui 1.2.18
  Update CLAUDE.md documentation

1.1.9

  Add 127.0.0.1 CORS origins

1.1.8

  Update Dockerfile Deno 2.6.3

1.1.7

  Add user rate limiter
  Add scaling documentation
  Update ARCHITECTURE.md

1.1.6

  Fix port variable scope
  Add webhook null checks
  Add webhook try-catch
  Fix usage race condition
  Add shutdown error handling
  Add rate limit /api/me
  Add LRU eviction stores
  Improve email validation
  Remove unused imports
  Fix message ID collisions
  Add loading state check
  Add JSON parse handling
  Remove config emoji

1.1.5

  Add .claude to gitignore
  Consolidate CLAUDE.md

1.1.4

  Update skateboardVersion field

1.1.3

  Fix usage tracking race condition
  Add atomic $inc operator
  Consolidate structured logging
  Update skateboard-ui 1.2.11

1.1.2

  Consolidate docs folder
  Merge deployment guides DEPLOY.md
  Merge migration guides MIGRATION.md
  Merge PRODUCTION.md ARCHITECTURE.md
  Update README doc links

1.1.1

  Update Dockerfile Deno
  Update README deno commands
  Update PRODUCTION.md env vars
  Add SCHEMA.md documentation
  Remove .dockerignore

1.1.0

  Replace Express with Hono
  Add monolithic architecture
  Add /api route prefix
  Add Dockerfile
  Add .dockerignore
  Add CORS middleware
  Simplify static serving
  Reduce memory footprint

1.0.13

  Update skateboard-ui to 1.2.10
  AppSidebar redesign (taller items, configurable header)
  Dark mode color improvements (sidebar/main contrast)
  System font stack

1.0.12

  Add STRIPE_ENDPOINT_SECRET validation
  Improve PostgreSQL SSL detection
  Add UI visibility control documentation
  Update skateboard-ui to 1.2.6

1.0.9

  Fix PostgreSQL usage tracking
  Add usage columns schema
  Add usage transformation findUser
  Fix async schema creation
  Fix column name consistency
  Add CSRF cookie clearing
  Use timing-safe CSRF comparison
  Add X-Forwarded-For rate limiting
  Add secure cookies production
  Change sameSite to strict
  Remove CSRF from response body
  Remove emails from logs
  Tighten CSP data URIs
  Add webhook payload limit
  Add payment rate limits
  Fix 404 to 401 signin
  Fix token expiry comment
  Add PostgreSQL SSL validation
  Add node prefix vite imports

1.0.8

  Remove duplicate initializeUtilities call (now automatic)
  Add Error Boundary component to skateboard-ui
  Call validateConstants on app initialization
  Update skateboard-ui peer dependencies (react ^19.1.0 → ^19.2.0)
  Update version references to 1.1.1

1.0.7

  Add initializeUtilities to main.jsx
  Fix utilities initialization for v1.1.1

1.0.6

  Update skateboard-ui to 1.1.1
  Update MIGRATION_GUIDE for v1.1.0
  Update ARCHITECTURE.md documentation

1.0.5

  Update skateboard-ui to 1.1.0
  Move Vite config to app
  Remove unused cookie package
  Fix CommonJS module bundling
  Add cookie to optimizeDeps
  Add set-cookie-parser prebundling

1.0.4

  Fix Vite configuration
  Add native module handler
  Remove deno dependencies
  Update TailwindCSS v4 support

1.0.3

  Fix cookie imports
  Add Vite optimizeDeps
  Replace lucide-react DynamicIcon
  Update migration guide
  Add deno.json config
  Pin cookie version

1.0.2

  Update skateboard-ui to 1.0.7
  Clean up migration documentation

1.0.1

  Update skateboard-ui to 1.0.4
  Remove initializeUtilities call
  Simplify vite.config.js

1.0.0

  Application Shell Architecture Release
  Add createSkateboardApp() function
  Add Context exports (ContextProvider, getState)
  Add App.jsx with complete routing shell
  Add getSkateboardViteConfig() utility
  Add base styles.css theme export
  Add apiRequest() and apiRequestWithParams() utilities
  Add useListData() hook for data fetching
  Add useForm() hook for form management
  Add individual Vite plugins exports
  Simplify main.jsx (82 lines → 16 lines)
  Simplify vite.config.js (227 lines → 3 lines)
  Simplify styles.css (182 lines → 7 lines)
  Remove need for local context.jsx
  95% boilerplate reduction per app
  Update skateboard boilerplate to demonstrate 1.0.0 patterns
  Add MIGRATION_GUIDE-1.0.0.md
  Add ARCHITECTURE.md documentation

0.9.4

  Remove tailwindcss-animate dependency
  Update styles configuration
  Add MIGRATION_GUIDE gitignore

0.9.3

  Add ProtectedRoute component
  Add useAppSetup hook
  Add isAuthenticated utility
  Add getCSRFToken utility
  Add getAppKey utility
  Add SignOutView component
  Update skateboard-ui 0.9.8

0.9.2

  Remove Vite proxy
  Fix direct backend requests
  Remove backend watch flag
  Update backend URLs

0.9.1

  Change unlimited to isSubscriber
  Add subscription data usage response
  Update trackUsage return full data
  Simplify component usage checks
  Update CLAUDE.md usage documentation
  Update README.md usage documentation
  Fix backend config structure

0.9.0

  Add backend usage tracking
  Add FREE_USAGE_LIMIT environment variable
  Add usage fields database schema
  Add POST /usage endpoint
  Update getRemainingUsage backend call
  Update trackUsage backend call
  Add 30-day usage reset

0.8.1

  Update getRemainingUsage localStorage check
  Update showUpgradeSheet localStorage check
  Remove isSubscriber API calls

0.8.0

  Remove hardcoded subscriber status
  Use state subscription data
  Update CLAUDE.md database config

0.7.9

  Remove currentUser cache
  Remove isSubscriber cache

0.7.8

  Update SignIn button styling
  Update SignUp button styling
  Add gradient button effects
  Add dark mode support
  Fix dark mode flash
  Add input autofocus
  Update input backgrounds
  Fix body background color

0.7.7

  Add package-lock.json gitignore

0.7.6

  Fix cookie authentication
  Add Vite proxy
  Update backend URLs

0.7.5

  Fix SQL injection vulnerability
  Fix CSRF middleware ordering
  Add CSRF token expiration
  Add XSS input sanitization
  Add rate limit cleanup
  Add signout endpoint
  Update dependencies

0.7.4

  Add comprehensive security logging
  Add timestamps to logs

0.7.3

  Add request size limits
  Fix user enumeration vulnerability

0.7.2

  Extend token expiration 30 days
  Improve JWT error handling
  Reduce bcrypt rounds performance

0.7.1

  Improve rate limiting configuration
  Add input validation middleware
  Enforce password length requirements
  Add email format validation

0.7.0

  Add HttpOnly cookie authentication
  Implement CSRF token protection
  Add SQL injection prevention
  Fix duplicate shutdown handlers
  Update dependencies latest versions
  Add localStorage app namespacing

0.6.5
  mongodb improvements

0.6.4

  Fix logging initialization

0.6.3

  Add rate limiting
  Implement security headers
  Add structured logging
  Remove JWT database config

0.6.2

  Simplify backend architecture
  Remove multi-client routing
  Add noLogin configuration

0.6.1

  Update chat navigation route

0.6.0

  Rename MessagesView ChatView
  Update showUpgradeSheet utility
  Fix upgrade sheet

0.5.9

  Add BlankView component

0.5.8

  Fix subscription status checks
  Update upgrade flow logic  
  Add product features display

0.5.7

  Add UpgradeSheet component
  Implement freemium usage tracking
  Add usage limit enforcement
  Create superscript price styling

0.5.6

  Add Node.js engine requirement

0.5.5

  Improve backend configuration
  Add database examples
  Update environment setup
  Clarify JWT setup

0.5.4

  Create deployment guides
  Add Vercel documentation
  Add Render guide
  Add Netlify guide
  Update README deployment

0.5.1

  Fix config parsing error
  Correct database structure
  Enable server startup

0.5.0

  Restructure config structure
  Separate clients databases
  Update server logic
  Fix CORS handling

0.4.1

  Update environment comments
  Fix database configuration
  Add PostgreSQL support
  Remove duplicate examples
  Update README features
  Restructure configuration sections
  Add database configuration

0.3.9

  Improve README spacing
  Remove unnecessary sections
  Fix header styling

0.3.8

  Rename database folder
  Update factory pattern
  Change to manager pattern

0.3.7

  Update documentation accuracy
  Fix security examples

0.3.6

  Add symlink configuration

0.3.5

  Add environment variable support
  Implement database configuration security
  Create multi-database documentation
  Add connection string validation
  Update configuration examples

0.3.4

  Lighten dark mode accent

0.3.3

  Fix settings header layout
  Remove unused header import
  Adjust accent color lightness

0.3.2

  Fix settings header border
  Improve accent color contrast
  Update sidebar accent colors

0.3.1

  Add advanced features section
  Improve landing page docs
  Highlight enterprise capabilities

0.3.0

  Update app color theme
  Add features content section
  Remove overflow hidden
  Add CTA button text

0.2.9

  Add PNG favicon
  Update tagline content
  Improve mobile messaging

0.2.8

  Update contact info
  Simplify support section

0.2.7

  Update README design
  Add engaging content
  Improve documentation

0.2.6

  Fix auth isolation
  Add app-specific cookies
  Update localStorage keys

0.2.5

  Fix Vite HMR config

0.2.4

  Fix React JSX runtime
  Add Vite alias config
  Update optimizeDeps settings

0.2.2
 updated skateboard-ui dep

0.2.1
 opengraph tags with build script
 WAL Mode
 
0.2.0
 apache logging format

0.1.9
 fixed skateboard-ui reference
 automatic backend server restart

0.1.8
 npm run start
 removed mongodb
 changed database to MyApp

0.1.7
 removed deno requirement
0.1.6
 added @stevederico/skateboard-ui from npm
0.1.5
 sqlite default

0.1.4
 added backend and server

0.1.3
 embedded lucide-react in skateboard-ui

0.1.2
 started using skateboard-ui 0.4.6, fixed the sourcemap issue for lucide-react

0.1.1
 removed dark mode for pages outside of /app

0.1.0
 moved hooks
 added Sheet component
 added token to all fetches
 isSubscriber util fix
 date/timestamp utils
 showCheckout and showManage utils
 analytics wrapper
 /isSubscriber endpoint and util
 cleaned up context and signin
 removed theme in app state
 TabBar UI Tweak
 fixed redirect on stripeView
 settings handle no user, redirect to sign in
 set title tag on document
 improved error handling on SignIn and SignUp
 removed strict mode
 check bearer token to requests
 get userDetails on re-launch
 getCurrentUser in Utilities
 only import constants
 display plan status

 0.0.8
 fixed dark ode colors
 reload on user details on successfull purchase
 Backend Support - webhooks - update database Save customerID to user for manage
 added customerID based stripe portal
 added email prefill to stripe checkout
 added checkoutView button
 added billing section in settings
 added stripe checkout integration
 changed starter components to skateboard components

 0.0.7
 removed localStorage isActive, fixed bug
 get user data on signup
 get current user data to state.user on sign IN
 added name to sign up
 added legal links to sign up
 landing page colors
 landing page logo

 0.0.6
 fixed header icon on collapse
 bigger icons on sidebar
 bigger head icon on sidebar
 moved darkMode toggle to top
 landing page
 settings improvemnts
 added basic headers to homeview and other
 fixed full page refresh
 added brand header to sidebar

 0.0.5
 added DynamicIcon from lucide-icons
 fixed icons in tabbar
 add isActive on sidebar click and settings
 sidebar read constants.json pages
 added cursor-pointer to collapse button
 added Shadcn/ui Sidebar
 added all shadcn/ui components, check out ShadExample.jsx
 added shadcn button

 0.0.4
 improved constants import
 Contact Support on Settings
 Cleaned up spacing in SettingsView and ensured uniform heights for flex-column divs
 Header on Main and Other
 Logo on SignIn and Sign Up
 LandingView
 NotFound Improvements
 added SignUp Add error handling
 added privacy policy, eula, terms, and subscriptions 
 TextView working
 version on SettingsView
 image on sidebar

 0.0.3 
 added lib folder to components
 added sign in and sign up to starter-backend
 centered settings view
 mobile support
 sign out user clean up
 error handlign context
 simplied layout
 manual dark mode

 0.0.2
 improved reducer
 default version
 default appName
 layout improvmenets
 sidebar width
 version display settings
 user persistence
 darkmode toggle
 fixed tabbar links
 improved export default
 added basic pages to sidebar
 added auto dark mode
 added settingsView

 0.0.1 
 added package version
 added constants setup with localhost override
 added basic cookie sign in and sign out
 added misc routes
 added console routes
 changed console to app
 added getState function
 added basic layout
 added basic constants.json
 added ContextProvider
 added --color-primary to styles.css
 added bootstrap-icons
 setup components and a
 add react-router-dom
 package scripts
 icons
 index.html 
 managed devDependices 
 drop logs from prod
 switch to plugin-react-swc
 added tailwindcss
 removed eslint



## To-Do
- move init theme from settingsview to main 
- PRD 
- system prompts
- iOS Support
    - Delete Account
    - Trigger IAP
    - Swift Wrapper
    - Guest Mode
    - Restore Purchases
    - Rate Us
    - Native Share Sheet 
    - Push Notifications 
    - Subscription URL
    - Event Listener
    - Native Loading Indicator
    - Subscriptions Legal Notice
- Sheet Component
- Chat Component
- Recommendations Component
- CRUD SDK
- /premiumContent
- credits-system -checkViews , viewRemain