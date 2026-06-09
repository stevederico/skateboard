import Header from '@stevederico/skateboard-ui/Header';
import { SectionCards } from './SectionCards';

/**
 * Dashboard view with metric cards.
 *
 * @component
 * @returns Dashboard view
 */
export default function HomeView() {
  return (
    <>
      <Header title="Documents" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards />
          </div>
        </div>
      </div>
    </>
  );
}
