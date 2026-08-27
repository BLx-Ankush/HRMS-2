import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Clock,
  Calendar,
  Palmtree,
  DollarSign,
  FileText,
  Settings,
  Bell,
} from "lucide-react";

const mainMenuItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave Approvals", icon: Calendar },
  { href: "/time-off", label: "Time Off", icon: Palmtree },
  { href: "/payroll", label: "Payroll", icon: DollarSign },
  { href: "/salary-info", label: "Salary Info", icon: FileText },
];

const settingsItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-sidebar-background border-r border-sidebar-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-4 pb-6">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">D</span>
          </div>
          <div>
            <span className="text-base font-display font-bold text-sidebar-foreground">
              Dayflow
            </span>
            <p className="text-[10px] text-muted-foreground -mt-0.5">HRMS Platform</p>
          </div>
        </Link>
      </div>

      {/* Main Menu */}
      <div className="flex-1 px-3 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
          Main Menu
        </p>
        <nav className="space-y-0.5">
          {mainMenuItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary ml-0"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Settings Section */}
        <div className="mt-6">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Settings
          </p>
          <nav className="space-y-0.5">
            {settingsItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* User Profile Section */}
      <div className="p-3 border-t border-sidebar-border">
        <Link
          to="/profile"
          className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
        >
          <Avatar className="h-8 w-8 border border-sidebar-border">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.name}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize">
              {user?.role}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
