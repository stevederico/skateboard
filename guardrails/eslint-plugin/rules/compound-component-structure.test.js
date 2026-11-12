import rule from './compound-component-structure.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('compound-component-structure', rule, {
  valid: [
    `<Card className="@container/card">
      <CardHeader><CardDescription>Total Revenue</CardDescription><CardTitle>$1,250.00</CardTitle></CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm"><div>Trending up</div></CardFooter>
    </Card>`,
    '<Card>{children}</Card>',
    `<Dialog><DialogContent><DialogHeader><DialogTitle>T</DialogTitle><DialogDescription>D</DialogDescription></DialogHeader></DialogContent></Dialog>`,
    '<SheetContent aria-describedby={undefined}><SheetTitle>Filters</SheetTitle></SheetContent>',
    '<CommandDialog title="Command Menu" description="Search"><Command /></CommandDialog>',
    '<div className="grid gap-4"><Card><CardContent>a</CardContent></Card><Card><CardContent>b</CardContent></Card></div>',
  ],
  invalid: [
    { code: '<Card><p>Revenue</p></Card>', errors: [{ messageId: 'rawInCard' }] },
    { code: '<Card>Hello</Card>', errors: [{ messageId: 'rawInCard' }] },
    {
      code: '<Card><CardContent><Card><CardContent>x</CardContent></Card></CardContent></Card>',
      errors: [{ messageId: 'nestedCard' }],
    },
    {
      code: '<Dialog><DialogContent><DialogDescription>d</DialogDescription><Dialog /></DialogContent></Dialog>',
      errors: [{ messageId: 'nestedDialog' }],
    },
    {
      code: '<DialogContent><DialogHeader><DialogTitle>T</DialogTitle></DialogHeader></DialogContent>',
      errors: [{ messageId: 'missingDescription', data: { content: 'DialogContent', description: 'DialogDescription', file: 'dialog' } }],
    },
    {
      code: '<AlertDialogContent><AlertDialogTitle>Delete?</AlertDialogTitle></AlertDialogContent>',
      errors: [{ messageId: 'missingDescription', data: { content: 'AlertDialogContent', description: 'AlertDialogDescription', file: 'alert-dialog' } }],
    },
  ],
});
