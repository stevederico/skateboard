import type { ReactNode } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { LayoutDashboard, Plus } from '@stevederico/skateboard-ui/icons';

/** Props for the BlankView starter template. */
interface BlankViewProps {
  /** Header title */
  title?: string;
  /** Empty state description text */
  description?: string;
  /** CTA button text (e.g. "Create Project") */
  buttonTitle?: string;
  /** CTA button click handler */
  onButtonClick?: () => void;
  /** Custom icon element for empty state */
  icon?: ReactNode;
  /** Optional content to replace empty state */
  children?: ReactNode;
}

/**
 * Blank view template component
 *
 * Starter view with Header and empty state. Use as starting point for new views.
 *
 * @component
 * @returns Blank view with header and empty state
 */
export default function BlankView({ title = "Blank", description, buttonTitle, onButtonClick, icon, children }: BlankViewProps) {
  return (
    <>
      <Header title={title} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {children || (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {icon || <LayoutDashboard size={24} />}
                </EmptyMedia>
                <EmptyTitle>No {title.toLowerCase()} yet</EmptyTitle>
                <EmptyDescription>
                  {description || `${title} will appear here once you get started.`}
                </EmptyDescription>
              </EmptyHeader>
              {buttonTitle ? (
                <Button onClick={onButtonClick}>
                  <Plus size={18} />
                  {buttonTitle}
                </Button>
              ) : null}
            </Empty>
          </div>
        )}
      </div>
    </>
  )
}