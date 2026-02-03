import Header from '@stevederico/skateboard-ui/Header';
import { SectionCards } from './SectionCards.jsx';
import { ChartAreaInteractive } from './ChartAreaInteractive.jsx';
import { DataTable } from './DataTable.jsx';
import data from './data.json';

/**
 * Dashboard view matching shadcn dashboard-01 exactly.
 *
 * Composes SectionCards (4 metric cards), ChartAreaInteractive (area chart
 * with time range toggle), and DataTable (full-featured @tanstack/react-table
 * with drag-and-drop, pagination, column visibility, and drawer detail view).
 *
 * @component
 * @returns {JSX.Element} Dashboard view
 */
export default function HomeView() {
  return (
    <>
      <Header title="Documents" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards />
            <div className="px-4 lg:px-6">
              <ChartAreaInteractive />
            </div>
            <DataTable data={data} />
          </div>
        </div>
      </div>
    </>
  );
}
