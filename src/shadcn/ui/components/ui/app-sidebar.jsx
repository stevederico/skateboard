import { useState, useEffect } from "react";
import constants from "@/constants.json";
import { DynamicIcon } from 'lucide-react/dynamic';

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarRail,
    SidebarMenuButton,
    SidebarFooter,
    SidebarMenuItem,
    useSidebar
} from "@/shadcn/ui/components/ui/sidebar"

export function AppSidebar() {
    const {
        state,
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
    } = useSidebar()
    const [activeItem, setActiveItem] = useState(() => {
        return localStorage.getItem("activeItem") || "Main";
      });

      useEffect(() => {
        localStorage.setItem("activeItem", activeItem);
      }, [activeItem]);


    return (
        <Sidebar collapsible={'icon'} style={{
            "--sidebar-width": "12rem"
        }}>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {constants.pages.map((item) => {

                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton asChild isActive={activeItem === item.title}
                                            onClick={() => setActiveItem(item.title)}>
                                            <a href={`/app/${item.url.toLowerCase()}`}>
                                                <DynamicIcon name={item.icon} />
                                                <span>{item.title}</span>
                                            </a>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                {/*  */}
                <SidebarMenu>
                    <SidebarMenuItem key={"Collapse"}>
                        <SidebarMenuButton asChild>
                            <div className="cursor-pointer" onClick={() => {
                                setOpen(!open)
                            }}>
                                <DynamicIcon name={"panel-left-close"} />
                                <span>{"Collapse"}</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem key={"Settings"}>
                        <SidebarMenuButton asChild isActive={activeItem === "Settings"} onClick={() => setActiveItem("Settings")}>
                            <a href={"/app/settings"} >
                                <DynamicIcon name={"settings"} />
                                <span>{"Settings"}</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>

            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
