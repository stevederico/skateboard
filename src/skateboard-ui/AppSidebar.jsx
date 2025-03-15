import { useNavigate, useLocation } from "react-router-dom";
import constants from "@/constants.json";
import { DynamicIcon } from "lucide-react/dynamic"; // Verify this import
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarRail,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/shadcn/ui/components/ui/sidebar";

// Fallback DynamicIcon implementation if not already defined
const DynamicIconFallback = ({ name, size = 24, ...props }) => {
  const icons = require('lucide-react');
  const IconComponent = icons[name];
  return IconComponent ? <IconComponent size={size} {...props} /> : null;
};

// Use this if your DynamicIcon import isn't working
const DynamicIconComponent = DynamicIcon || DynamicIconFallback;

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
          <div className={`flex flex-row m-2 mt-3 items-center  ${open ? "" : "justify-center"}`}>
            <div className="bg-app dark:border rounded-lg flex aspect-square size-10 items-center justify-center">
              <DynamicIconComponent
                name={constants.appIcon}
                size={28}
                color="white"
                strokeWidth={2}
              />
            </div>
            {open && <div className="font-semibold ml-2 text-xl">{constants.appName}</div>}
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ul className={`flex flex-col gap-2 p-2 ${open ? "" : "items-center"}`}>
          {constants.pages.map((item) => {
            const isActive = currentPage === item.url.toLowerCase();
            return (
              <li key={item.title}>
                <div
                  className={`cursor-pointer items-center flex w-full p-2 rounded-lg ${open ? "h-10" : "h-10 w-8"} ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent  hover:text-sidebar-accent-foreground"}`}
                  onClick={() => handleNavigation(`/app/${item.url.toLowerCase()}`)}
                >
                  <span className="flex  w-full">
                    <DynamicIconComponent
                      name={item.icon}
                      size={24}
                      strokeWidth={1.5}
                      className={"!size-6"}
                    />
                    {open && <span className="ml-2">{item.title}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </SidebarContent>
      <SidebarFooter>
        <ul className={`flex flex-col gap-1  ${open ? "" : "items-center"}`}>
          <li>
            <div
              className={`cursor-pointer flex w-full p-2 ${open ? "h-10" : "h-10 w-8"}`}
              onClick={() => setOpen(!open)}
            >
              <span className="flex w-full items-center">
                <DynamicIconComponent
                  name="panel-left-close"
                  size={18}
                  strokeWidth={1.5}
                  className={"!size-5"}
                />
                {open && <span className="ml-2 text-sm">Collapse</span>}
              </span>
            </div>
          </li>
          <li>
            <div
              className={`cursor-pointer items-center rounded-lg flex w-full p-2 ${open ? "h-10" : "h-10 w-8"} 
              ${location.pathname.toLowerCase().includes("settings") ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent  hover:text-sidebar-accent-foreground"}`}
              onClick={() => handleNavigation("/app/settings")}
            >
              <span className="flex  w-full items-center">
                <DynamicIconComponent
                  name="settings"
                  size={18}
                  strokeWidth={1.5}
                  className={"!size-5 "}
                />
                {open && <span className="ml-2 text-sm">Settings</span>}
              </span>
            </div>
          </li>
        </ul>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}