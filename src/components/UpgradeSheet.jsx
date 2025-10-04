import { useState, useImperativeHandle, forwardRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@stevederico/skateboard-ui/shadcn/ui/sheet"
import { Button } from "@stevederico/skateboard-ui/shadcn/ui/button"
import { Card } from "@stevederico/skateboard-ui/shadcn/ui/card"
import constants from "../constants.json";
import { showCheckout } from '@stevederico/skateboard-ui/Utilities';
import { Sparkles, Check, CheckSquare, MessageSquare, Zap, Headphones, X } from 'lucide-react';

const UpgradeSheet = forwardRef(function UpgradeSheet(props, ref) {
  const { userEmail = "" } = props;
  const [isOpen, setIsOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    show: () => setIsOpen(true),
    hide: () => setIsOpen(false),
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev)
  }));

  const handleUpgrade = () => {
    setIsOpen(false);
    showCheckout(userEmail);
  };

  const product = constants.stripeProducts?.[0] || {
    price: "$5.00",
    title: "Monthly Plan",
    interval: "monthly",
    features: [
      "Unlimited todos",
      "Unlimited messages",
      "All premium features"
    ]
  };

  const roundedPrice = product.price.replace(/\.\d+/, '').replace('$', '');

  const featureIcons = {
    "Unlimited Todos": CheckSquare,
    "Unlimited Messages": MessageSquare,
    "All Premium Features": Zap,
    "Priority Customer Support": Headphones,
    "Cancel Anytime": X,
  };

  const getFeatureIcon = (feature) => {
    const Icon = featureIcons[feature] || Check;
    return Icon;
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full p-0" side="bottom">
        <div className="flex flex-col max-h-[85vh]">

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pt-8 pb-4">
            <div className="max-w-sm mx-auto">

              {/* Price */}
              <div className="text-center mb-6">
                <div className="flex items-start justify-center gap-1 mb-3">
                  <span className="text-3xl text-muted-foreground font-medium mt-2">$</span>
                  <span className="text-7xl font-bold tracking-tight">{roundedPrice}</span>
                </div>
                <p className="text-sm text-muted-foreground">per month, billed monthly</p>
              </div>

              {/* Badge */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary">
                  <Sparkles size={14} />
                  <span className="text-xs font-medium">Unlock All Features</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2 mb-8">
                {product.features?.map((feature, index) => {
                  const Icon = getFeatureIcon(feature);
                  return (
                    <div key={index} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
                      <Icon size={16} strokeWidth={2.5} className="text-primary shrink-0" />
                      <span className="text-sm font-medium">{feature}</span>
                    </div>
                  );
                })}
              </div>

              {/* CTA Button */}
              <button
                onClick={handleUpgrade}
                className="relative group w-full text-white px-6 py-3 rounded-2xl font-semibold text-base transition-all duration-300 shadow-xl backdrop-blur-sm overflow-hidden cursor-pointer"
                style={{
                  backgroundImage: `linear-gradient(to bottom right,
                    var(--color-app),
                    oklch(from var(--color-app) calc(l - 0.05) c h),
                    oklch(from var(--color-app) calc(l - 0.08) c h),
                    oklch(from var(--color-app) calc(l - 0.12) c h))`,
                  boxShadow: `0 25px 50px -12px var(--shadow-color)`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundImage = `linear-gradient(to bottom right,
                    oklch(from var(--color-app) calc(l - 0.05) c h),
                    oklch(from var(--color-app) calc(l - 0.08) c h),
                    oklch(from var(--color-app) calc(l - 0.12) c h),
                    oklch(from var(--color-app) calc(l - 0.16) c h))`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundImage = `linear-gradient(to bottom right,
                    var(--color-app),
                    oklch(from var(--color-app) calc(l - 0.05) c h),
                    oklch(from var(--color-app) calc(l - 0.08) c h),
                    oklch(from var(--color-app) calc(l - 0.12) c h))`;
                }}
              >
                <span className="relative z-20 flex items-center justify-center gap-2 drop-shadow-sm">
                  <Sparkles size={18} className="animate-pulse" />
                  Upgrade to {product.title}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-800 skew-x-12"></div>
              </button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                Cancel anytime. No questions asked.
              </p>

            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
});

export default UpgradeSheet;
