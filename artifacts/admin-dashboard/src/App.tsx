import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const queryClient = new QueryClient();

const Login          = lazy(() => import("@/pages/Login"));
const Dashboard      = lazy(() => import("@/pages/Dashboard"));
const Users          = lazy(() => import("@/pages/Users"));
const WorkflowMatrix = lazy(() => import("@/pages/WorkflowMatrix"));
const Settings       = lazy(() => import("@/pages/Settings"));
const NotFound       = lazy(() => import("@/pages/not-found"));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

function AccessDenied() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Restricted</h1>
        <p className="text-muted-foreground mb-2 text-sm">
          This dashboard is for Super Administrators only.
        </p>
        {user?.email && (
          <p className="text-xs text-muted-foreground mb-6">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        )}
        <button
          data-testid="button-signout"
          onClick={() => void logout()}
          className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, isSuperAdmin, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  if (!isSuperAdmin) return <AccessDenied />;

  return (
    <Switch>
      <Route path="/"          component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/users"     component={Users} />
      <Route path="/workflow"  component={WorkflowMatrix} />
      <Route path="/settings"  component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Suspense fallback={<LoadingScreen />}>
              <AppRoutes />
            </Suspense>
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
