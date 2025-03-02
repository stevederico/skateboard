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
    <Sidebar collapsible="icon" className="min-w-[40px]">
      <SidebarHeader className="p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <span>
              {open ? (
                <>
                  <div className="flex flex-row items-center m-2 mt-4">
                    <div className="bg-app dark:border rounded-lg flex aspect-square size-10 items-center justify-center">
                      <DynamicIcon name={constants.appIcon} size={24} color="white" strokeWidth={2} />
                    </div>
                    <div className="font-semibold ml-2 text-xl">{constants.appName}</div>
                  </div>
                </>
              ) : (
                <div className="flex flex-row items-center m-2 mt-3">
                  <div className="bg-app dark:border rounded-lg flex aspect-square size-8 items-center justify-center">
                    <DynamicIcon name={constants.appIcon} size={18} color="white" strokeWidth={2} />
                  </div>
                </div>
              )}
            </span>
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
                      <DynamicIcon name={item.icon} size={24} className="w-24 h-24" />
                      <span className="text-">{item.title}</span>
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
