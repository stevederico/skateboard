import type { ReactNode } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/ui/empty';
import { LayoutDashboard, Plus } from '../icons';

interface BlankViewProps {
  title?: string;
  description?: string;
  buttonTitle?: string;
  onButtonClick?: () => void;
  icon?: ReactNode;
  children?: ReactNode;
}

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
                  {icon || <LayoutDashboard size={24} aria-hidden="true" />}
                </EmptyMedia>
                <EmptyTitle>No {title.toLowerCase()} yet</EmptyTitle>
                <EmptyDescription>
                  {description || `${title} will appear here once you get started.`}
                </EmptyDescription>
              </EmptyHeader>
              {buttonTitle && onButtonClick ? (
                <Button onClick={onButtonClick}>
                  <Plus size={18} aria-hidden="true" />
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