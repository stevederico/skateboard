import { useNavigate } from 'react-router';
import { getState } from '@stevederico/skateboard-ui/Context';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import ThemeToggle from '@stevederico/skateboard-ui/ThemeToggle';
import { Check, ArrowRight } from '@stevederico/skateboard-ui/icons';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';

const PRIVACY_LINK = { label: 'Privacy', href: '/privacy' };
const TERMS_LINK = { label: 'Terms', href: '/terms' };
const EULA_LINK = { label: 'EULA', href: '/eula' };

/**
 * Cleaner take on the default LandingView. Same shadcn primitives and
 * semantic tokens — just with a quieter hero, icon-leading feature cards,
 * and tighter spacing. Drop-in replacement passed via createSkateboardApp's
 * landingPage prop. Reads all copy from constants (appName, tagline,
 * navLinks, features, stripeProducts, pricing, ctaHeading, footerLinks,
 * companyName, copyrightText, cta).
 *
 * @returns {JSX.Element}
 */
export default function LandingSpecSheet() {
  const { state } = getState();
  const constants = state.constants || {};
  const navigate = useNavigate();
  const goApp = () => navigate('/app');

  const navLinks = constants.navLinks || [
    { label: 'Features', href: '#features' },
    ...(constants.stripeProducts?.length > 0 ? [{ label: 'Pricing', href: '#pricing' }] : []),
  ];
  const footerLinks = constants.footerLinks || [
    ...(constants.privacyPolicy ? [PRIVACY_LINK] : []),
    ...(constants.termsOfService ? [TERMS_LINK] : []),
    ...(constants.EULA ? [EULA_LINK] : []),
  ];
  const items = constants.features?.items || [];
  const sp = (constants.stripeProducts || [])[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <span className="size-8 rounded-md bg-app/15 text-app flex items-center justify-center">
              <DynamicIcon name={constants.appIcon} size={18} strokeWidth={2.25} />
            </span>
            <span className="text-base font-semibold tracking-tight">{constants.appName}</span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            {navLinks.map((l, i) => (
              <a key={i} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle variant="landing" iconSize={14} />
            <Button size="sm" onClick={goApp}>{constants.cta}</Button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative border-b border-border">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-app/5 via-background to-background" />
          <div className="max-w-3xl mx-auto px-6 py-24 md:py-36 text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] text-balance mb-12">
              {constants.tagline}
            </h1>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={goApp} className="gap-2 h-14 px-10 text-base font-medium">
                {constants.cta} <ArrowRight size={18} />
              </Button>
              {navLinks[0] && (
                <Button variant="outline" asChild className="h-14 px-8 text-base font-medium">
                  <a href={navLinks[0].href}>Learn more</a>
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Features */}
        {items.length > 0 && (
          <section id="features" className="border-b border-border bg-muted/30">
            <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
              <div className="text-center mb-14">
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
                  {constants.features?.title || 'Features'}
                </h2>
              </div>
              <div className={`grid gap-6 ${items.length >= 3 ? 'md:grid-cols-3' : items.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1 max-w-md mx-auto'}`}>
                {items.map((it, i) => (
                  <Card key={i} className="border-border/60 transition-colors hover:border-border">
                    <CardHeader>
                      <span className="size-10 rounded-md bg-app/10 text-app flex items-center justify-center mb-3">
                        <DynamicIcon name={it.icon} size={20} strokeWidth={2} />
                      </span>
                      <CardTitle className="text-lg">{it.title}</CardTitle>
                      <CardDescription className="leading-relaxed">{it.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Pricing */}
        {sp && (
          <section id="pricing" className="border-b border-border">
            <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
              <div className="text-center mb-14">
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
                  {constants.pricing?.title || 'Pricing'}
                </h2>
              </div>
              <Card className="max-w-md mx-auto border-app/30 shadow-sm">
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-base font-medium text-muted-foreground">{sp.title}</CardTitle>
                  <div className="flex items-baseline justify-center gap-1.5 mt-2">
                    <span className="text-5xl font-semibold tracking-tight text-foreground">{sp.price}</span>
                    <span className="text-sm text-muted-foreground">/ {sp.interval}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {(sp.features || []).map((f, i) => (
                      <li key={`sp-${i}`} className="flex items-start gap-2.5">
                        <Check size={16} className="text-app shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                    {(constants.pricing?.extras || []).map((f, i) => (
                      <li key={`x-${i}`} className="flex items-start gap-2.5">
                        <Check size={16} className="text-app shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button size="lg" className="w-full" onClick={goApp}>{constants.cta}</Button>
                </CardFooter>
              </Card>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
            <Card className="bg-foreground text-background border-0 py-16 md:py-20">
              <CardContent className="text-center">
                <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-balance mb-8 max-w-2xl mx-auto">
                  {constants.ctaHeading || 'Ready to Build?'}
                </h2>
                <Button size="lg" variant="secondary" onClick={goApp} className="gap-1.5">
                  {constants.cta} <ArrowRight size={16} />
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-background">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="size-7 rounded-md bg-app/15 text-app flex items-center justify-center">
                <DynamicIcon name={constants.appIcon} size={16} strokeWidth={2.25} />
              </span>
              <span className="text-sm font-semibold tracking-tight">{constants.appName}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              {footerLinks.map((l, i) => (
                <a key={i} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
              ))}
            </div>
          </div>
          <Separator className="my-6" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {constants.companyName}. {constants.copyrightText || 'All rights reserved.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
