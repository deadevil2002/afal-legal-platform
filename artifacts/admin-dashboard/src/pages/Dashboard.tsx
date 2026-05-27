import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, limit, getCountFromServer } from "firebase/firestore";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS, type AnyUserRole, type ProcurementRequest } from "@/types";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

interface DashboardData {
  totalUsers: number;
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  usersByRole: { name: string; value: number; color: string }[];
  requestsByCategory: { name: string; value: number; color: string }[];
  recentRequests: ProcurementRequest[];
}

// Generate colors for categories
const CATEGORY_COLORS = [
  "#2D6491", "#16A8BA", "#BC9B5D", "#112B4D", "#7C3AED", "#B45309"
];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        // 1. Total users
        const usersCountSnap = await getCountFromServer(collection(db, "users"));
        const totalUsers = usersCountSnap.data().count;

        // 2. Total requests
        const requestsCountSnap = await getCountFromServer(collection(db, "requests"));
        const totalRequests = requestsCountSnap.data().count;

        // 3. Pending requests
        const pendingCountSnap = await getCountFromServer(query(collection(db, "requests"), where("status", "==", "pending")));
        const pendingRequests = pendingCountSnap.data().count;

        // 4. Completed requests
        const completedCountSnap = await getCountFromServer(query(collection(db, "requests"), where("status", "==", "completed")));
        const completedRequests = completedCountSnap.data().count;

        // 5. Users by role
        const usersSnap = await getDocs(query(collection(db, "users"), limit(500)));
        const roleCounts: Record<string, number> = {};
        usersSnap.forEach((doc) => {
          const role = doc.data().role as AnyUserRole;
          if (role) {
            roleCounts[role] = (roleCounts[role] || 0) + 1;
          }
        });
        const usersByRole = Object.entries(roleCounts).map(([role, count]) => ({
          name: ROLE_LABELS[role as AnyUserRole] || role,
          value: count,
          color: ROLE_COLORS[role as AnyUserRole] || "#9CA3AF"
        }));

        // 6. Requests by category
        const reqsSnap = await getDocs(query(collection(db, "requests"), limit(500)));
        const catCounts: Record<string, number> = {};
        reqsSnap.forEach((doc) => {
          const cat = doc.data().category as string;
          if (cat) {
            catCounts[cat] = (catCounts[cat] || 0) + 1;
          }
        });
        const requestsByCategory = Object.entries(catCounts).map(([cat, count], i) => ({
          name: cat,
          value: count,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
        }));

        // 7. Recent requests
        const recentSnap = await getDocs(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(10)));
        const recentRequests = recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcurementRequest));

        setData({
          totalUsers,
          totalRequests,
          pendingRequests,
          completedRequests,
          usersByRole,
          requestsByCategory,
          recentRequests
        });
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        setError("Failed to load dashboard metrics. Please check your connection and try again.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (error) {
    return (
      <Layout>
        <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-destructive">Error Loading Dashboard</h3>
            <p className="text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">Live metrics and recent activity from the procurement platform.</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Users"
            value={data?.totalUsers}
            icon={<Users className="w-5 h-5 text-primary" />}
            loading={loading}
          />
          <MetricCard
            title="Total Requests"
            value={data?.totalRequests}
            icon={<FileText className="w-5 h-5 text-secondary" />}
            loading={loading}
          />
          <MetricCard
            title="Pending Requests"
            value={data?.pendingRequests}
            icon={<Clock className="w-5 h-5 text-accent" />}
            loading={loading}
          />
          <MetricCard
            title="Completed Requests"
            value={data?.completedRequests}
            icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
            loading={loading}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Users by Role</CardTitle>
              <CardDescription>Distribution of active users across departments</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {loading ? (
                <Skeleton className="w-full h-full rounded-md" />
              ) : data && data.usersByRole.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.usersByRole}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {data.usersByRole.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Requests by Category</CardTitle>
              <CardDescription>Volume of requests per category</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {loading ? (
                <Skeleton className="w-full h-full rounded-md" />
              ) : data && data.requestsByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.requestsByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {data.requestsByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>The 10 most recently created procurement requests</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : data && data.recentRequests.length > 0 ? (
              <div className="divide-y border rounded-md">
                {data.recentRequests.map(req => (
                  <div key={req.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{req.category}</span>
                        {req.prNumber && <Badge variant="outline" className="text-xs">{req.prNumber}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ID: <span className="font-mono">{req.id}</span>
                      </div>
                    </div>
                    <div>
                      <StatusBadge status={req.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground border rounded-md border-dashed">
                No recent activity found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function MetricCard({ title, value, icon, loading }: { title: string; value?: number; icon: React.ReactNode; loading: boolean }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-6 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-bold">{value?.toLocaleString() || "0"}</p>
          )}
        </div>
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    completed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    rejected: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
    under_review: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  };

  const defaultStyle = "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  const className = styles[status] || defaultStyle;

  return (
    <Badge variant="outline" className={`capitalize ${className}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
