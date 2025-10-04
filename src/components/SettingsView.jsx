import { useNavigate } from 'react-router-dom';
import { getState } from '../context.jsx';
import { User, Mail, CreditCard, LogOut, Moon, Sun, Palette, Bell, Shield, Info } from 'lucide-react';
import ThemeToggle from '@stevederico/skateboard-ui/ThemeToggle';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Avatar, AvatarFallback } from '@stevederico/skateboard-ui/shadcn/ui/avatar';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';
import constants from "../constants.json";
import pkg from '../../package.json';
import { showCheckout } from '@stevederico/skateboard-ui/Utilities';

export default function SettingsView() {
  const navigate = useNavigate();
  const { state, dispatch } = getState();

  function signOutClicked() {
    dispatch({ type: 'CLEAR_USER', payload: null });
    navigate('/signin');
  }

  const getInitials = () => {
    if (state.user?.name) {
      return state.user.name.split(' ').map(word => word[0]).join('').toUpperCase();
    }
    return state.user?.email?.substring(0, 2).toUpperCase() || 'NA';
  };

  const getBillingStatus = () => {
    if (state.user?.subStatus === null || typeof state.user?.subStatus === 'undefined') {
      return { text: "Free Plan", variant: "secondary" };
    }
    if (state.user?.subStatus === "active") {
      return { text: "Active", variant: "default" };
    }
    if (state.user?.subStatus === "canceled") {
      return { text: "Canceled", variant: "destructive" };
    }
    return { text: state.user?.subStatus, variant: "secondary" };
  };

  const billingStatus = getBillingStatus();

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

        {/* Account Card */}
        {(constants.noLogin == false || typeof constants.noLogin === 'undefined') && (
          <div className="px-4 lg:px-6">
            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Manage your account settings and preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-base font-medium">{state.user?.name || "No Name"}</p>
                    <p className="text-sm text-muted-foreground">{state.user?.email || "no@user.com"}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={signOutClicked}
                    className="cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Settings Grid */}
        <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2">

          {/* Billing Card */}
          {(constants.noLogin == false || typeof constants.noLogin === 'undefined') && (
            <Card className="@container/card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Billing
                    </CardTitle>
                    <CardDescription className="mt-1.5">
                      {state.user?.subStatus === null || typeof state.user?.subStatus === 'undefined'
                        ? "Manage your subscription"
                        : ["active", "canceled"].includes(state.user?.subStatus)
                          ? `${state.user?.subStatus === "active" ? "Renews" : "Ends"} ${new Date(state.user.expires * 1000).toLocaleDateString('en-US')}`
                          : "Manage your subscription"
                      }
                    </CardDescription>
                  </div>
                  <Badge variant={billingStatus.variant}>
                    {billingStatus.text}
                  </Badge>
                </div>
              </CardHeader>
              <CardFooter>
                {state.user?.stripeID ? (
                  <Button
                    variant="outline"
                    className="cursor-pointer w-full"
                    onClick={() => { window.open(`https://billing.stripe.com/p/login/${state.user?.stripeID}`, '_blank'); }}
                  >
                    Manage Subscription
                  </Button>
                ) : (
                  <Button
                    className="cursor-pointer w-full"
                    onClick={() => { showCheckout(state.user?.email) }}
                  >
                    Subscribe Now
                  </Button>
                )}
              </CardFooter>
            </Card>
          )}

          {/* Support Card */}
          <Card className="@container/card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Support
              </CardTitle>
              <CardDescription>Get help from our support team</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                variant="outline"
                className="cursor-pointer w-full"
                onClick={() => { window.location.href = `mailto:${constants.companyEmail}`; }}
              >
                Contact Support
              </Button>
            </CardFooter>
          </Card>

          {/* Appearance Card */}
          <Card className="@container/card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Appearance
              </CardTitle>
              <CardDescription>Customize the look and feel</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">Switch between light and dark mode</p>
                </div>
                <ThemeToggle />
              </div>
            </CardContent>
          </Card>

          {/* About Card */}
          <Card className="@container/card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                About
              </CardTitle>
              <CardDescription>Application information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium">{pkg.version}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">App Name</span>
                  <span className="font-medium">{constants.appName}</span>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
