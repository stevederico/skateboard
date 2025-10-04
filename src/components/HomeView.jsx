import SectionCards from './SectionCards';
import ChartAreaInteractive from './ChartAreaInteractive';
import DataTable from './DataTable';

export default function HomeView() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
        <DataTable />
      </div>
    </div>
  )
}
