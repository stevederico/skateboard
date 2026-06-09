import { useState } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { Calendar } from '@stevederico/skateboard-ui/shadcn/ui/calendar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';

/** Selected range in mode="range" — mirrors react-day-picker's DateRange shape. */
interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

/**
 * QA page for the recreated Calendar primitive.
 *
 * Renders single, range, and dropdown-caption modes side-by-side and prints
 * the live selected value next to each so you can verify selection behavior,
 * keyboard nav, and visual styling in one place.
 */
export default function CalendarTestView() {
  const [single, setSingle] = useState<Date | undefined>(new Date());
  const [range, setRange] = useState<DateRange | undefined>({ from: new Date() });
  const [dropdown, setDropdown] = useState<Date | undefined>();
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const inThreeDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);

  return (
    <>
      <Header title="Calendar QA" />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>mode="single"</CardTitle>
            <CardDescription>
              Selected: {single ? single.toLocaleDateString() : '(none)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar mode="single" selected={single} onSelect={setSingle} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>mode="range"</CardTitle>
            <CardDescription>
              From: {range?.from?.toLocaleDateString() || '(none)'} &nbsp;
              To: {range?.to?.toLocaleDateString() || '(none)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar mode="range" selected={range} onSelect={setRange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>captionLayout="dropdown"</CardTitle>
            <CardDescription>
              Selected: {dropdown ? dropdown.toLocaleDateString() : '(none)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={dropdown}
              onSelect={setDropdown}
              captionLayout="dropdown"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>disabled = [tomorrow, day-after-tomorrow, +3]</CardTitle>
            <CardDescription>
              Click should be blocked on highlighted-grey dates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              disabled={[tomorrow, inThreeDays]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keyboard QA checklist</CardTitle>
            <CardDescription>Click any day to focus it, then test:</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 list-disc pl-5">
              <li>← / → moves ±1 day</li>
              <li>↑ / ↓ moves ±7 days</li>
              <li>PageUp / PageDown moves ±1 month</li>
              <li>Shift+PageUp / Shift+PageDown moves ±1 year</li>
              <li>Home / End jumps to start/end of week</li>
              <li>Enter or Space selects the focused day</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
