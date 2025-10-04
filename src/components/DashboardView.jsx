import { useState, useEffect, useRef } from 'react';
import { getState } from '../context.jsx';
import { getRemainingUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import UpgradeSheet from './UpgradeSheet';
import SectionCards from './SectionCards';
import ChartAreaInteractive from './ChartAreaInteractive';
import DataTable from './DataTable';

export default function DashboardView() {
  const { state } = getState();
  const [usageInfo, setUsageInfo] = useState({ remaining: -1, isSubscriber: true });
  const upgradeSheetRef = useRef();

  useEffect(() => {
    const updateUsage = async () => {
      try {
        const usage = await getRemainingUsage('dashboard');
        setUsageInfo(usage);
      } catch (error) {
        console.error('Error updating usage:', error);
      }
    };

    updateUsage();
  }, []);

  // Pass usage info to SiteHeader
  useEffect(() => {
    if (window.updateChatUsageInfo) {
      window.updateChatUsageInfo(usageInfo, () => showUpgradeSheet(upgradeSheetRef));
    }

    return () => {
      if (window.updateChatUsageInfo) {
        window.updateChatUsageInfo(null, null);
      }
    };
  }, [usageInfo]);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
        <DataTable />
      </div>

      <UpgradeSheet
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </div>
  )
}
