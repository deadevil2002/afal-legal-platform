import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit, getCountFromServer, where } from "firebase/firestore";
import Layout from "@/components/Layout";
import { useLanguage } from "@/context/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS, type AnyUserRole } from "@/types";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

const COLLECTION = "procurement_requests";

interface DashboardRequest {
  id: string;
  status: string;
  category: string;
  title?: string;
  requestNumber?: string | null;
  createdByName?: string;
  createdAt?: unknown;
  prNumber?: string | null;
  isTerminated?: boolean;
}

interface DashboardData {
  totalUsers: number;
  totalRequests: number;
  activeRequests: number;
  completedRequests: number;
  terminatedRequests: number;
  usersByRole: { name: string; value: number; color: string }[];
  requestsByCategory: { name: string; value: number; color: string }[];
  recentRequests: DashboardRequest[];
}

const CATEGORY_COLORS = ["#2D6491", "#16A8BA", "#BC9B5D", "#112B4D", "#7C3AED", "#B45309"];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const usersCountSnap = await getCountFromServer(collection(db, "users"));
        const totalUsers = usersCountSnap.data().count;

        const totalSnap = await getCountFromServer(collection(db, COLLECTION));
        const totalRequests = totalSnap.data().count;

        const completedSnap = await getCountFromServer(
          query(collection(db, COLLECTION), where("status", "==", "closed"))
        );
        const completedRequests = completedSnap.data().count;

        const terminatedSnap = await getCountFromServer(
          query(collection(db, COLLECTION), where("status", "==", "terminated"))
        );
        const terminatedRequests = terminatedSnap.data().count;

        const activeRequests = totalRequests - completedRequests - terminatedRequests;

        const usersSnap = await getDocs(query(collection(db, "users"), limit(500)));
        const roleCounts: Record<string, number> = {};
        usersSnap.forEach((d) => {
          const role = d.data().role as AnyUserRole;
          if (role) roleCounts[role] = (roleCounts[role] || 0) + 1;
        });
        const usersByRole = Object.entries(roleCounts).map(([role, count]) => ({
          name: ROLE_LABELS[role as AnyUserRole] || role,
          value: count,
          color: ROLE_COLORS[role as AnyUserRole] || "#9CA3AF",
        }));

        const reqsSnap = await getDocs(query(collection(db, COLLECTION), limit(500)));
        const catCounts: Record<string, number> = {};
        reqsSnap.forEach((d) => {
          const cat = d.data().category as string;
          if (cat) catCounts[cat] = (catCounts[cat] || 0) + 1;
        });
        const requestsByCategory = Object.entries(catCounts).map(([cat, count], i) => ({
          name: cat,
          value: count,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        }));

        const recentSnap = await getDocs(
          query(collection(db, COLLECTION), orderBy("createdAt", "desc"), limit(10))
        );
        const recentRequests = recentSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DashboardRequest));

        setData({ totalUsers, totalRequests, activeRequests, completedRequests, terminatedRequests, usersByRole, requestsByCategory, recentRequests });
      } catch (err) {
        console.error("[Dashboard] Error loading data:", err);
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
            <h3 className="text-lg font-semibold text-destructive">{t("common.error")}</h3>
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
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title={t("dashboard.totalUsers")}     value={data?.totalUsers}        icon={<Users        className="w-5 h-5 text-primary"    />} loading={loading} />
          <MetricCard title={t("dashboard.totalRequests")}  value={data?.totalRequests}     icon={<FileText     className="w-5 h-5 text-secondary"  />} loading={loading} />
          <MetricCard title={t("dashboard.activeRequests")} value={data?.activeRequests}    icon={<Clock        className="w-5 h-5 text-accent"     />} loading={loading} />
          <MetricCard title={t("dashboard.closedRequests")} value={data?.completedRequests} icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} loading={loading} />
        </div>

        {/* Secondary KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-sm border-l-4 border-l-red-400">
            <CardContent className="p-4 flex items-center gap-4">
              <XCircle className="w-8 h-8 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t("dashboard.terminated")}</p>
                {loading ? <Skeleton className="h-7 w-12 mt-1" /> : (
                  <p className="text-2xl font-bold">{data?.terminatedRequests ?? 0}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-l-amber-400 col-span-1 sm:col-span-2">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{t("dashboard.requestCategories")}</p>
              {loading ? <Skeleton className="h-5 w-48" /> : (
                <div className="flex flex-wrap gap-2">
                  {data?.requestsByCategory.map((c, i) => (
                    <Badge key={i} variant="outline" style={{ borderColor: c.color, color: c.color }}>
                      {c.name}: {c.value}
                    </Badge>
                  ))}
                  {(!data || data.requestsByCategory.length === 0) && (
                    <span className="text-sm text-muted-foreground">{t("dashboard.noData")}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t("dashboard.usersByRole")}</CardTitle>
              <CardDescription>{t("dashboard.usersDistribution")}</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {loading ? (
                <Skeleton className="w-full h-full rounded-md" />
              ) : data && data.usersByRole.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.usersByRole} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {data.usersByRole.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">{t("dashboard.noData")}</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t("dashboard.requestsByCategory")}</CardTitle>
              <CardDescription>{t("dashboard.volumePerCategory")}</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {loading ? (
                <Skeleton className="w-full h-full rounded-md" />
              ) : data && data.requestsByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.requestsByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {data.requestsByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">{t("dashboard.noData")}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
            <CardDescription>{t("dashboard.recentActivityDesc")}</CardDescription>
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
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{req.title || req.category || "—"}</span>
                        {req.requestNumber && <Badge variant="outline" className="text-xs shrink-0">{req.requestNumber}</Badge>}
                        {req.category && <Badge variant="secondary" className="text-xs shrink-0">{req.category}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("dashboard.by")}: {req.createdByName || "—"} &nbsp;·&nbsp; ID: <span className="font-mono">{req.id.slice(0, 8)}…</span>
                      </div>
                    </div>
                    <div className="ms-4 shrink-0">
                      <StatusBadge status={req.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground border rounded-md border-dashed">
                {t("dashboard.noActivity")}
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
          {loading ? <Skeleton className="h-8 w-16" /> : (
            <p className="text-3xl font-bold">{value?.toLocaleString() ?? "0"}</p>
          )}
        </div>
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">{icon}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft:                        "bg-slate-100 text-slate-700 border-slate-200",
    pending_procurement:          "bg-amber-100 text-amber-800 border-amber-200",
    awaiting_quotations:          "bg-blue-100 text-blue-800 border-blue-200",
    quotations_received:          "bg-cyan-100 text-cyan-800 border-cyan-200",
    pending_requester_selection:  "bg-violet-100 text-violet-800 border-violet-200",
    quotation_rejected:           "bg-red-100 text-red-800 border-red-200",
    pending_pr_entry:             "bg-orange-100 text-orange-800 border-orange-200",
    pending_budget_approval:      "bg-yellow-100 text-yellow-800 border-yellow-200",
    pending_po:                   "bg-teal-100 text-teal-800 border-teal-200",
    pending_director_po_approval: "bg-indigo-100 text-indigo-800 border-indigo-200",
    pending_planning_po_approval: "bg-purple-100 text-purple-800 border-purple-200",
    pending_payment:              "bg-pink-100 text-pink-800 border-pink-200",
    closed:                       "bg-green-100 text-green-800 border-green-200",
    terminated:                   "bg-red-200 text-red-900 border-red-300",
  };
  return (
    <Badge variant="outline" className={`text-xs capitalize whitespace-nowrap ${styles[status] || "bg-slate-100 text-slate-700"}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
