import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@stevederico/skateboard-ui/shadcn/ui/sidebar";

export default function NavSecondary({ items, ...props }) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <a href={item.url} className="cursor-pointer">
                  <DynamicIcon name={item.icon} size={18} strokeWidth={1.5} />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
