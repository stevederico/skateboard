import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getState } from '@stevederico/skateboard-ui/Context';
import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import { showManage } from '@stevederico/skateboard-ui/Utilities';
import { Avatar, AvatarFallback } from '@stevederico/skateboard-ui/shadcn/ui/avatar';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from '@stevederico/skateboard-ui/shadcn/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@stevederico/skateboard-ui/shadcn/ui/alert-dialog';

/**
 * Settings page with account, billing, and support sections.
 *
 * Uses CardHeader + CardAction pattern for consistent layout.
 * Overrides the package-provided SettingsView via route precedence.
 *
 * @returns {JSX.Element} Settings page
 */
export default function SettingsView() {
  const { state, dispatch } = getState();
  const constants = state.constants;
  const navigate = useNavigate();
  const user = state.user;
  const subscription = user?.subscription;
  const showAuth = constants.noLogin !== true && user;
  const upgradeSheetRef = useRef();

  function signOutClicked() {
    dispatch({ type: 'CLEAR_USER', payload: null });
    navigate('/signin');
  }

  function getSubscriptionDescription() {
    const status = subscription?.status;
    if (!status) return 'Free plan';
    if (status === 'active') return `Renews ${new Date(subscription.expires * 1000).toLocaleDateString('en-US')}`;
    if (status === 'canceled') return `Ends ${new Date(subscription.expires * 1000).toLocaleDateString('en-US')}`;
    return `Plan ${status}`;
  }

  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 max-w-2xl w-full mx-auto">

          {/* Account */}
          {showAuth && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 capitalize">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-app text-white uppercase font-medium text-sm">
                      {user?.name ? user.name.split(' ').map(w => w[0]).join('').toUpperCase() : 'NA'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      {user?.name || 'No User'}
                      {subscription?.status === 'active' && <Badge variant="default">Pro</Badge>}
                    </div>
                    <CardDescription className="font-normal normal-case">{user?.email || 'no@user.com'}</CardDescription>
                  </div>
                </CardTitle>
                <CardAction className="self-center">
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Sign Out
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sign Out</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to sign out? You'll need to sign in again to access your account.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={signOutClicked}>Sign Out</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardAction>
              </CardHeader>
            </Card>
          )}

          {/* Billing */}
          {showAuth && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Billing
                  {subscription?.status === 'active' ? (
                    <Badge variant="default">Active</Badge>
                  ) : subscription?.status === 'canceled' ? (
                    <Badge variant="destructive">Canceled</Badge>
                  ) : (
                    <Badge variant="secondary">Free</Badge>
                  )}
                </CardTitle>
                <CardDescription>{getSubscriptionDescription()}</CardDescription>
                <CardAction className="self-center">
                  {subscription?.stripeID ? (
                    <Button variant="outline" size="sm" onClick={() => showManage(subscription.stripeID)}>
                      Manage
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" onClick={() => upgradeSheetRef.current?.show()}>
                      Subscribe
                    </Button>
                  )}
                </CardAction>
              </CardHeader>
            </Card>
          )}

          {/* Support */}
          <Card>
            <CardHeader>
              <CardTitle>Support</CardTitle>
              <CardDescription>Get help with your account.</CardDescription>
              <CardAction className="self-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { window.location.href = `mailto:${constants.companyEmail}`; }}
                >
                  Contact
                </Button>
              </CardAction>
            </CardHeader>
          </Card>

          {/* Footer */}
          <div className="mt-2 text-center">
            <p className="text-xs text-muted-foreground">v{constants.version || '0.0.0'}</p>
          </div>
        </div>
      </div>
      <UpgradeSheet ref={upgradeSheetRef} userEmail={user?.email || ''} />
    </>
  );
}
