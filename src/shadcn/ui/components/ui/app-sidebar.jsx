import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import constants from "@/constants.json";
import { DynamicIcon } from "lucide-react/dynamic";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarRail,
  SidebarMenuButton,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuItem,
  useSidebar
} from "@/shadcn/ui/components/ui/sidebar";

export function AppSidebar() {
  const {
    state,
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  } = useSidebar();
  const navigate = useNavigate();
  const [activeItem, setActiveItem] = useState(() => {
    return localStorage.getItem("activeItem") || "Main";
  });

  useEffect(() => {
    localStorage.setItem("activeItem", activeItem);
  }, [activeItem]);

  const handleNavigation = (url, title) => {
    setActiveItem(title);
    navigate(url);
  };

  return (
    <Sidebar collapsible="icon" >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="my-2 hover:bg-transparent !hover:bg-transparent"
            >
              <span>
                {open ? (
                  <>
                    <div className="bg-gray-800 rounded flex aspect-square size-6 items-center justify-center -ml-1">
                      <DynamicIcon name={constants.appIcon} size={18} color="white" strokeWidth={2} />
                    </div>
                    <span className="font-semibold ml-0">{constants.appName}</span>
                  </>
                ) : (
                  <div className="bg-gray-800 rounded flex aspect-square size-6  items-center justify-center -ml-1">
                    <DynamicIcon name="command" size={18} color="white" strokeWidth={2} />
                  </div>
                )}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {constants.pages.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className="cursor-pointer"
                    isActive={activeItem === item.title}
                    onClick={() => handleNavigation(`/app/${item.url.toLowerCase()}`, item.title)}
                  >
                    <span>
                      <DynamicIcon name={item.icon} strokeWidth={2} />
                      <span>{item.title}</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem key="Collapse">
            <SidebarMenuButton asChild>
              <div
                className="cursor-pointer"
                onClick={() => setOpen(!open)}
              >
                <DynamicIcon name="panel-left-close" />
                <span>Collapse</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem key="Settings">
            <SidebarMenuButton
              asChild
              className="cursor-pointer"
              isActive={activeItem === "Settings"}
              onClick={() => handleNavigation("/app/settings", "Settings")}
            >
              <span>
                <DynamicIcon name="settings" />
                <span>Settings</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
