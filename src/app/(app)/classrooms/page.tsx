"use client";
import { useState } from "react";
import { BookOpen, Plus, Users, KeyRound, ChevronRight, Clock3 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { SphereLoader } from "@/components/Logo";
import { useRequireAuth } from "@/components/Shell";
import { toast } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/lib/store";
import { useRouter } from "@/router/navigation";

type Classroom = {
  id: string; name: string; subject: string; description: string; gradeLevel?: string | null;
  themeColor: string; status: "active" | "archived"; studentCount?: number; pendingCount?: number;
  membershipStatus?: "active" | "pending"; teacherName?: string;
};
type NotificationPreferences = { emailEnabled: boolean; classroomEmailEnabled: boolean };

export default function ClassroomsPage() {
  const { ready } = useRequireAuth();
  const user = useAuth((state) => state.user);
  const router = useRouter();
  const classrooms = useApi<Classroom[]>(ready ? "/api/v1/classrooms" : null);
  const preferences = useApi<NotificationPreferences>(ready ? "/api/v1/notifications/preferences" : null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [approvalMode, setApprovalMode] = useState<"teacher" | "auto">("teacher");
  const [code, setCode] = useState("");

  if (!ready || classrooms.loading) return <SphereLoader label="Loading classrooms" />;
  if (classrooms.error) return <div className="card p-6 text-sm text-coral">{classrooms.error}</div>;

  const createClassroom = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    const result = await api.post<{ id: string }>("/api/v1/classrooms", {
      name, subject, description, gradeLevel, approvalMode,
    });
    setCreating(false);
    if (!result.success) {
      toast.err(result.message);
      return;
    }
    toast.ok("Your classroom is ready.");
    setName(""); setSubject(""); setDescription(""); setGradeLevel("");
    await classrooms.refetch();
    router.push(`/classrooms/${result.data.id}`);
  };

  const joinClassroom = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    const result = await api.post<{ classroomId: string; status: string }>("/api/v1/classrooms/join/code", { code });
    setJoining(false);
    if (!result.success) {
      toast.err(result.message);
      return;
    }
    toast.ok(result.message);
    setCode("");
    await classrooms.refetch();
    if (result.data.status === "active") router.push(`/classrooms/${result.data.classroomId}`);
  };

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    const result = await api.patch<NotificationPreferences>("/api/v1/notifications/preferences", { [key]: value });
    if (!result.success) {
      toast.err(result.message);
      return;
    }
    preferences.setData(result.data);
    toast.ok("Email preference saved.");
  };

  const isTeacher = user?.role === "instructor";
  const active = (classrooms.data ?? []).filter((item) => item.status === "active");
  const archived = isTeacher ? (classrooms.data ?? []).filter((item) => item.status === "archived") : [];

  return (
    <div className="space-y-7">
      <PageHeader
        title={isTeacher ? "My classrooms" : "My learning spaces"}
        sub={isTeacher ? "Create a subject space, invite students, and review enrollment requests." : "Join a class with your teacher's code or invitation link."}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        {isTeacher ? (
          <form onSubmit={createClassroom} className="card p-5 space-y-3">
            <h2 className="display font-bold flex items-center gap-2"><Plus size={17} className="text-primary" /> Create a classroom</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-muted">Classroom name
                <input className="input mt-1" required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 10 — Section A" />
              </label>
              <label className="text-xs text-muted">Subject
                <input className="input mt-1" required minLength={2} maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Introduction to Python" />
              </label>
            </div>
            <label className="text-xs text-muted">Grade or section (optional)
              <input className="input mt-1" maxLength={80} value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="Grade 10 · Section A" />
            </label>
            <label className="text-xs text-muted">Description (optional)
              <textarea className="input mt-1 min-h-20 resize-y" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will students learn here?" />
            </label>
            <label className="text-xs text-muted">Student enrollment
              <select className="input mt-1" value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as "teacher" | "auto")}>
                <option value="teacher">Teacher approves join requests</option>
                <option value="auto">Automatically admit students with an invite</option>
              </select>
            </label>
            <button className="btn btn-primary w-full" disabled={creating}>{creating ? "Creating…" : "Create classroom"}</button>
          </form>
        ) : (
          <form onSubmit={joinClassroom} className="card p-5 space-y-3">
            <h2 className="display font-bold flex items-center gap-2"><KeyRound size={17} className="text-primary" /> Join with a class code</h2>
            <p className="text-sm text-muted">Enter the 8-character code shared by your teacher. Your request may need approval.</p>
            <div className="flex gap-2">
              <input className="input font-mono uppercase tracking-[0.18em]" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 8))} maxLength={8} placeholder="AB12CD34" aria-label="Class code" />
              <button className="btn btn-primary shrink-0" disabled={joining || code.length !== 8}>{joining ? "Joining…" : "Join"}</button>
            </div>
          </form>
        )}
        <div className="card p-5 flex flex-col justify-center">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><Users size={18} /></span>
            <div>
              <h2 className="display font-bold">{isTeacher ? "Enrollment at a glance" : "Invitation link?"}</h2>
              <p className="text-sm text-muted mt-1">{isTeacher
                ? "Each classroom has its own invitation code and secure link. You can rotate or disable them at any time."
                : "Open your teacher's link while signed in to request access. Pending requests will appear here after the teacher reviews them."}</p>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="display text-lg font-bold mb-3">{isTeacher ? "Active classrooms" : "Your classrooms"}</h2>
        {active.length ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {active.map((item) => (
              <button key={item.id} onClick={() => router.push(`/classrooms/${item.id}`)} className="card p-5 text-left hover:border-primary/40 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: `${item.themeColor}22`, color: item.themeColor }}><BookOpen size={18} /></span>
                  {item.membershipStatus === "pending" && <span className="badge text-amber flex items-center gap-1"><Clock3 size={11} /> Pending</span>}
                  <ChevronRight className="ml-auto text-muted group-hover:text-primary" size={17} />
                </div>
                <h3 className="display font-bold mt-4">{item.name}</h3>
                <p className="text-sm text-muted mt-1">{item.subject}{item.gradeLevel ? ` · ${item.gradeLevel}` : ""}</p>
                {item.description && <p className="text-xs text-muted mt-2 line-clamp-2">{item.description}</p>}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-line text-xs text-muted">
                  <span>{isTeacher ? `${item.studentCount ?? 0} students` : `Teacher: ${item.teacherName ?? "Instructor"}`}</span>
                  {isTeacher && (item.pendingCount ?? 0) > 0 && <span className="text-amber">{item.pendingCount} pending</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={<BookOpen size={20} />} title={isTeacher ? "No classrooms yet" : "No classrooms joined"} body={isTeacher ? "Create your first classroom above, then share its invite code with students." : "Use a class code above or open an invitation link from your teacher."} />
        )}
      </section>

      {archived.length > 0 && <section>
        <h2 className="display text-lg font-bold mb-3">Archived</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {archived.map((item) => <button key={item.id} onClick={() => router.push(`/classrooms/${item.id}`)} className="card p-4 text-left text-muted">{item.name} · {item.subject}</button>)}
        </div>
      </section>}
      {preferences.data && <section className="card p-5 space-y-3">
        <div><h2 className="display font-bold">Email notifications</h2><p className="text-sm text-muted mt-1">In-app notifications remain available even when email is turned off.</p></div>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Send me email notifications</span>
          <input type="checkbox" className="accent-primary size-4" checked={preferences.data.emailEnabled} onChange={(event) => void updatePreference("emailEnabled", event.target.checked)} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Classroom updates and join requests</span>
          <input type="checkbox" className="accent-primary size-4" checked={preferences.data.classroomEmailEnabled} disabled={!preferences.data.emailEnabled} onChange={(event) => void updatePreference("classroomEmailEnabled", event.target.checked)} />
        </label>
      </section>}
    </div>
  );
}
