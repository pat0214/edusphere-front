"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, CircleDollarSign, Search, ShieldCheck, Sparkles, UserRoundCheck, UserRoundX,
} from "lucide-react";
import { ActivityArea } from "@/components/Charts";
import { SphereLoader } from "@/components/Logo";
import { PageHeader, SectionTitle, SkillBar, StatCard } from "@/components/ui";
import { toast } from "@/components/Toasts";
import { fmtDate, useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/components/Shell";

type AdminUser = {
  id: string; name: string; email: string; role: string; active: boolean;
  xp: number; level: number; createdAt: string;
};
type AdminUsers = {
  rows: AdminUser[];
  counts: { role: string; count: number }[];
};
type AdminAnalytics = {
  users: {
    total: number; active: number; inactive: number; students: number; instructors: number; admins: number;
    verified: number; newUsers7d: number; newUsers28d: number; totalXp: number; averageXp: number;
    roles: { role: string; count: number }[];
  };
  activity: { date: string; signups: number; lessons: number; runs: number }[];
  learning: {
    enrollments: number; codeRuns: number; lessonsCompleted: number; peerReviewsSubmitted: number;
    peerReviewsPending: number; assignmentAttempts: number; assignmentAverageScore: number;
    lateAttempts: number; perfectAssignmentAttempts: number;
  };
  content: {
    courses: number; publishedCourses: number; lessons: number; exercises: number;
    assignments: number; publishedAssignments: number; certificates: number; badges: number;
  };
  revenue: {
    currencies: { currency: string; paidCents: number; paidTransactions: number; demoTransactions: number }[];
    activeSubscriptions: number;
    recent: { id: string; amountCents: number; currency: string; status: string; createdAt: string; userName: string; userEmail: string }[];
  };
  mastery: { skill: string; averageScore: number; learnerCount: number }[];
  topLearners: { id: string; name: string; email: string; xp: number; level: number; lessons: number; certificates: number; badges: number }[];
  popularCourses: { id: string; title: string; published: boolean; enrollments: number; lessons: number; certificates: number }[];
};
type AiTutorSettings = {
  enabled: boolean;
  dailyCredits: number;
  costs: { hint: number; error: number; concept: number; pseudocode: number; solution: number };
  model: string;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};
type AiTutorAdminData = {
  settings: AiTutorSettings;
  usage: {
    totalRequests: number; creditsUsed: number; inputTokens: number; outputTokens: number;
    estimatedCostUsd: number; requestsLast30Days: number;
    features: { action: string; requests: number; credits: number }[];
  };
};
type ClassroomPlatformSettings = {
  classroomsEnabled: boolean;
  liveSessionsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  maxStudentsPerClassroom: number;
  maxLiveSessionMinutes: number;
  provider: "public" | "self_hosted" | "jaas";
  domain: string;
  jitsiConfigured: boolean;
};
type ClassroomAdminData = {
  settings: ClassroomPlatformSettings;
  usage: { activeClassrooms: number; activeMemberships: number; pendingRequests: number; liveSessions: number; endedSessions: number; joinClicks: number };
  emailQueue: { pending: number; processing: number; sent: number; failed: number; cancelled: number } | null;
  classrooms: { id: string; name: string; subject: string; status: string; teacherName: string; studentCount: number; pendingCount: number; createdAt: string }[];
};

const number = (value: number) => value.toLocaleString();
const adminSections = ["overview", "activity", "learning", "mastery", "reviews", "courses", "payments", "ai", "classrooms", "users"];
const percent = (part: number, total: number) => total ? Math.round((part / total) * 100) : 0;
const money = (cents: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: "currency", currency, maximumFractionDigits: 0,
}).format(cents / 100);

export default function AdminPage() {
  const { ready } = useRequireAuth("admin");
  const [activeSection, setActiveSection] = useState("overview");
  const users = useApi<AdminUsers>(ready ? "/api/v1/admin/users" : null);
  const analytics = useApi<AdminAnalytics>(ready ? "/api/v1/admin/analytics" : null);
  const aiTutor = useApi<AiTutorAdminData>(ready && activeSection === "ai" ? "/api/v1/admin/ai-tutor" : null);
  const classroomAdmin = useApi<ClassroomAdminData>(ready && activeSection === "classrooms" ? "/api/v1/admin/classroom-settings" : null);
  const [aiForm, setAiForm] = useState<AiTutorSettings | null>(null);
  const [classroomForm, setClassroomForm] = useState<ClassroomPlatformSettings | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [savingClassroom, setSavingClassroom] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const syncSection = () => {
      const section = window.location.hash.slice(1);
      setActiveSection(adminSections.includes(section) ? section : "overview");
    };
    syncSection();
    window.addEventListener("hashchange", syncSection);
    window.addEventListener("popstate", syncSection);
    return () => {
      window.removeEventListener("hashchange", syncSection);
      window.removeEventListener("popstate", syncSection);
    };
  }, []);

  useEffect(() => {
    if (aiTutor.data) setAiForm(aiTutor.data.settings);
  }, [aiTutor.data]);
  useEffect(() => {
    if (classroomAdmin.data) setClassroomForm(classroomAdmin.data.settings);
  }, [classroomAdmin.data]);

  const filteredUsers = useMemo(() => (users.data?.rows ?? []).filter((user) => {
    const matchesQuery = `${user.name} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? user.active : !user.active);
    return matchesQuery && matchesRole && matchesStatus;
  }), [users.data?.rows, query, roleFilter, statusFilter]);

  if (!ready || users.loading || analytics.loading) return <SphereLoader label="Loading admin analytics" />;
  if (!users.data || !analytics.data) {
    return <p className="text-muted">{users.error ?? analytics.error ?? "Admin data is unavailable."}</p>;
  }

  const d = users.data;
  const a = analytics.data;
  const activationRate = percent(a.users.active, a.users.total);
  const verificationRate = percent(a.users.verified, a.users.total);
  const activityTotals = a.activity.reduce((totals, day) => ({
    signups: totals.signups + day.signups,
    lessons: totals.lessons + day.lessons,
    runs: totals.runs + day.runs,
  }), { signups: 0, lessons: 0, runs: 0 });
  const averageMastery = a.mastery.length
    ? Math.round(a.mastery.reduce((sum, skill) => sum + skill.averageScore, 0) / a.mastery.length)
    : 0;

  const toggle = async (id: string, active: boolean) => {
    setBusyId(id);
    const res = await api.patch("/api/v1/admin/users", { id, active: !active });
    setBusyId(null);
    if (!res.success) { toast.err(res.message); return; }
    toast.ok(res.message);
    void users.refetch();
    void analytics.refetch();
  };

  const saveAiSettings = async () => {
    if (!aiForm) return;
    setSavingAi(true);
    const response = await api.patch<AiTutorAdminData>("/api/v1/admin/ai-tutor", aiForm);
    setSavingAi(false);
    if (!response.success) { toast.err(response.message); return; }
    setAiForm(response.data.settings);
    aiTutor.setData(response.data);
    toast.ok(response.message);
  };
  const saveClassroomSettings = async () => {
    if (!classroomForm) return;
    setSavingClassroom(true);
    const response = await api.patch<ClassroomAdminData>("/api/v1/admin/classroom-settings", classroomForm);
    setSavingClassroom(false);
    if (!response.success) { toast.err(response.message); return; }
    setClassroomForm(response.data.settings);
    classroomAdmin.setData(response.data);
    toast.ok(response.message);
  };
  const setClassroomStatus = async (id: string, status: "active" | "archived" | "deleted") => {
    if (status === "deleted" && !window.confirm("Remove this classroom from teacher and student views? It can still be restored by an administrator.")) return;
    const response = await api.patch(`/api/v1/admin/classrooms/${id}`, { status });
    if (!response.success) { toast.err(response.message); return; }
    toast.ok(response.message);
    void classroomAdmin.refetch();
  };

  return (
    <div className="space-y-9">
      <PageHeader
        title="Admin console"
        sub="A detailed view of platform growth, learning activity, content, outcomes, and account health."
      />

      {activeSection === "overview" && <section id="overview">
        <SectionTitle title="Platform at a glance" sub="Current totals with recent growth and engagement." />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="Registered users" value={number(a.users.total)} sub={`+${number(a.users.newUsers7d)} in the last 7 days`} accent="var(--primary)" />
          <StatCard label="Active accounts" value={`${activationRate}%`} sub={`${number(a.users.active)} active · ${number(a.users.inactive)} deactivated`} accent="var(--mint)" />
          <StatCard label="Course enrollments" value={number(a.learning.enrollments)} sub={`${number(a.content.publishedCourses)} published courses`} accent="var(--amber)" />
          <StatCard label="Active subscriptions" value={number(a.revenue.activeSubscriptions)} sub={`${number(a.revenue.currencies.reduce((sum, row) => sum + row.paidTransactions, 0))} paid transactions`} accent="var(--coral)" />
        </div>
      </section>}

      {activeSection === "classrooms" && <section id="classrooms" className="space-y-5">
        <SectionTitle title="Classroom platform" sub="Feature switches and safety limits apply on the backend, not only in the interface." />
        {classroomAdmin.loading && <SphereLoader label="Loading classroom settings" />}
        {classroomAdmin.error && <div className="card p-4 text-sm text-coral">{classroomAdmin.error}</div>}
        {classroomAdmin.data && classroomForm && <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label="Active classrooms" value={number(classroomAdmin.data.usage.activeClassrooms)} />
            <StatCard label="Active memberships" value={number(classroomAdmin.data.usage.activeMemberships)} accent="var(--mint)" />
            <StatCard label="Pending approvals" value={number(classroomAdmin.data.usage.pendingRequests)} accent="var(--amber)" />
            <StatCard label="Live sessions" value={number(classroomAdmin.data.usage.liveSessions)} accent="var(--coral)" />
          </div>
          <div className="card p-5 space-y-4">
            <label className="flex items-center justify-between gap-4 text-sm"><span>Enable subject classrooms</span><input type="checkbox" className="accent-primary size-4" checked={classroomForm.classroomsEnabled} onChange={(event) => setClassroomForm({ ...classroomForm, classroomsEnabled: event.target.checked })} /></label>
            <label className="flex items-center justify-between gap-4 text-sm"><span>Enable Jitsi live sessions</span><input type="checkbox" className="accent-primary size-4" checked={classroomForm.liveSessionsEnabled} onChange={(event) => setClassroomForm({ ...classroomForm, liveSessionsEnabled: event.target.checked })} /></label>
            <label className="flex items-center justify-between gap-4 text-sm"><span>Enable notification email delivery</span><input type="checkbox" className="accent-primary size-4" checked={classroomForm.emailNotificationsEnabled} onChange={(event) => setClassroomForm({ ...classroomForm, emailNotificationsEnabled: event.target.checked })} /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-muted">Jitsi provider
                <select className="input mt-1" value={classroomForm.provider} onChange={(event) => {
                  const provider = event.target.value as ClassroomPlatformSettings["provider"];
                  setClassroomForm({ ...classroomForm, provider, domain: provider === "jaas" ? "8x8.vc" : provider === "public" ? "meet.jit.si" : classroomForm.domain });
                }}>
                  <option value="jaas">JaaS (8x8)</option>
                  <option value="self_hosted">Self-hosted Jitsi with JWT</option>
                  <option value="public">Public meet.jit.si</option>
                </select>
              </label>
              {classroomForm.provider === "self_hosted" && <label className="text-xs text-muted">Self-hosted domain
                <input className="input mt-1" value={classroomForm.domain} onChange={(event) => setClassroomForm({ ...classroomForm, domain: event.target.value })} placeholder="meet.example.edu" />
              </label>}
            </div>
            <p className="text-xs text-muted">
              {classroomForm.provider === "public"
                ? "Warning: public Jitsi rooms rely on an unguessable room name and require the room creator to authenticate with a supported account. meet.jit.si currently limits meetings to 95 minutes."
                : classroomForm.jitsiConfigured
                  ? `Jitsi provider credentials are configured for ${classroomForm.provider}.`
                  : `Jitsi credentials are not configured. Add the required server-side credentials in Render; they are never shown in this dashboard.`}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-muted">Maximum students per classroom<input className="input mt-1" type="number" min={1} max={5000} value={classroomForm.maxStudentsPerClassroom} onChange={(event) => setClassroomForm({ ...classroomForm, maxStudentsPerClassroom: Number(event.target.value) })} /></label>
              <label className="text-xs text-muted">Maximum live-session duration (minutes)<input className="input mt-1" type="number" min={10} max={240} value={classroomForm.maxLiveSessionMinutes} onChange={(event) => setClassroomForm({ ...classroomForm, maxLiveSessionMinutes: Number(event.target.value) })} /></label>
            </div>
            <button className="btn btn-primary" disabled={savingClassroom} onClick={() => void saveClassroomSettings()}>{savingClassroom ? "Saving…" : "Save classroom settings"}</button>
          </div>
          <div className="card p-5">
            <SectionTitle title="Email queue" sub="Queue delivery and retries are handled by the configured Render Cron Job." />
            {classroomAdmin.data.emailQueue ? <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {Object.entries(classroomAdmin.data.emailQueue).map(([status, count]) => <div key={status} className="rounded-xl bg-raised p-3"><p className="eyebrow">{status}</p><p className="display text-xl font-bold mt-1">{number(count)}</p></div>)}
            </div> : <p className="text-sm text-muted">Apply migration 008 to enable queued email monitoring.</p>}
            <p className="text-xs text-muted mt-4">{number(classroomAdmin.data.usage.joinClicks)} recorded join events. Attendance is labeled as joined through EduSphere, not independently verified.</p>
          </div>
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-line"><SectionTitle title="Classroom management" sub="Latest 200 classrooms, including archived or removed records." /></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead><tr className="text-left text-muted text-[11px] border-b border-line"><th className="px-5 py-3 font-normal">Classroom</th><th className="px-3 py-3 font-normal">Teacher</th><th className="px-3 py-3 font-normal">Students</th><th className="px-3 py-3 font-normal">Status</th><th className="px-5 py-3 font-normal">Actions</th></tr></thead>
                <tbody>{classroomAdmin.data.classrooms.map((classroom) => <tr key={classroom.id} className="border-b border-line/50 last:border-0">
                  <td className="px-5 py-3"><p className="font-medium">{classroom.name}</p><p className="text-xs text-muted">{classroom.subject}</p></td>
                  <td className="px-3 py-3">{classroom.teacherName}</td>
                  <td className="px-3 py-3 font-mono">{classroom.studentCount}{classroom.pendingCount ? ` · ${classroom.pendingCount} pending` : ""}</td>
                  <td className="px-3 py-3 capitalize">{classroom.status}</td>
                  <td className="px-5 py-3"><div className="flex gap-2">
                    {classroom.status === "deleted" ? <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => void setClassroomStatus(classroom.id, "active")}>Restore</button> : <>
                      <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => void setClassroomStatus(classroom.id, classroom.status === "active" ? "archived" : "active")}>{classroom.status === "active" ? "Archive" : "Reactivate"}</button>
                      <button className="btn btn-ghost !px-2 !py-1.5 text-coral" onClick={() => void setClassroomStatus(classroom.id, "deleted")}>Remove</button>
                    </>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
            {classroomAdmin.data.classrooms.length === 0 && <p className="p-5 text-sm text-muted">No classrooms have been created.</p>}
          </div>
        </>}
      </section>}

      {activeSection === "activity" && <section id="activity" className="grid xl:grid-cols-[1.6fr_1fr] gap-4">
        <div className="card p-5 md:p-6">
          <SectionTitle title="Platform activity" sub="Daily registrations, lesson completions, and code runs over the last 28 days." />
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4 text-xs text-muted font-mono">
            <span><i className="inline-block w-2 h-2 rounded-full bg-primary mr-2" />{number(activityTotals.signups)} signups</span>
            <span><i className="inline-block w-2 h-2 rounded-full bg-mint mr-2" />{number(activityTotals.lessons)} lessons</span>
            <span><i className="inline-block w-2 h-2 rounded-full bg-amber mr-2" />{number(activityTotals.runs)} code runs</span>
          </div>
          <ActivityArea data={a.activity} height={180} />
          <p className="text-[11px] text-muted mt-2">The chart tracks lessons completed and code runs; signups are summarized above.</p>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <SectionTitle title="Account health" sub="Role mix and verification." />
            <div className="space-y-4">
              {[
                { label: "Students", count: a.users.students, color: "var(--primary)" },
                { label: "Instructors", count: a.users.instructors, color: "var(--mint)" },
                { label: "Administrators", count: a.users.admins, color: "var(--amber)" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span>{row.label}</span><span className="font-mono text-muted">{number(row.count)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-raised overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${percent(row.count, a.users.total)}%`, background: row.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t border-line">
              <div><p className="eyebrow">Verified email</p><p className="display text-2xl font-bold mt-1">{verificationRate}%</p><p className="text-xs text-muted">{number(a.users.verified)} accounts</p></div>
              <div><p className="eyebrow">New this month</p><p className="display text-2xl font-bold mt-1">{number(a.users.newUsers28d)}</p><p className="text-xs text-muted">last 28 days</p></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total XP awarded" value={number(a.users.totalXp)} sub={`${number(a.users.averageXp)} average per account`} />
            <StatCard label="Average mastery" value={`${averageMastery}%`} sub={`${a.mastery.length} measured skills`} accent="var(--mint)" />
          </div>
        </div>
      </section>}

      {activeSection === "learning" && <section id="learning">
        <SectionTitle title="Learning and content" sub="Inventory, participation, review workload, and assessment outcomes." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="Lessons completed" value={number(a.learning.lessonsCompleted)} sub="Across all learner accounts" />
          <StatCard label="Code runs" value={number(a.learning.codeRuns)} sub="Last 28 days" accent="var(--mint)" />
          <StatCard label="Assignment attempts" value={number(a.learning.assignmentAttempts)} sub={`${number(a.learning.perfectAssignmentAttempts)} perfect-score attempts`} accent="var(--amber)" />
          <StatCard label="Average assignment score" value={`${a.learning.assignmentAverageScore}%`} sub={`${number(a.learning.lateAttempts)} late attempts`} accent="var(--coral)" />
          <StatCard label="Course catalog" value={number(a.content.courses)} sub={`${number(a.content.publishedCourses)} published`} />
          <StatCard label="Lessons and exercises" value={number(a.content.lessons + a.content.exercises)} sub={`${number(a.content.lessons)} lessons · ${number(a.content.exercises)} exercises`} accent="var(--mint)" />
          <StatCard label="Published assignments" value={`${number(a.content.publishedAssignments)} / ${number(a.content.assignments)}`} sub="Available to learners" accent="var(--amber)" />
          <StatCard label="Credentials issued" value={number(a.content.certificates)} sub={`${number(a.content.badges)} badge types`} accent="var(--coral)" />
        </div>
      </section>}

      {(activeSection === "mastery" || activeSection === "reviews") && <section className="grid gap-4">
        {activeSection === "mastery" && <div id="mastery" className="card p-5 md:p-6">
          <SectionTitle title="Skill mastery" sub="Average latest assessment score across learners." />
          {a.mastery.length ? (
            <div className="space-y-4">
              {a.mastery.map((skill) => (
                <div key={skill.skill}>
                  <SkillBar name={skill.skill} value={skill.averageScore} color={skill.averageScore < 40 ? "var(--coral)" : "var(--primary)"} />
                  <p className="text-[11px] text-muted mt-1">{number(skill.learnerCount)} learners measured</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted py-8 text-center">No placement measurements yet.</p>}
        </div>}
        {activeSection === "reviews" && <div id="reviews" className="card p-5 md:p-6">
          <SectionTitle title="Peer review operations" sub="Current queue volume and completed reviews." />
          <div className="grid grid-cols-2 gap-3">
            <div className="card-raise p-4"><p className="eyebrow">Waiting for review</p><p className="display text-3xl font-bold mt-2">{number(a.learning.peerReviewsPending)}</p><p className="text-xs text-muted mt-1">pending assignments</p></div>
            <div className="card-raise p-4"><p className="eyebrow">Reviews submitted</p><p className="display text-3xl font-bold mt-2">{number(a.learning.peerReviewsSubmitted)}</p><p className="text-xs text-muted mt-1">completed assignments</p></div>
          </div>
          <div className="mt-5 rounded-xl border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Activity size={15} className="text-mint" /> Queue completion</div>
            <div className="h-2 rounded-full bg-raised overflow-hidden mt-3">
              <div className="h-full bg-mint rounded-full" style={{ width: `${percent(a.learning.peerReviewsSubmitted, a.learning.peerReviewsSubmitted + a.learning.peerReviewsPending)}%` }} />
            </div>
            <p className="text-xs text-muted mt-2">{percent(a.learning.peerReviewsSubmitted, a.learning.peerReviewsSubmitted + a.learning.peerReviewsPending)}% of assigned reviews are complete.</p>
          </div>
        </div>}
      </section>}

      {activeSection === "courses" && <section id="courses" className="grid xl:grid-cols-2 gap-4">
        <div className="card p-5 md:p-6">
          <SectionTitle title="Most enrolled courses" sub="Enrollment and course completion signals." />
          <div className="space-y-3">
            {a.popularCourses.length ? a.popularCourses.map((course, index) => (
              <div key={course.id} className="card-raise p-4 flex items-center gap-4">
                <span className="w-9 h-9 rounded-xl bg-surface grid place-items-center font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{course.title}</p>
                  <p className="text-xs text-muted mt-1">{number(course.lessons)} lessons · {number(course.certificates)} certificates · {course.published ? "published" : "draft"}</p>
                </div>
                <div className="text-right shrink-0"><p className="font-mono font-semibold">{number(course.enrollments)}</p><p className="text-[10px] text-muted">enrolled</p></div>
              </div>
            )) : <p className="text-sm text-muted py-8 text-center">No courses have been created yet.</p>}
          </div>
        </div>
        <div className="card p-5 md:p-6">
          <SectionTitle title="Top learners" sub="Active student accounts ranked by earned XP." />
          <div className="space-y-2">
            {a.topLearners.length ? a.topLearners.map((learner, index) => (
              <div key={learner.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-raised/60 transition-colors">
                <span className="font-mono text-xs text-muted w-6">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{learner.name}</p>
                  <p className="text-xs text-muted truncate">{learner.email}</p>
                </div>
                <div className="text-right"><p className="font-mono text-sm font-semibold">{number(learner.xp)} XP</p><p className="text-[10px] text-muted">level {learner.level} · {learner.lessons} lessons</p></div>
              </div>
            )) : <p className="text-sm text-muted py-8 text-center">No active student accounts yet.</p>}
          </div>
        </div>
      </section>}

      {activeSection === "payments" && <section className="grid gap-4">
        <div id="payments" className="card p-5 md:p-6">
          <SectionTitle title="Payments overview" sub="Paid amounts are grouped by currency." />
          <div className="space-y-3">
            {a.revenue.currencies.length ? a.revenue.currencies.map((currency) => (
              <div key={currency.currency} className="card-raise p-4 flex justify-between items-center gap-4">
                <div><p className="eyebrow">{currency.currency} captured</p><p className="display text-2xl font-bold mt-1">{money(currency.paidCents, currency.currency)}</p></div>
                <div className="text-right text-xs text-muted"><p>{number(currency.paidTransactions)} paid</p><p>{number(currency.demoTransactions)} demo</p></div>
              </div>
            )) : <p className="text-sm text-muted py-5 text-center">No payment records yet.</p>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted"><CircleDollarSign size={14} className="text-mint" /> Paid totals and plan access come from verified PayMongo webhooks.</div>
          {a.revenue.recent.length > 0 && (
            <div className="mt-5 border-t border-line pt-4 space-y-3">
              <p className="eyebrow">Recent payment activity</p>
              {a.revenue.recent.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0"><p className="truncate font-medium">{payment.userName}</p><p className="text-muted truncate">{payment.userEmail}</p></div>
                  <div className="text-right shrink-0"><p>{money(payment.amountCents, payment.currency.toUpperCase())}</p><p className="text-muted">{payment.status} · {fmtDate(payment.createdAt)}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>}
      {activeSection === "ai" && <section id="ai" className="space-y-4">
        {aiTutor.loading && <SphereLoader label="Loading AI assistant settings" />}
        {!aiTutor.loading && !aiTutor.data && <p className="text-muted">{aiTutor.error ?? "AI assistant settings are unavailable."}</p>}
        {aiTutor.data && aiForm && <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Successful requests" value={number(aiTutor.data.usage.totalRequests)} sub={`${number(aiTutor.data.usage.requestsLast30Days)} in the last 30 days`} accent="var(--primary)" />
            <StatCard label="Credits consumed" value={number(aiTutor.data.usage.creditsUsed)} sub="Successful responses only" accent="var(--amber)" />
            <StatCard label="Tokens processed" value={number(aiTutor.data.usage.inputTokens + aiTutor.data.usage.outputTokens)} sub={`${number(aiTutor.data.usage.inputTokens)} input · ${number(aiTutor.data.usage.outputTokens)} output`} accent="var(--mint)" />
            <StatCard label="Estimated provider cost" value={`$${aiTutor.data.usage.estimatedCostUsd.toFixed(4)}`} sub="Based on the rates configured below" accent="var(--coral)" />
          </div>
          <div className="card p-5 md:p-6">
            <SectionTitle title="AI Learning Assistant controls" sub="The Gemini key stays in the backend environment. These settings never expose credentials to students." right={<Sparkles size={16} className="text-primary" />} />
            <div className="grid md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between gap-4 rounded-xl bg-raised p-4 text-sm">
                <span><strong className="block">Assistant enabled</strong><span className="text-xs text-muted">Turn off all student AI requests</span></span>
                <input type="checkbox" checked={aiForm.enabled} onChange={(event) => setAiForm({ ...aiForm, enabled: event.target.checked })} className="h-4 w-4 accent-primary" />
              </label>
              <label className="text-sm">Daily credits per student
                <input className="input mt-1.5" type="number" min={0} max={1000} value={aiForm.dailyCredits}
                  onChange={(event) => setAiForm({ ...aiForm, dailyCredits: Number(event.target.value) })} />
              </label>
              <label className="text-sm">Gemini model <span className="text-muted">(blank uses GEMINI_MODEL)</span>
                <input className="input mt-1.5" maxLength={100} value={aiForm.model}
                  onChange={(event) => setAiForm({ ...aiForm, model: event.target.value })} placeholder="gemini-3.6-flash" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Input $ / million tokens
                  <input className="input mt-1.5" type="number" min={0} step="0.0001" value={aiForm.inputCostPerMillionUsd}
                    onChange={(event) => setAiForm({ ...aiForm, inputCostPerMillionUsd: Number(event.target.value) })} />
                </label>
                <label className="text-sm">Output $ / million tokens
                  <input className="input mt-1.5" type="number" min={0} step="0.0001" value={aiForm.outputCostPerMillionUsd}
                    onChange={(event) => setAiForm({ ...aiForm, outputCostPerMillionUsd: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="mt-5">
              <p className="eyebrow mb-2">Credit cost by action</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {([
                  ["hint", "Hint"], ["error", "Explain error"], ["concept", "Concept"],
                  ["pseudocode", "Pseudocode"], ["solution", "Full solution"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-xs text-muted">{label}
                    <input className="input mt-1.5" type="number" min={0} max={100} value={aiForm.costs[key]}
                      onChange={(event) => setAiForm({ ...aiForm, costs: { ...aiForm.costs, [key]: Number(event.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>
            <button type="button" disabled={savingAi} onClick={() => void saveAiSettings()} className="btn btn-primary mt-5">
              {savingAi ? "Saving…" : "Save AI settings"}
            </button>
          </div>
          <div className="card p-5 md:p-6">
            <SectionTitle title="Usage by feature" sub="Only completed AI responses are included." />
            <div className="space-y-2">
              {aiTutor.data.usage.features.length ? aiTutor.data.usage.features.map((feature) => (
                <div key={feature.action} className="flex items-center justify-between rounded-lg bg-raised px-4 py-3 text-sm">
                  <span className="capitalize">{feature.action === "solution" ? "Complete solution" : feature.action}</span>
                  <span className="font-mono text-xs text-muted">{number(feature.requests)} requests · {number(feature.credits)} credits</span>
                </div>
              )) : <p className="text-sm text-muted">No successful AI requests yet.</p>}
            </div>
          </div>
        </>}
      </section>}
      {activeSection === "users" && <section>
        <div id="users" className="card p-5 md:p-6">
          <SectionTitle title="All user accounts" sub={`${number(d.rows.filter((row) => row.active).length)} active of ${number(d.rows.length)} total`} />
          <div className="grid sm:grid-cols-[1fr_150px_150px] gap-2 mb-4">
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" aria-label="Search users" />
            </label>
            <select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter by role">
              <option value="all">All roles</option><option value="student">Students</option><option value="instructor">Instructors</option><option value="admin">Admins</option>
            </select>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Deactivated</option>
            </select>
          </div>
          <p className="text-xs text-muted mb-3">Showing {number(filteredUsers.length)} of {number(d.rows.length)} accounts</p>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[690px]">
              <thead>
                <tr className="text-left text-muted text-[11px] font-mono border-b border-line">
                  <th className="px-4 py-3 font-normal">Account</th><th className="px-3 py-3 font-normal">Role</th>
                  <th className="px-3 py-3 font-normal">XP / level</th><th className="px-3 py-3 font-normal">Joined</th>
                  <th className="px-3 py-3 font-normal">Status</th><th className="px-4 py-3 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index * 0.015, 0.25) }}
                    className={`border-b border-line/50 last:border-0 ${!user.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 min-w-56"><p className="font-medium">{user.name}</p><p className="font-mono text-[11px] text-muted">{user.email}</p></td>
                    <td className="px-3 py-3"><span className="tag">{user.role}</span></td>
                    <td className="px-3 py-3 font-mono text-xs">{number(user.xp)} / {user.level}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted">{fmtDate(user.createdAt)}</td>
                    <td className="px-3 py-3">
                      {user.active
                        ? <span className="flex items-center gap-1.5 text-mint text-xs"><UserRoundCheck size={13} /> active</span>
                        : <span className="flex items-center gap-1.5 text-coral text-xs"><UserRoundX size={13} /> inactive</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button disabled={busyId === user.id || user.role === "admin"}
                        onClick={() => toggle(user.id, user.active)}
                        className={`btn !py-1 !px-3 text-[12px] ${user.active ? "btn-ghost !text-coral" : "btn-ghost !text-mint"}`}>
                        {busyId === user.id ? "…" : user.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </motion.tr>
                ))}
                {filteredUsers.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">No accounts match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>}

      {activeSection === "overview" && <div className="card p-5 flex items-start gap-3">
        <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted leading-relaxed">
          Admin analytics are aggregated from platform activity and database records. Payment amounts are grouped by currency; demo payments are shown separately from captured payments. Use the account filters to find users and manage access.
        </p>
      </div>}
    </div>
  );
}
