import { useNavigate, useLocation } from "react-router-dom";
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
  useSidebar,
} from "@/shadcn/ui/components/ui/sidebar";

export function AppSidebar() {
  const { open, setOpen } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = (location.pathname.split("/")[2] || "").toLowerCase();

  const handleNavigation = (url) => {
    navigate(url);
  };

  return (
    <Sidebar collapsible="icon" className="min-w-[40px]">
      <SidebarHeader className="p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            {open ? (
              <div className="flex flex-row items-center m-2 mt-4">
                <div className="bg-app dark:border rounded-lg flex aspect-square size-10 items-center justify-center">
                  <DynamicIcon name={constants.appIcon} size={24} color="white" strokeWidth={2} />
                </div>
                <div className="font-semibold ml-2 text-xl">{constants.appName}</div>
              </div>
            ) : (
              <div className="flex flex-row items-center m-2 mt-3">
                <div className="bg-app dark:border rounded-lg flex aspect-square size-8 items-center justify-center">
                  <DynamicIcon name={constants.appIcon} size={18} color="white" strokeWidth={2} />
                </div>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {constants.pages.map((item) => {
                const isActive = currentPage === item.url.toLowerCase();
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className="cursor-pointer"
                      isActive={isActive}
                      onClick={() => handleNavigation(`/app/${item.url.toLowerCase()}`)}
                    >
                      <span>
                        <DynamicIcon name={item.icon} size={24} className="w-24 h-24" />
                        <span>{item.title}</span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem key="Collapse">
            <SidebarMenuButton asChild>
              <div className="cursor-pointer" onClick={() => setOpen(!open)}>
                <DynamicIcon name="panel-left-close" />
                <span>Collapse</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem key="Settings">
            <SidebarMenuButton
              asChild
              className="cursor-pointer"
              isActive={location.pathname.toLowerCase().includes("settings")}
              onClick={() => handleNavigation("/app/settings")}
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
