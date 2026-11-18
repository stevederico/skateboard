user_email="verify-$(date +%s)@example.com"
user_name="Verify User"
user_password="verify-pass-1"
home_title="$(const '.pages[0].title')"
tagline="$(lit "$(const .tagline)")"

h1() { see "heading \"$(lit "$1")\" \\[[^]]*level=1"; }

landing() {
  go / &&
    see "heading \"$tagline\" \\[[^]]*level=1" &&
    see "link \"$(lit "$(const .appName)")\"" &&
    see "heading \"$(lit "$(const .features.title)")\"" &&
    see "heading \"$(lit "$(const .pricing.title)")\"" &&
    js_true "document.querySelector('footer a[href=\"/terms\"]') !== null" "the footer has no link to /terms"
}

guest_settings() {
  click button "$(const .cta)" &&
    at_url '/app/home$' &&
    h1 "$home_title" &&
    click button Settings &&
    see 'Sign in to access your account settings\.'
}

sign_up() {
  go /signup &&
    see 'dialog "Sign Up"' &&
    fill_in Name "$user_name" &&
    fill_in Email "$user_email" &&
    fill_in Password "$user_password" &&
    click button "Sign Up" &&
    gone 'dialog "Sign Up"' &&
    expect_eq "$(api GET /api/me)" 200 "the backend session after sign up" &&
    expect_eq "$(api_body | jq -r .email)" "$user_email" "the signed-up email" &&
    expect_eq "$(api_body | jq -r .name)" "$user_name" "the signed-up name"
}

dashboard() {
  h1 "$home_title" && see 'Total Revenue' || return 1
  local title
  while IFS= read -r title; do
    see "button \"$(lit "$title")\"" || return 1
  done < <(const '.pages[].title'; printf 'Settings\n')
}

analytics() {
  click button Analytics &&
    at_url '/app/analytics$' &&
    h1 Analytics &&
    see 'Analytics will appear here once you have activity\.'
}

command_menu() {
  press Control+k &&
    see combobox &&
    js_true "(() => { const id = document.querySelector('dialog:has([role=combobox]), [role=dialog]:has([role=combobox])')?.getAttribute('aria-labelledby'); return !!id && document.getElementById(id)?.textContent === 'Command Menu'; })()" "the open dialog is not labelled Command Menu" &&
    click option Projects &&
    at_url '/app/projects$' &&
    h1 Projects
}

settings() {
  click button Settings &&
    at_url '/app/settings$' &&
    h1 Settings &&
    see "$(lit "$user_email")" &&
    see "\"$(lit "$user_name")\"" &&
    see 'Free plan' &&
    see '"v[0-9]+\.[0-9]+\.[0-9]+"'
}

sign_out() {
  click button "Sign Out" &&
    see 'Are you sure you want to sign out\?' &&
    click button "Sign Out" &&
    at_url ":$PORT/\$" &&
    see "heading \"$tagline\"" &&
    expect_eq "$(api GET /api/me)" 401 "the backend session after sign out"
}

sign_in() {
  go /signin &&
    see 'dialog "Sign In"' &&
    fill_in Email "$user_email" &&
    fill_in Password wrong-password &&
    click button "Sign In" &&
    see '- alert' &&
    fill_in Password "$user_password" &&
    click button "Sign In" &&
    gone 'dialog "Sign In"' &&
    click button Settings &&
    see "$(lit "$user_email")"
}

terms() {
  go /terms &&
    see "Welcome to the $(lit "$(const .companyName)") Application\." &&
    not_see '_COMPANY_|_WEBSITE_|_EMAIL_'
}

verify_flows() {
  flow "landing page shows the product, features, pricing and legal links" landing
  flow "the call to action opens the app for a guest, and settings asks them to sign in" guest_settings
  flow "sign up creates an account and a backend session" sign_up
  flow "the app shows the dashboard and every sidebar page" dashboard
  flow "the sidebar opens a page with an empty state" analytics
  flow "Ctrl+K opens the command menu, and it navigates" command_menu
  flow "settings shows the account, plan and version" settings
  flow "sign out asks first, then ends the session" sign_out
  flow "sign in rejects a wrong password, then signs in" sign_in
  flow "the terms page fills in the company name" terms
}
