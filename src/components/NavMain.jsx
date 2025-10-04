import { useNavigate, useLocation } from "react-router-dom";
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@stevederico/skateboard-ui/shadcn/ui/sidebar";

export default function NavMain({ items }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
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
