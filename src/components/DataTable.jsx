import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, CircleCheck, Loader2, Plus } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Checkbox } from '@stevederico/skateboard-ui/shadcn/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@stevederico/skateboard-ui/shadcn/ui/dropdown-menu';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stevederico/skateboard-ui/shadcn/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@stevederico/skateboard-ui/shadcn/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@stevederico/skateboard-ui/shadcn/ui/tabs';

const data = [
  { id: 1, header: "Cover page", type: "Cover page", status: "In Process", target: "18", limit: "5", reviewer: "Eddie Lake" },
  { id: 2, header: "Table of contents", type: "Table of contents", status: "Done", target: "29", limit: "24", reviewer: "Eddie Lake" },
  { id: 3, header: "Executive summary", type: "Narrative", status: "Done", target: "10", limit: "13", reviewer: "Eddie Lake" },
  { id: 4, header: "Technical approach", type: "Narrative", status: "Done", target: "27", limit: "23", reviewer: "Jamik Tashpulatov" },
  { id: 5, header: "Design", type: "Narrative", status: "In Process", target: "2", limit: "16", reviewer: "Jamik Tashpulatov" },
  { id: 6, header: "Capabilities", type: "Narrative", status: "In Process", target: "20", limit: "8", reviewer: "Jamik Tashpulatov" },
  { id: 7, header: "Integration with existing systems", type: "Narrative", status: "In Process", target: "19", limit: "21", reviewer: "Jamik Tashpulatov" },
  { id: 8, header: "Innovation and Advantages", type: "Narrative", status: "Done", target: "25", limit: "26", reviewer: "Assign reviewer" },
  { id: 9, header: "Overview of EMR's Innovative Solutions", type: "Technical content", status: "Done", target: "7", limit: "23", reviewer: "Assign reviewer" },
  { id: 10, header: "Advanced Algorithms and Machine Learning", type: "Narrative", status: "Done", target: "30", limit: "28", reviewer: "Assign reviewer" },
  { id: 11, header: "Adaptive Communication Protocols", type: "Narrative", status: "Done", target: "9", limit: "31", reviewer: "Assign reviewer" },
  { id: 12, header: "Advantages Over Current Technologies", type: "Narrative", status: "Done", target: "12", limit: "0", reviewer: "Assign reviewer" },
  { id: 13, header: "Past Performance", type: "Narrative", status: "Done", target: "22", limit: "33", reviewer: "Assign reviewer" },
  { id: 14, header: "Customer Feedback and Satisfaction Levels", type: "Narrative", status: "Done", target: "15", limit: "34", reviewer: "Assign reviewer" },
  { id: 15, header: "Implementation Challenges and Solutions", type: "Narrative", status: "Done", target: "3", limit: "35", reviewer: "Assign reviewer" },
  { id: 16, header: "Security Measures and Data Protection Policies", type: "Narrative", status: "In Process", target: "6", limit: "36", reviewer: "Assign reviewer" },
  { id: 17, header: "Scalability and Future Proofing", type: "Narrative", status: "Done", target: "4", limit: "37", reviewer: "Assign reviewer" },
  { id: 18, header: "Cost-Benefit Analysis", type: "Plain language", status: "Done", target: "14", limit: "38", reviewer: "Assign reviewer" },
  { id: 19, header: "User Training and Onboarding Experience", type: "Narrative", status: "Done", target: "17", limit: "39", reviewer: "Assign reviewer" },
  { id: 20, header: "Future Development Roadmap", type: "Narrative", status: "Done", target: "11", limit: "40", reviewer: "Assign reviewer" },
  { id: 21, header: "System Architecture Overview", type: "Technical content", status: "In Process", target: "24", limit: "18", reviewer: "Maya Johnson" },
  { id: 22, header: "Risk Management Plan", type: "Narrative", status: "Done", target: "15", limit: "22", reviewer: "Carlos Rodriguez" },
  { id: 23, header: "Compliance Documentation", type: "Legal", status: "In Process", target: "31", limit: "27", reviewer: "Sarah Chen" },
  { id: 24, header: "API Documentation", type: "Technical content", status: "Done", target: "8", limit: "12", reviewer: "Raj Patel" },
  { id: 25, header: "User Interface Mockups", type: "Visual", status: "In Process", target: "19", limit: "25", reviewer: "Leila Ahmadi" },
  { id: 26, header: "Database Schema", type: "Technical content", status: "Done", target: "22", limit: "20", reviewer: "Thomas Wilson" },
  { id: 27, header: "Testing Methodology", type: "Technical content", status: "In Process", target: "17", limit: "14", reviewer: "Assign reviewer" },
  { id: 28, header: "Deployment Strategy", type: "Narrative", status: "Done", target: "26", limit: "30", reviewer: "Eddie Lake" },
  { id: 29, header: "Budget Breakdown", type: "Financial", status: "In Process", target: "13", limit: "16", reviewer: "Jamik Tashpulatov" },
  { id: 30, header: "Market Analysis", type: "Research", status: "Done", target: "29", limit: "32", reviewer: "Sophia Martinez" },
  { id: 31, header: "Competitor Comparison", type: "Research", status: "In Process", target: "21", limit: "19", reviewer: "Assign reviewer" },
  { id: 32, header: "Maintenance Plan", type: "Technical content", status: "Done", target: "16", limit: "23", reviewer: "Alex Thompson" },
  { id: 33, header: "User Personas", type: "Research", status: "In Process", target: "27", limit: "24", reviewer: "Nina Patel" },
  { id: 34, header: "Accessibility Compliance", type: "Legal", status: "Done", target: "18", limit: "21", reviewer: "Assign reviewer" },
  { id: 35, header: "Performance Metrics", type: "Technical content", status: "In Process", target: "23", limit: "26", reviewer: "David Kim" },
  { id: 36, header: "Disaster Recovery Plan", type: "Technical content", status: "Done", target: "14", limit: "17", reviewer: "Jamik Tashpulatov" },
  { id: 37, header: "Third-party Integrations", type: "Technical content", status: "In Process", target: "25", limit: "28", reviewer: "Eddie Lake" },
  { id: 38, header: "User Feedback Summary", type: "Research", status: "Done", target: "20", limit: "15", reviewer: "Assign reviewer" },
  { id: 39, header: "Localization Strategy", type: "Narrative", status: "In Process", target: "12", limit: "19", reviewer: "Maria Garcia" },
  { id: 40, header: "Mobile Compatibility", type: "Technical content", status: "Done", target: "28", limit: "31", reviewer: "James Wilson" },
  { id: 41, header: "Data Migration Plan", type: "Technical content", status: "In Process", target: "19", limit: "22", reviewer: "Assign reviewer" },
  { id: 42, header: "Quality Assurance Protocols", type: "Technical content", status: "Done", target: "30", limit: "33", reviewer: "Priya Singh" },
  { id: 43, header: "Stakeholder Analysis", type: "Research", status: "In Process", target: "11", limit: "14", reviewer: "Eddie Lake" },
  { id: 44, header: "Environmental Impact Assessment", type: "Research", status: "Done", target: "24", limit: "27", reviewer: "Assign reviewer" },
  { id: 45, header: "Intellectual Property Rights", type: "Legal", status: "In Process", target: "17", limit: "20", reviewer: "Sarah Johnson" },
  { id: 46, header: "Customer Support Framework", type: "Narrative", status: "Done", target: "22", limit: "25", reviewer: "Jamik Tashpulatov" },
  { id: 47, header: "Version Control Strategy", type: "Technical content", status: "In Process", target: "15", limit: "18", reviewer: "Assign reviewer" },
  { id: 48, header: "Continuous Integration Pipeline", type: "Technical content", status: "Done", target: "26", limit: "29", reviewer: "Michael Chen" },
  { id: 49, header: "Regulatory Compliance", type: "Legal", status: "In Process", target: "13", limit: "16", reviewer: "Assign reviewer" },
  { id: 50, header: "User Authentication System", type: "Technical content", status: "Done", target: "28", limit: "31", reviewer: "Eddie Lake" },
  { id: 51, header: "Data Analytics Framework", type: "Technical content", status: "In Process", target: "21", limit: "24", reviewer: "Jamik Tashpulatov" },
  { id: 52, header: "Cloud Infrastructure", type: "Technical content", status: "Done", target: "16", limit: "19", reviewer: "Assign reviewer" },
  { id: 53, header: "Network Security Measures", type: "Technical content", status: "In Process", target: "29", limit: "32", reviewer: "Lisa Wong" },
  { id: 54, header: "Project Timeline", type: "Planning", status: "Done", target: "14", limit: "17", reviewer: "Eddie Lake" },
  { id: 55, header: "Resource Allocation", type: "Planning", status: "In Process", target: "27", limit: "30", reviewer: "Assign reviewer" },
  { id: 56, header: "Team Structure and Roles", type: "Planning", status: "Done", target: "20", limit: "23", reviewer: "Jamik Tashpulatov" },
  { id: 57, header: "Communication Protocols", type: "Planning", status: "In Process", target: "15", limit: "18", reviewer: "Assign reviewer" },
  { id: 58, header: "Success Metrics", type: "Planning", status: "Done", target: "30", limit: "33", reviewer: "Eddie Lake" },
  { id: 59, header: "Internationalization Support", type: "Technical content", status: "In Process", target: "23", limit: "26", reviewer: "Jamik Tashpulatov" },
  { id: 60, header: "Backup and Recovery Procedures", type: "Technical content", status: "Done", target: "18", limit: "21", reviewer: "Assign reviewer" },
  { id: 61, header: "Monitoring and Alerting System", type: "Technical content", status: "In Process", target: "25", limit: "28", reviewer: "Daniel Park" },
  { id: 62, header: "Code Review Guidelines", type: "Technical content", status: "Done", target: "12", limit: "15", reviewer: "Eddie Lake" },
  { id: 63, header: "Documentation Standards", type: "Technical content", status: "In Process", target: "27", limit: "30", reviewer: "Jamik Tashpulatov" },
  { id: 64, header: "Release Management Process", type: "Planning", status: "Done", target: "22", limit: "25", reviewer: "Assign reviewer" },
  { id: 65, header: "Feature Prioritization Matrix", type: "Planning", status: "In Process", target: "19", limit: "22", reviewer: "Emma Davis" },
  { id: 66, header: "Technical Debt Assessment", type: "Technical content", status: "Done", target: "24", limit: "27", reviewer: "Eddie Lake" },
  { id: 67, header: "Capacity Planning", type: "Planning", status: "In Process", target: "21", limit: "24", reviewer: "Jamik Tashpulatov" },
  { id: 68, header: "Service Level Agreements", type: "Legal", status: "Done", target: "26", limit: "29", reviewer: "Assign reviewer" },
];

const columns = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "header",
    header: "Header",
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.header}</div>;
    },
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: "Section Type",
    cell: ({ row }) => (
      <div className="w-32">
        <Badge variant="outline" className="px-1.5 text-muted-foreground">
          {row.original.type}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {row.original.status === "Done" ? (
          <CircleCheck className="fill-green-500 dark:fill-green-400" />
        ) : (
          <Loader2 />
        )}
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "target",
    header: () => <div className="w-full text-right">Target</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <Label htmlFor={`${row.original.id}-target`} className="sr-only">
          Target
        </Label>
        <Input
          className="h-8 w-16 border-transparent bg-transparent text-right shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30"
          defaultValue={row.original.target}
          id={`${row.original.id}-target`}
        />
      </div>
    ),
  },
  {
    accessorKey: "limit",
    header: () => <div className="w-full text-right">Limit</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <Label htmlFor={`${row.original.id}-limit`} className="sr-only">
          Limit
        </Label>
        <Input
          className="h-8 w-16 border-transparent bg-transparent text-right shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30"
          defaultValue={row.original.limit}
          id={`${row.original.id}-limit`}
        />
      </div>
    ),
  },
  {
    accessorKey: "reviewer",
    header: "Reviewer",
    cell: ({ row }) => {
      const isAssigned = row.original.reviewer !== "Assign reviewer";

      if (isAssigned) {
        return row.original.reviewer;
      }

      return (
        <>
          <Label htmlFor={`${row.original.id}-reviewer`} className="sr-only">
            Reviewer
          </Label>
          <Select>
            <SelectTrigger
              className="w-38"
              size="sm"
              id={`${row.original.id}-reviewer`}
            >
              <SelectValue placeholder="Assign reviewer" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="Eddie Lake">Eddie Lake</SelectItem>
              <SelectItem value="Jamik Tashpulatov">
                Jamik Tashpulatov
              </SelectItem>
            </SelectContent>
          </Select>
        </>
      );
    },
  },
];

export default function DataTable() {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState({});
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Document Management</CardTitle>
          <CardDescription>Manage your project documentation and sections</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue="outline"
            className="w-full flex-col justify-start gap-6"
          >
            <div className="flex items-center justify-between">
              <Label htmlFor="view-selector" className="sr-only">
                View
              </Label>
              <Select defaultValue="outline">
                <SelectTrigger
                  className="flex w-fit @4xl/main:hidden"
                  size="sm"
                  id="view-selector"
                >
                  <SelectValue placeholder="Select a view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outline">Outline</SelectItem>
                  <SelectItem value="past-performance">Past Performance</SelectItem>
                  <SelectItem value="key-personnel">Key Personnel</SelectItem>
                  <SelectItem value="focus-documents">Focus Documents</SelectItem>
                </SelectContent>
              </Select>
              <TabsList className="hidden @4xl/main:flex">
                <TabsTrigger value="outline">Outline</TabsTrigger>
                <TabsTrigger value="past-performance">
                  Past Performance <Badge variant="secondary">3</Badge>
                </TabsTrigger>
                <TabsTrigger value="key-personnel">
                  Key Personnel <Badge variant="secondary">2</Badge>
                </TabsTrigger>
                <TabsTrigger value="focus-documents">Focus Documents</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Columns3 />
                      <span className="hidden lg:inline">Customize Columns</span>
                      <span className="lg:hidden">Columns</span>
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {table
                      .getAllColumns()
                      .filter(
                        (column) =>
                          typeof column.accessorFn !== "undefined" &&
                          column.getCanHide()
                      )
                      .map((column) => {
                        return (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize"
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) =>
                              column.toggleVisibility(!!value)
                            }
                          >
                            {column.id}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm">
                  <Plus />
                  <span className="hidden lg:inline">Add Section</span>
                </Button>
              </div>
            </div>
            <TabsContent
              value="outline"
              className="relative flex flex-col gap-4 overflow-auto"
            >
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          return (
                            <TableHead key={header.id} colSpan={header.colSpan}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          data-state={row.getIsSelected() && "selected"}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className="h-24 text-center"
                        >
                          No results.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
                  {table.getFilteredSelectedRowModel().rows.length} of{" "}
                  {table.getFilteredRowModel().rows.length} row(s) selected.
                </div>
                <div className="flex w-full items-center gap-8 lg:w-fit">
                  <div className="hidden items-center gap-2 lg:flex">
                    <Label htmlFor="rows-per-page" className="text-sm font-medium">
                      Rows per page
                    </Label>
                    <Select
                      value={`${table.getState().pagination.pageSize}`}
                      onValueChange={(value) => {
                        table.setPageSize(Number(value));
                      }}
                    >
                      <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                        <SelectValue
                          placeholder={table.getState().pagination.pageSize}
                        />
                      </SelectTrigger>
                      <SelectContent side="top">
                        {[10, 20, 30, 40, 50].map((pageSize) => (
                          <SelectItem key={pageSize} value={`${pageSize}`}>
                            {pageSize}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-fit items-center justify-center text-sm font-medium">
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {table.getPageCount()}
                  </div>
                  <div className="ml-auto flex items-center gap-2 lg:ml-0">
                    <Button
                      variant="outline"
                      className="hidden h-8 w-8 p-0 lg:flex"
                      onClick={() => table.setPageIndex(0)}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <span className="sr-only">Go to first page</span>
                      <ChevronsLeft />
                    </Button>
                    <Button
                      variant="outline"
                      className="size-8"
                      size="icon"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <span className="sr-only">Go to previous page</span>
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="outline"
                      className="size-8"
                      size="icon"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      <span className="sr-only">Go to next page</span>
                      <ChevronRight />
                    </Button>
                    <Button
                      variant="outline"
                      className="hidden size-8 lg:flex"
                      size="icon"
                      onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                      disabled={!table.getCanNextPage()}
                    >
                      <span className="sr-only">Go to last page</span>
                      <ChevronsRight />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="past-performance"
              className="flex flex-col"
            >
              <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
            </TabsContent>
            <TabsContent value="key-personnel" className="flex flex-col">
              <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
            </TabsContent>
            <TabsContent
              value="focus-documents"
              className="flex flex-col"
            >
              <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
