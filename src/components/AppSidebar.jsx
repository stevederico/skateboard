import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import constants from "../constants.json";
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import NavMain from './NavMain';
import NavDocuments from './NavDocuments';
import NavSecondary from './NavSecondary';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarFooter,
  SidebarHeader,
} from "@stevederico/skateboard-ui/shadcn/ui/sidebar";
import { Avatar, AvatarFallback } from "@stevederico/skateboard-ui/shadcn/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@stevederico/skateboard-ui/shadcn/ui/dropdown-menu";
import { getState } from '../context.jsx';
import { MoreVertical, HelpCircle, Settings, LogOut } from 'lucide-react';

export default function AppSidebar({ ...props }) {
  const navigate = useNavigate();
  const { state } = getState();
  const user = state.user || {};

  const navItems = constants.pages.map(page => ({
    title: page.title,
    url: `/app/${page.url.toLowerCase()}`,
    icon: page.icon
  }));

  const documentItems = [
    { name: 'Data Library', url: '#', icon: 'database' },
    { name: 'Reports', url: '#', icon: 'file-text' },
    { name: 'Word Assistant', url: '#', icon: 'file' },
  ];

  const secondaryItems = [];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/app" className="cursor-pointer">
                <div className="flex aspect-square size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <DynamicIcon
                    name={constants.appIcon}
                    size={14}
                    strokeWidth={2}
                  />
                </div>
                <span className="text-base font-semibold">{constants.appName}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
        <NavDocuments items={documentItems} />
        <NavSecondary items={secondaryItems} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {user.name ? user.name.substring(0, 1).toUpperCase() : user.email ? user.email.substring(0, 1).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium capitalize">{user.name || 'User'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email || ''}
                    </span>
                  </div>
                  <MoreVertical className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side="right"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                        {user.name ? user.name.substring(0, 1).toUpperCase() : user.email ? user.email.substring(0, 1).toUpperCase() : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium capitalize">{user.name || 'User'}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email || ''}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/app/settings')} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Get Help
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/signin')} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
