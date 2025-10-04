import { useNavigate, useLocation } from "react-router-dom";
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@stevederico/skateboard-ui/shadcn/ui/sidebar";
import { CirclePlus, Mail } from 'lucide-react';

export default function NavMain({ items }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="cursor-pointer bg-black text-white hover:bg-black/90 hover:text-white active:bg-black/90 active:text-white dark:bg-white dark:text-black dark:hover:bg-white/90 dark:hover:text-black dark:active:bg-white/90 dark:active:text-black min-w-8 duration-200 ease-linear"
            >
              <CirclePlus className="fill-white dark:fill-black" />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="cursor-pointer size-8 group-data-[collapsible=icon]:opacity-0 border-sidebar-border"
              variant="outline"
            >
              <Mail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  onClick={() => navigate(item.url)}
                  isActive={isActive}
                  className="cursor-pointer"
                >
                  <DynamicIcon name={item.icon} size={18} strokeWidth={1.5} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
