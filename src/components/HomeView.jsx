import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { useEffect, useState, useRef, useCallback } from "react";
import { getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';
import constants from '../constants.json';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Checkbox } from '@stevederico/skateboard-ui/shadcn/ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@stevederico/skateboard-ui/shadcn/ui/tabs';
import { Table, TableHeader as THead, TableBody, TableHead, TableRow, TableCell } from '@stevederico/skateboard-ui/shadcn/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@stevederico/skateboard-ui/shadcn/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@stevederico/skateboard-ui/shadcn/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@stevederico/skateboard-ui/shadcn/ui/select';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

// 90 days of chart data matching reference
const chartData = [
  { date: "2024-04-01", desktop: 222, mobile: 150 },
  { date: "2024-04-02", desktop: 97, mobile: 180 },
  { date: "2024-04-03", desktop: 167, mobile: 120 },
  { date: "2024-04-04", desktop: 242, mobile: 260 },
  { date: "2024-04-05", desktop: 373, mobile: 290 },
  { date: "2024-04-06", desktop: 301, mobile: 340 },
  { date: "2024-04-07", desktop: 245, mobile: 180 },
  { date: "2024-04-08", desktop: 409, mobile: 320 },
  { date: "2024-04-09", desktop: 59, mobile: 110 },
  { date: "2024-04-10", desktop: 261, mobile: 190 },
  { date: "2024-04-11", desktop: 327, mobile: 350 },
  { date: "2024-04-12", desktop: 292, mobile: 210 },
  { date: "2024-04-13", desktop: 342, mobile: 380 },
  { date: "2024-04-14", desktop: 137, mobile: 220 },
  { date: "2024-04-15", desktop: 120, mobile: 170 },
  { date: "2024-04-16", desktop: 138, mobile: 190 },
  { date: "2024-04-17", desktop: 446, mobile: 360 },
  { date: "2024-04-18", desktop: 364, mobile: 410 },
  { date: "2024-04-19", desktop: 243, mobile: 180 },
  { date: "2024-04-20", desktop: 89, mobile: 150 },
  { date: "2024-04-21", desktop: 137, mobile: 200 },
  { date: "2024-04-22", desktop: 224, mobile: 170 },
  { date: "2024-04-23", desktop: 138, mobile: 230 },
  { date: "2024-04-24", desktop: 387, mobile: 290 },
  { date: "2024-04-25", desktop: 215, mobile: 250 },
  { date: "2024-04-26", desktop: 75, mobile: 130 },
  { date: "2024-04-27", desktop: 383, mobile: 420 },
  { date: "2024-04-28", desktop: 122, mobile: 180 },
  { date: "2024-04-29", desktop: 315, mobile: 240 },
  { date: "2024-04-30", desktop: 454, mobile: 380 },
  { date: "2024-05-01", desktop: 165, mobile: 220 },
  { date: "2024-05-02", desktop: 293, mobile: 310 },
  { date: "2024-05-03", desktop: 247, mobile: 190 },
  { date: "2024-05-04", desktop: 385, mobile: 420 },
  { date: "2024-05-05", desktop: 481, mobile: 390 },
  { date: "2024-05-06", desktop: 498, mobile: 520 },
  { date: "2024-05-07", desktop: 388, mobile: 300 },
  { date: "2024-05-08", desktop: 149, mobile: 210 },
  { date: "2024-05-09", desktop: 227, mobile: 180 },
  { date: "2024-05-10", desktop: 293, mobile: 330 },
  { date: "2024-05-11", desktop: 335, mobile: 270 },
  { date: "2024-05-12", desktop: 197, mobile: 240 },
  { date: "2024-05-13", desktop: 197, mobile: 160 },
  { date: "2024-05-14", desktop: 448, mobile: 490 },
  { date: "2024-05-15", desktop: 473, mobile: 380 },
  { date: "2024-05-16", desktop: 338, mobile: 400 },
  { date: "2024-05-17", desktop: 499, mobile: 420 },
  { date: "2024-05-18", desktop: 315, mobile: 350 },
  { date: "2024-05-19", desktop: 235, mobile: 180 },
  { date: "2024-05-20", desktop: 177, mobile: 230 },
  { date: "2024-05-21", desktop: 82, mobile: 140 },
  { date: "2024-05-22", desktop: 81, mobile: 120 },
  { date: "2024-05-23", desktop: 252, mobile: 290 },
  { date: "2024-05-24", desktop: 294, mobile: 220 },
  { date: "2024-05-25", desktop: 201, mobile: 250 },
  { date: "2024-05-26", desktop: 213, mobile: 170 },
  { date: "2024-05-27", desktop: 420, mobile: 460 },
  { date: "2024-05-28", desktop: 233, mobile: 190 },
  { date: "2024-05-29", desktop: 78, mobile: 130 },
  { date: "2024-05-30", desktop: 340, mobile: 280 },
  { date: "2024-05-31", desktop: 178, mobile: 230 },
  { date: "2024-06-01", desktop: 178, mobile: 200 },
  { date: "2024-06-02", desktop: 470, mobile: 410 },
  { date: "2024-06-03", desktop: 103, mobile: 160 },
  { date: "2024-06-04", desktop: 439, mobile: 380 },
  { date: "2024-06-05", desktop: 88, mobile: 140 },
  { date: "2024-06-06", desktop: 294, mobile: 250 },
  { date: "2024-06-07", desktop: 323, mobile: 370 },
  { date: "2024-06-08", desktop: 385, mobile: 320 },
  { date: "2024-06-09", desktop: 438, mobile: 480 },
  { date: "2024-06-10", desktop: 155, mobile: 200 },
  { date: "2024-06-11", desktop: 92, mobile: 150 },
  { date: "2024-06-12", desktop: 492, mobile: 420 },
  { date: "2024-06-13", desktop: 81, mobile: 130 },
  { date: "2024-06-14", desktop: 426, mobile: 380 },
  { date: "2024-06-15", desktop: 307, mobile: 350 },
  { date: "2024-06-16", desktop: 371, mobile: 310 },
  { date: "2024-06-17", desktop: 475, mobile: 520 },
  { date: "2024-06-18", desktop: 107, mobile: 170 },
  { date: "2024-06-19", desktop: 341, mobile: 290 },
  { date: "2024-06-20", desktop: 408, mobile: 450 },
  { date: "2024-06-21", desktop: 169, mobile: 210 },
  { date: "2024-06-22", desktop: 317, mobile: 270 },
  { date: "2024-06-23", desktop: 480, mobile: 530 },
  { date: "2024-06-24", desktop: 132, mobile: 180 },
  { date: "2024-06-25", desktop: 141, mobile: 190 },
  { date: "2024-06-26", desktop: 434, mobile: 380 },
  { date: "2024-06-27", desktop: 448, mobile: 490 },
  { date: "2024-06-28", desktop: 149, mobile: 200 },
  { date: "2024-06-29", desktop: 103, mobile: 160 },
  { date: "2024-06-30", desktop: 446, mobile: 400 },
];

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  desktop: {
    label: "Desktop",
    color: "var(--color-primary)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--color-primary)",
  },
};

/**
 * Dashboard view matching shadcn dashboard-01 example.
 *
 * Sections:
 * - 4 metric cards with CardAction badges and two-line footers
 * - Interactive area chart with time range toggle (90d/30d/7d)
 * - Tabbed data table with todo CRUD
 *
 * @component
 * @returns {JSX.Element} Dashboard view
 */
export default function HomeView() {
  const { state, dispatch } = getState();
  const requireAuth = useCallback((callback) => {
    if (state.user) {
      callback();
    } else {
      dispatch({ type: 'SHOW_AUTH_OVERLAY', payload: callback });
    }
  }, [state.user, dispatch]);
  const [usageInfo, setUsageInfo] = useState({ remaining: -1, isSubscriber: true });
  const isUserSubscriber = usageInfo.isSubscriber;
  const [activeTab, setActiveTab] = useState('outline');
  const [timeRange, setTimeRange] = useState('90d');

  const getTodosKey = () => {
    const appName = constants.appName || 'skateboard';
    return `${appName.toLowerCase().replace(/\s+/g, '-')}_todos_v2`;
  };

  const [todos, setTodos] = useState(() => {
    const defaultTodos = [
      { id: crypto.randomUUID(), text: 'Complete the weekly report', completed: false, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), text: 'Call the client about the project update', completed: false, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), text: 'Review the team proposals', completed: true, createdAt: new Date().toISOString() }
    ];
    try {
      const savedTodos = localStorage.getItem(getTodosKey());
      return savedTodos ? JSON.parse(savedTodos) : defaultTodos;
    } catch (error) {
      console.error('Error parsing saved todos:', error);
      return defaultTodos;
    }
  });
  const [newTodo, setNewTodo] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const upgradeSheetRef = useRef();

  useEffect(() => {
    localStorage.setItem(getTodosKey(), JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    const updateUsage = async () => {
      try {
        const usage = await getRemainingUsage('todos');
        setUsageInfo(usage);
      } catch (error) {
        console.error('Error updating usage:', error);
      }
    };
    updateUsage();
  }, [todos]);

  const addTodo = async () => {
    if (newTodo.trim()) {
      if (!usageInfo.isSubscriber && usageInfo.remaining <= 0) {
        showUpgradeSheet(upgradeSheetRef);
        return;
      }
      const todo = {
        id: crypto.randomUUID(),
        text: newTodo.trim(),
        completed: false,
        createdAt: new Date().toISOString()
      };
      setTodos([todo, ...todos]);
      setNewTodo('');
      const updatedUsage = await trackUsage('todos');
      setUsageInfo(updatedUsage);
    }
  };

  const toggleTodo = (id) => {
    const updatedTodos = todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    const sortedTodos = updatedTodos.sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    });
    setTodos(sortedTodos);
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      requireAuth(() => addTodo());
    }
  };

  const handleDragStart = (e, todo) => {
    setDraggedItem(todo);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, todo) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(todo.id);
  };

  const handleDrop = (e, targetTodo) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetTodo.id) {
      setDragOverItem(null);
      return;
    }
    const draggedIndex = todos.findIndex(todo => todo.id === draggedItem.id);
    const targetIndex = todos.findIndex(todo => todo.id === targetTodo.id);
    const newTodos = [...todos];
    const [removed] = newTodos.splice(draggedIndex, 1);
    newTodos.splice(targetIndex, 0, removed);
    setTodos(newTodos);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const completedCount = todos.filter(todo => todo.completed).length;
  const totalCount = todos.length;
  const remainingCount = totalCount - completedCount;
  const completedPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const filteredTodos = activeTab === 'outline'
    ? todos
    : activeTab === 'past-performance'
    ? todos.filter(t => !t.completed)
    : todos.filter(t => t.completed);

  // Stable pseudo-random number from string (for demo Target/Limit columns)
  const stableNum = (str, max = 30) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    return (Math.abs(hash) % max) + 1;
  };

  // Filter chart data by time range
  const filteredChartData = chartData.filter((item) => {
    const date = new Date(item.date);
    const referenceDate = new Date("2024-06-30");
    let daysToSubtract = 90;
    if (timeRange === "30d") daysToSubtract = 30;
    else if (timeRange === "7d") daysToSubtract = 7;
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - daysToSubtract);
    return date >= startDate;
  });

  return (
    <>
      <Header
        title="Documents"
        buttonTitle={!isUserSubscriber ? (usageInfo.remaining >= 0 ? `${usageInfo.remaining}` : "Get Unlimited") : undefined}
        buttonClass={!isUserSubscriber && usageInfo.remaining >= 0 ? "rounded-full w-10 h-10 flex items-center justify-center text-lg" : ""}
        onButtonTitleClick={!isUserSubscriber ? () => {
          showUpgradeSheet(upgradeSheetRef);
        } : undefined}
      />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Section A: 4 Metric Cards */}
            <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Total Revenue</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    $1,250.00
                  </CardTitle>
                  <CardAction>
                    <Badge variant="outline">
                      <DynamicIcon name="trending-up" size={14} />
                      +12.5%
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    Trending up this month <DynamicIcon name="trending-up" size={16} />
                  </div>
                  <div className="text-muted-foreground">
                    Visitors for the last 6 months
                  </div>
                </CardFooter>
              </Card>

              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>New Customers</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    1,234
                  </CardTitle>
                  <CardAction>
                    <Badge variant="outline">
                      <DynamicIcon name="trending-down" size={14} />
                      -20%
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    Down 20% this period <DynamicIcon name="trending-down" size={16} />
                  </div>
                  <div className="text-muted-foreground">
                    Acquisition needs attention
                  </div>
                </CardFooter>
              </Card>

              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Active Accounts</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    45,678
                  </CardTitle>
                  <CardAction>
                    <Badge variant="outline">
                      <DynamicIcon name="trending-up" size={14} />
                      +12.5%
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    Strong user retention <DynamicIcon name="trending-up" size={16} />
                  </div>
                  <div className="text-muted-foreground">Engagement exceed targets</div>
                </CardFooter>
              </Card>

              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Growth Rate</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    4.5%
                  </CardTitle>
                  <CardAction>
                    <Badge variant="outline">
                      <DynamicIcon name="trending-up" size={14} />
                      +4.5%
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    Steady performance increase <DynamicIcon name="trending-up" size={16} />
                  </div>
                  <div className="text-muted-foreground">Meets growth projections</div>
                </CardFooter>
              </Card>
            </div>

            {/* Section B: Interactive Chart */}
            <div className="px-4 lg:px-6">
              <Card className="@container/card">
                <CardHeader>
                  <CardTitle>Total Visitors</CardTitle>
                  <CardDescription>
                    <span className="hidden @[540px]/card:block">
                      Total for the last 3 months
                    </span>
                    <span className="@[540px]/card:hidden">Last 3 months</span>
                  </CardDescription>
                  <CardAction>
                    <ToggleGroup
                      type="single"
                      value={timeRange}
                      onValueChange={setTimeRange}
                      variant="outline"
                      className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
                    >
                      <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
                      <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
                      <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
                    </ToggleGroup>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                      <SelectTrigger
                        className="flex w-40 @[767px]/card:hidden"
                        size="sm"
                        aria-label="Select a value"
                      >
                        <SelectValue placeholder="Last 3 months" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="90d" className="rounded-lg">
                          Last 3 months
                        </SelectItem>
                        <SelectItem value="30d" className="rounded-lg">
                          Last 30 days
                        </SelectItem>
                        <SelectItem value="7d" className="rounded-lg">
                          Last 7 days
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </CardAction>
                </CardHeader>
                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                  <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-[250px] w-full"
                  >
                    <AreaChart data={filteredChartData}>
                      <defs>
                        <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-desktop)" stopOpacity={1.0} />
                          <stop offset="95%" stopColor="var(--color-desktop)" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-mobile)" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="var(--color-mobile)" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={32}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            labelFormatter={(value) => {
                              return new Date(value).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              });
                            }}
                            indicator="dot"
                          />
                        }
                      />
                      <Area
                        dataKey="mobile"
                        type="natural"
                        fill="url(#fillMobile)"
                        stroke="var(--color-mobile)"
                        stackId="a"
                      />
                      <Area
                        dataKey="desktop"
                        type="natural"
                        fill="url(#fillDesktop)"
                        stroke="var(--color-desktop)"
                        stackId="a"
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Section C: Tabbed Data Table */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-col justify-start gap-6">
              <div className="flex items-center justify-between px-4 lg:px-6">
                <TabsList className="**:data-[slot=badge]:bg-muted-foreground/30 hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1 @4xl/main:flex">
                  <TabsTrigger value="outline">Outline</TabsTrigger>
                  <TabsTrigger value="past-performance">
                    Past Performance <Badge variant="secondary">3</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="key-personnel">
                    Key Personnel <Badge variant="secondary">2</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="focus-documents">Focus Documents</TabsTrigger>
                </TabsList>
                <Select defaultValue="outline" className="@4xl/main:hidden">
                  <SelectTrigger className="flex w-fit @4xl/main:hidden" size="sm">
                    <SelectValue placeholder="Select a view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outline">Outline</SelectItem>
                    <SelectItem value="past-performance">Past Performance</SelectItem>
                    <SelectItem value="key-personnel">Key Personnel</SelectItem>
                    <SelectItem value="focus-documents">Focus Documents</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={newTodo}
                    onChange={(e) => setNewTodo(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Add a new task..."
                    className="h-8 w-48 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => requireAuth(() => addTodo())}
                  >
                    <DynamicIcon name="plus" size={14} />
                    <span className="hidden lg:inline">Add Section</span>
                  </Button>
                </div>
              </div>
              <TabsContent
                value="outline"
                className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
              >
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <THead className="bg-muted sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Header</TableHead>
                        <TableHead>Section Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Limit</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </THead>
                    <TableBody>
                      {filteredTodos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">
                            No results.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTodos.map((todo) => (
                          <TableRow
                            key={todo.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, todo)}
                            onDragOver={(e) => handleDragOver(e, todo)}
                            onDrop={(e) => handleDrop(e, todo)}
                            onDragEnd={handleDragEnd}
                            className={`cursor-grab active:cursor-grabbing ${
                              draggedItem?.id === todo.id ? 'opacity-50' : ''
                            } ${dragOverItem === todo.id ? 'bg-accent/60' : ''}`}
                          >
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground size-7 hover:bg-transparent cursor-grab"
                              >
                                <DynamicIcon name="grip-vertical" size={12} />
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  checked={todo.completed}
                                  onCheckedChange={() => requireAuth(() => toggleTodo(todo.id))}
                                  className="cursor-pointer"
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button variant="link" className="text-foreground w-fit px-0 text-left">
                                {todo.text}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="w-32">
                                <Badge variant="outline" className="text-muted-foreground px-1.5">
                                  Narrative
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              {todo.completed ? (
                                <Badge variant="outline" className="text-muted-foreground px-1.5">
                                  <DynamicIcon name="circle-check" size={14} className="fill-green-500 dark:fill-green-400 text-white dark:text-black" />
                                  Done
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground px-1.5">
                                  <DynamicIcon name="loader" size={14} />
                                  In Process
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="hover:bg-input/30 focus-visible:bg-background dark:hover:bg-input/30 dark:focus-visible:bg-input/30 h-8 w-16 border-transparent bg-transparent text-right shadow-none focus-visible:border dark:bg-transparent"
                                defaultValue={stableNum(todo.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="hover:bg-input/30 focus-visible:bg-background dark:hover:bg-input/30 dark:focus-visible:bg-input/30 h-8 w-16 border-transparent bg-transparent text-right shadow-none focus-visible:border dark:bg-transparent"
                                defaultValue={stableNum(todo.id + 'limit')}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requireAuth(() => deleteTodo(todo.id));
                                }}
                                className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
                                title="Delete task"
                              >
                                <DynamicIcon name="ellipsis-vertical" size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent
                value="past-performance"
                className="flex flex-col px-4 lg:px-6"
              >
                <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
              </TabsContent>
              <TabsContent value="key-personnel" className="flex flex-col px-4 lg:px-6">
                <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
              </TabsContent>
              <TabsContent
                value="focus-documents"
                className="flex flex-col px-4 lg:px-6"
              >
                <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <UpgradeSheet
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </>
  );
}
