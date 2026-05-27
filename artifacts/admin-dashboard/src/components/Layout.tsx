import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { LayoutDashboard, Users, LogOut, ShieldAlert, GitBranch, Settings, UserPlus } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, profile, logout } = useAuth();
  const { t } = useLanguage();

  const navItems = [
    { href: "/",         labelKey: "nav.dashboard", icon: LayoutDashboard, match: ["/", "/dashboard"] },
    { href: "/users",    labelKey: "nav.users",     icon: Users,           match: ["/users"] },
    { href: "/add-user", labelKey: "nav.addUser",   icon: UserPlus,        match: ["/add-user"] },
    { href: "/workflow", labelKey: "nav.workflow",  icon: GitBranch,       match: ["/workflow"] },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shadow-lg shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border/50 shrink-0">
          <ShieldAlert className="w-6 h-6 text-sidebar-primary me-3 shrink-0" />
          <span className="font-bold tracking-wide text-sidebar-foreground truncate">AF Procurement Hub</span>
        </div>

        {/* Main nav */}
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
            {t("nav.superAdmin")}
          </div>
          <nav className="space-y-1">
            {navItems.map(({ href, labelKey, icon: Icon, match }) => {
              const active = match.includes(location);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom utility section */}
        <div className="p-4 border-t border-sidebar-border/50 space-y-2">
          {/* Settings link */}
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors w-full ${
              location === "/settings"
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            {t("nav.settings")}
          </Link>

          {/* User info */}
          <div className="px-2">
            <p className="text-xs text-sidebar-foreground/50 truncate" title={user?.email || ""}>
              {profile?.displayName || user?.email}
            </p>
            {profile?.role && (
              <p className="text-xs text-sidebar-primary font-medium capitalize">{profile.role.replace("_", " ")}</p>
            )}
          </div>

          {/* Sign out */}
          <button
            onClick={() => void logout()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive-foreground bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            {t("nav.signOut")}
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
