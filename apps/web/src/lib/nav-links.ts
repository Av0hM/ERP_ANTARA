import {
  BarChart3,
  Bell,
  CalendarRange,
  FileText,
  LayoutDashboard,
  Network,
  Paperclip,
  RadioTower,
  ScrollText,
  Users,
} from "lucide-react";
import type { UiContext } from "@antara/contracts";
export const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Mission Tasks", icon: RadioTower },
  { href: "/subsystems", label: "Subsystems", icon: Network },
  { href: "/calendar", label: "Calendar / Meetings", icon: CalendarRange },
  { href: "/worklogs", label: "Worklogs", icon: ScrollText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/decisions", label: "Decisions", icon: FileText },
  { href: "/resources", label: "Resources", icon: Users },
  { href: "/files", label: "Files", icon: Paperclip },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
];
export function visibleNavLinks(data: UiContext) {
  return navLinks.filter(
    (link) =>
      (link.href !== "/resources" || data.permissions.viewResources) &&
      (link.href !== "/reports" || data.permissions.viewReports),
  );
}
