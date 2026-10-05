import { BarChart3, CalendarRange, FileText, LayoutDashboard, RadioTower, ScrollText, Users } from "lucide-react";

export const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Mission Tasks", icon: RadioTower },
  { href: "/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/worklogs", label: "Worklogs", icon: ScrollText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/decisions", label: "Decisions", icon: FileText },
  { href: "/resources", label: "Resources", icon: Users },
];
