## CHANGELOG

0.5.2

  Fixed config on server

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