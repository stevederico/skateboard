/**
 * Ambient module declarations for @stevederico/skateboard-ui.
 *
 * The package ships untyped .jsx sources, so these declarations describe the
 * subset of its API this app actually uses. Shapes are derived from the
 * package sources in node_modules/@stevederico/skateboard-ui (v3.9.0).
 */

declare module '@stevederico/skateboard-ui/Context' {
  import type { Dispatch } from 'react';

  /** Signed-in user persisted to localStorage by the shell (null when signed out). */
  export interface SkateboardUser {
    email?: string;
    name?: string;
    subscription?: {
      status?: string;
      expires?: number | null;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  /** Sidebar/command-menu page entry from constants.json. */
  export interface SkateboardPage {
    title: string;
    url: string;
    icon: string;
  }

  /** App configuration loaded from src/constants.json (extra keys allowed). */
  export interface SkateboardConstants {
    appName: string;
    pages?: SkateboardPage[];
    noLogin?: boolean;
    authOverlay?: boolean;
    [key: string]: unknown;
  }

  /** Global state held by the shell's ContextProvider. */
  export interface SkateboardState {
    user: SkateboardUser | null;
    ui: { sidebarVisible: boolean; tabBarVisible: boolean };
    authOverlay: {
      visible: boolean;
      pendingCallbacks: Array<(outcome?: 'success' | 'cancel') => void>;
    };
    constants: SkateboardConstants;
  }

  /** Actions accepted by the shell's reducer. */
  export type SkateboardAction =
    | { type: 'SET_USER'; payload: SkateboardUser }
    | { type: 'CLEAR_USER' }
    | { type: 'SET_SIDEBAR_VISIBLE'; payload: boolean }
    | { type: 'SET_TABBAR_VISIBLE'; payload: boolean }
    | { type: 'SET_UI_VISIBILITY'; payload: { sidebarVisible?: boolean; tabBarVisible?: boolean } }
    | { type: 'SHOW_AUTH_OVERLAY'; payload?: (outcome?: 'success' | 'cancel') => void }
    | { type: 'HIDE_AUTH_OVERLAY' }
    | { type: 'AUTH_OVERLAY_SUCCESS' };

  export type SkateboardDispatch = Dispatch<SkateboardAction>;

  /** Hook returning the shell's `{ state, dispatch }` pair. */
  export function getState(): { state: SkateboardState; dispatch: SkateboardDispatch };

  /** Hook returning only the current user (avoids unrelated re-renders). */
  export function useUser(): SkateboardUser | null;

  /** Hook returning the stable dispatch function. */
  export function useDispatch(): SkateboardDispatch;
}

declare module '@stevederico/skateboard-ui/App' {
  import type { ComponentType, ReactElement, ReactNode } from 'react';
  import type { SkateboardConstants } from '@stevederico/skateboard-ui/Context';

  /** One route rendered under /app by the shell router. */
  export interface AppRoute {
    path: string;
    element: ReactElement;
  }

  /** Configuration accepted by createSkateboardApp. */
  export interface SkateboardAppConfig {
    constants: SkateboardConstants;
    appRoutes: AppRoute[];
    defaultRoute?: string;
    landingPage?: ReactElement;
    wrapper?: ComponentType<{ children?: ReactNode }>;
    overrides?: {
      layout?: ComponentType;
      settings?: ComponentType;
      payment?: ComponentType;
      signIn?: ComponentType;
      signUp?: ComponentType;
      signOut?: ComponentType;
      notFound?: ComponentType;
    };
  }

  /**
   * Bootstrap and render a skateboard-ui application.
   *
   * Sets up routing, authentication, layout, theming, and toast notifications.
   * Mounts the app to the #root DOM element.
   */
  export function createSkateboardApp(config: SkateboardAppConfig): void;
}

declare module '@stevederico/skateboard-ui/Layout' {
  import type { ReactElement, ReactNode } from 'react';

  /** Page layout wrapper with sidebar (desktop) and tab bar (mobile). */
  export default function Layout(props: { children?: ReactNode }): ReactElement;
}

declare module '@stevederico/skateboard-ui/Header' {
  import type { ComponentPropsWithoutRef, MouseEventHandler, ReactElement } from 'react';

  export interface HeaderProps extends Omit<ComponentPropsWithoutRef<'header'>, 'title'> {
    /** Header title text */
    title: string;
    /** Action button label (omit to hide button) */
    buttonTitle?: string;
    /** Button click handler */
    onButtonTitleClick?: MouseEventHandler<HTMLButtonElement>;
    /** Additional CSS classes for the button */
    buttonClass?: string;
  }

  /** App header bar with page title and optional right-side action button. */
  export default function Header(props: HeaderProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/UpgradeSheet' {
  import type { ReactElement, Ref } from 'react';

  /** Imperative API exposed through the UpgradeSheet ref. */
  export interface UpgradeSheetHandle {
    show(): void;
    hide(): void;
    open(): void;
    close(): void;
    toggle(): void;
  }

  export interface UpgradeSheetProps {
    /** User email forwarded to Stripe checkout */
    userEmail?: string;
    ref?: Ref<UpgradeSheetHandle>;
  }

  /** Premium upgrade drawer with pricing and checkout button, controlled via ref. */
  export default function UpgradeSheet(props: UpgradeSheetProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/DynamicIcon' {
  import type { ReactElement } from 'react';

  export interface DynamicIconProps {
    /** Icon name (e.g. "home", "arrow-up", "LayoutDashboard") */
    name: string;
    /** Icon size in pixels (default 24) */
    size?: number;
    /** Icon stroke color (default 'currentColor') */
    color?: string;
    /** Stroke width (default 2) */
    strokeWidth?: number;
    className?: string;
  }

  /** Render a vendored Lucide icon by name string, or null if not found. */
  export default function DynamicIcon(props: DynamicIconProps): ReactElement | null;
}

declare module '@stevederico/skateboard-ui/Utilities' {
  import type { RefObject } from 'react';
  import type { UpgradeSheetHandle } from '@stevederico/skateboard-ui/UpgradeSheet';

  /** Usage counters returned by the /usage endpoint (-1 values for noLogin apps). */
  export interface UsageInfo {
    remaining: number;
    total?: number;
    isSubscriber: boolean;
  }

  /** Check remaining free-tier usage for an action. */
  export function getRemainingUsage(action: string): Promise<UsageInfo>;

  /** Track (decrement) usage for an action and return the updated counters. */
  export function trackUsage(action: string): Promise<UsageInfo>;

  /** Show the upgrade drawer unless the stored user is already a subscriber. */
  export function showUpgradeSheet(
    upgradeSheetRef: RefObject<UpgradeSheetHandle | null>
  ): Promise<void>;

  /** Fetch options for apiRequest plus a timeout in milliseconds (default 30000). */
  export interface ApiRequestOptions extends RequestInit {
    timeout?: number;
  }

  /**
   * Unified API request utility.
   * Handles credentials, CSRF tokens, 401 redirects, and a 30-second timeout.
   * Resolves with the parsed JSON response.
   */
  export function apiRequest(endpoint: string, options?: ApiRequestOptions): Promise<unknown>;

  /** State returned by useListData. */
  export interface ListDataResult<T> {
    data: T[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
  }

  /** Standard list data fetcher with optional sorting. */
  export function useListData<T = unknown>(
    endpoint: string,
    sortFn?: ((a: T, b: T) => number) | null
  ): ListDataResult<T>;
}

declare module '@stevederico/skateboard-ui/icons' {
  import type { ComponentType, SVGProps } from 'react';

  /** Props accepted by every vendored Lucide icon. */
  export interface IconProps extends SVGProps<SVGSVGElement> {
    /** Width/height in pixels (default 24) */
    size?: number | string;
  }

  export type Icon = ComponentType<IconProps>;

  export const LayoutDashboard: Icon;
  export const Plus: Icon;
  export const TrendingDown: Icon;
  export const TrendingUp: Icon;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/button' {
  import type { ComponentPropsWithoutRef, ReactElement } from 'react';

  export type ButtonVariant =
    | 'default'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'destructive'
    | 'link'
    | 'gradient';

  export type ButtonSize =
    | 'default'
    | 'xs'
    | 'sm'
    | 'lg'
    | 'icon'
    | 'icon-xs'
    | 'icon-sm'
    | 'icon-lg'
    | 'cta';

  export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Render the single child element styled as a button (shadcn-style) */
    asChild?: boolean;
  }

  /** Primary button component with variant and size support. */
  export function Button(props: ButtonProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/badge' {
  import type { ComponentPropsWithoutRef, ReactElement } from 'react';

  export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

  export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
    variant?: BadgeVariant;
  }

  export function Badge(props: BadgeProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/card' {
  import type { ComponentPropsWithoutRef, ReactElement } from 'react';

  type DivProps = ComponentPropsWithoutRef<'div'>;

  export interface CardProps extends DivProps {
    size?: 'default' | 'sm';
  }

  export function Card(props: CardProps): ReactElement;
  export function CardHeader(props: DivProps): ReactElement;
  export function CardTitle(props: DivProps): ReactElement;
  export function CardDescription(props: DivProps): ReactElement;
  export function CardAction(props: DivProps): ReactElement;
  export function CardContent(props: DivProps): ReactElement;
  export function CardFooter(props: DivProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/calendar' {
  import type { ReactElement } from 'react';

  /** Selected value for mode="range" — mirrors react-day-picker's DateRange shape. */
  export interface DateRange {
    from: Date | undefined;
    to?: Date | undefined;
  }

  /** Matchers accepted by the disabled prop. */
  export type CalendarDisabled =
    | Date
    | Date[]
    | ((date: Date) => boolean)
    | { from?: Date; to?: Date; before?: Date; after?: Date };

  interface CalendarBaseProps {
    className?: string;
    classNames?: Record<string, string>;
    showOutsideDays?: boolean;
    captionLayout?: 'label' | 'dropdown';
    disabled?: CalendarDisabled;
    showWeekNumber?: boolean;
  }

  export type CalendarProps =
    | (CalendarBaseProps & {
        mode?: 'single';
        selected?: Date;
        /** Called with undefined when the selected day is clicked again */
        onSelect?: (date: Date | undefined) => void;
      })
    | (CalendarBaseProps & {
        mode: 'range';
        selected?: DateRange;
        onSelect?: (range: DateRange) => void;
      });

  export function Calendar(props: CalendarProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/dialog' {
  import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

  type DivProps = ComponentPropsWithoutRef<'div'>;

  export interface DialogProps {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: ReactNode;
  }
  export function Dialog(props: DialogProps): ReactElement;

  export interface DialogContentProps extends DivProps {
    /** Pass false to hide the corner close button (default true) */
    showCloseButton?: boolean;
  }
  export function DialogContent(props: DialogContentProps): ReactElement;

  export function DialogHeader(props: DivProps): ReactElement;
  export function DialogFooter(props: DivProps): ReactElement;
  export function DialogTitle(props: DivProps): ReactElement;
  export function DialogDescription(props: DivProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/command' {
  import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';
  import type { DialogProps } from '@stevederico/skateboard-ui/shadcn/ui/dialog';

  type DivProps = ComponentPropsWithoutRef<'div'>;

  export function Command(props: DivProps): ReactElement;

  export interface CommandDialogProps extends DialogProps {
    title?: string;
    description?: string;
    className?: string;
    showCloseButton?: boolean;
  }
  export function CommandDialog(props: CommandDialogProps): ReactElement;

  export interface CommandInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'value'> {
    value?: string;
    onValueChange?: (value: string) => void;
  }
  export function CommandInput(props: CommandInputProps): ReactElement;

  export function CommandList(props: DivProps): ReactElement;
  export function CommandEmpty(props: DivProps): ReactElement;

  export interface CommandGroupProps extends DivProps {
    heading?: ReactNode;
  }
  export function CommandGroup(props: CommandGroupProps): ReactElement;

  export interface CommandItemProps extends Omit<DivProps, 'onSelect'> {
    /** Filter/selection value — falls back to string children when omitted */
    value?: string;
    /** Called with the resolved value string when the item is selected */
    onSelect?: (value: string) => void;
    disabled?: boolean;
  }
  export function CommandItem(props: CommandItemProps): ReactElement;

  export function CommandShortcut(props: ComponentPropsWithoutRef<'span'>): ReactElement;
  export function CommandSeparator(props: DivProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/empty' {
  import type { ComponentPropsWithoutRef, ReactElement } from 'react';

  type DivProps = ComponentPropsWithoutRef<'div'>;

  export function Empty(props: DivProps): ReactElement;
  export function EmptyHeader(props: DivProps): ReactElement;

  export interface EmptyMediaProps extends DivProps {
    variant?: 'default' | 'icon';
  }
  export function EmptyMedia(props: EmptyMediaProps): ReactElement;

  export function EmptyTitle(props: DivProps): ReactElement;
  export function EmptyDescription(props: DivProps): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/input' {
  import type { ComponentPropsWithoutRef, ReactElement } from 'react';

  export function Input(props: ComponentPropsWithoutRef<'input'>): ReactElement;
}

declare module '@stevederico/skateboard-ui/shadcn/ui/spinner' {
  import type { ReactElement, SVGProps } from 'react';

  export interface SpinnerProps extends SVGProps<SVGSVGElement> {
    /** Width/height in pixels (default 24, styled to size-4 via className) */
    size?: number | string;
  }

  /** Animated loading spinner (spinning Loader2 icon with role="status"). */
  export function Spinner(props: SpinnerProps): ReactElement;
}
