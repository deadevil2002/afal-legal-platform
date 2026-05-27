import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Users, LogOut, ShieldAlert } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shadow-lg">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border/50">
          <ShieldAlert className="w-6 h-6 text-sidebar-primary mr-3" />
          <span className="font-bold tracking-wide text-sidebar-foreground">AF Procurement Hub</span>
        </div>
        <div className="p-4 flex-1">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
            Super Admin
          </div>
          <nav className="space-y-1">
            <Link
              href="/"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location === "/" || location === "/dashboard"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
              data-testid="nav-dashboard"
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </Link>
            <Link
              href="/users"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                location === "/users"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
              data-testid="nav-users"
            >
              <Users className="w-5 h-5" />
              Users
            </Link>
          </nav>
        </div>
        <div className="p-4 border-t border-sidebar-border/50">
          <div className="px-2 mb-3">
            <p className="text-sm font-medium truncate text-sidebar-foreground" title={user?.email || ""}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => void logout()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive-foreground bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
