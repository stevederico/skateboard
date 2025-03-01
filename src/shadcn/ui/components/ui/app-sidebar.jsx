import { Calendar, Home, Inbox, Search, Settings, PanelLeftClose } from "lucide-react"

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

// Menu items.
const items = [
    {
        title: "Home",
        url: "/app/main",
        icon: Home,
    },
    {
        title: "Inbox",
        url: "/app/other",
        icon: Inbox,
    },
    {
        title: "Calendar",
        url: "/app/main",
        icon: Calendar,
    },
    {
        title: "Search",
        url: "/app/main",
        icon: Search,
    }
]

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
    return (
        <Sidebar collapsible={'icon'}   style={{
            "--sidebar-width": "12rem"
          }}>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild >
                                        <a href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

            </SidebarContent>
            <SidebarFooter>
                {/*  */}
                <SidebarMenu>
                    <SidebarMenuItem key={"Collapse"}>
                        <SidebarMenuButton asChild>
                            <div onClick={()=>{
                                setOpen(!open)
                            }}>
                                <PanelLeftClose />
                                <span>{"Collapse"}</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem key={"Settings"}>
                        <SidebarMenuButton asChild>
                            <a href={"/app/settings"}>
                                <Settings />
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
