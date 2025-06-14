## To-Do
- remove deno requirement
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


0.1.6
* added @stevederico/skateboard-ui from npm
0.1.5
* sqlite default

0.1.4
* added backend and server

0.1.3
* embedded lucide-react in skateboard-ui

0.1.2
* started using skateboard-ui 0.4.6, fixed the sourcemap issue for lucide-react

0.1.1
* removed dark mode for pages outside of /app

0.1.0
* moved hooks
* added Sheet component
* added token to all fetches
* isSubscriber util fix
* date/timestamp utils
* showCheckout and showManage utils
* analytics wrapper
* /isSubscriber endpoint and util
* cleaned up context and signin
* removed theme in app state
* TabBar UI Tweak
* fixed redirect on stripeView
* settings handle no user, redirect to sign in
* set title tag on document
* improved error handling on SignIn and SignUp
* removed strict mode
* check bearer token to requests
* get userDetails on re-launch
* getCurrentUser in Utilities
* only import constants
* display plan status

### 0.0.8
* fixed dark ode colors
* reload on user details on successfull purchase
* Backend Support - webhooks - update database Save customerID to user for manage
* added customerID based stripe portal
* added email prefill to stripe checkout
* added checkoutView button
* added billing section in settings
* added stripe checkout integration
* changed starter components to skateboard components

### 0.0.7
* removed localStorage isActive, fixed bug
* get user data on signup
* get current user data to state.user on sign IN
* added name to sign up
* added legal links to sign up
* landing page colors
* landing page logo

### 0.0.6
* fixed header icon on collapse
* bigger icons on sidebar
* bigger head icon on sidebar
* moved darkMode toggle to top
* landing page
* settings improvemnts
* added basic headers to homeview and other
* fixed full page refresh
* added brand header to sidebar

### 0.0.5
* added DynamicIcon from lucide-icons
* fixed icons in tabbar
* add isActive on sidebar click and settings
* sidebar read constants.json pages
* added cursor-pointer to collapse button
* added Shadcn/ui Sidebar
* added all shadcn/ui components, check out ShadExample.jsx
* added shadcn button

### 0.0.4
* improved constants import
* Contact Support on Settings
* Cleaned up spacing in SettingsView and ensured uniform heights for flex-column divs
* Header on Main and Other
* Logo on SignIn and Sign Up
* LandingView
* NotFound Improvements
* added SignUp Add error handling
* added privacy policy, eula, terms, and subscriptions 
* TextView working
* version on SettingsView
* image on sidebar

### 0.0.3 
* added lib folder to components
* added sign in and sign up to starter-backend
* centered settings view
* mobile support
* sign out user clean up
* error handlign context
* simplied layout
* manual dark mode

### 0.0.2
* improved reducer
* default version
* default appName
* layout improvmenets
* sidebar width
* version display settings
* user persistence
* darkmode toggle
* fixed tabbar links
* improved export default
* added basic pages to sidebar
* added auto dark mode
* added settingsView

### 0.0.1 
* added package version
* added constants setup with localhost override
* added basic cookie sign in and sign out
* added misc routes
* added console routes
* changed console to app
* added getState function
* added basic layout
* added basic constants.json
* added ContextProvider
* added --color-primary to styles.css
* added bootstrap-icons
* setup components and a
* add react-router-dom
* package scripts
* icons
* index.html 
* managed devDependices 
* drop logs from prod
* switch to plugin-react-swc
* added tailwindcss
* removed eslint

