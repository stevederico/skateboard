import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { IconLayoutDashboard, IconPlus } from '@tabler/icons-react';

/**
 * Blank view template component
 *
 * Starter view with Header and empty state. Use as starting point for new views.
 *
 * @component
 * @param {Object} props
 * @param {string} props.title - Header title
 * @param {string} [props.description] - Empty state description text
 * @param {string} [props.buttonTitle] - CTA button text (e.g. "Create Project")
 * @param {Function} [props.onButtonClick] - CTA button click handler
 * @param {import('react').ReactNode} [props.icon] - Custom icon element for empty state
 * @param {import('react').ReactNode} [props.children] - Optional content to replace empty state
 * @returns {JSX.Element} Blank view with header and empty state
 */
export default function BlankView({ title = "Blank", description, buttonTitle, onButtonClick, icon, children }) {
  return (
    <>
      <Header title={title} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {children || (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {icon || <IconLayoutDashboard size={24} />}
                </EmptyMedia>
                <EmptyTitle>No {title.toLowerCase()} yet</EmptyTitle>
                <EmptyDescription>
                  {description || `${title} will appear here once you get started.`}
                </EmptyDescription>
              </EmptyHeader>
              {buttonTitle && (
                <Button onClick={onButtonClick}>
                  <IconPlus size={18} />
                  {buttonTitle}
                </Button>
              )}
            </Empty>
          </div>
        )}
      </div>
    </>
  )
}