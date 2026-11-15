"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, Copy, ExternalLink, Link2, Mail, Radio, RefreshCw, ShieldOff, Trash2, Users, Video, X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { SphereLoader } from "@/components/Logo";
import { useRequireAuth } from "@/components/Shell";
import { toast } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/lib/store";
import { useParams, useRouter, useSearchParams } from "@/router/navigation";

type Classroom = {
  id: string; ownerId: string; name: string; subject: string; description: string; gradeLevel?: string | null;
  themeColor: string; approvalMode: string; maxStudents: number | null; status: string;
  studentCount: number; pendingCount: number; membershipStatus?: string | null; teacherRole?: string | null;
};
type Member = { id: string; userId: string; name: string; email: string; status: string; requestedAt: string; blockedFromRejoining: boolean };
type Invite = { joinCode: string; inviteToken: string; invitationsEnabled: boolean; expiresAt: string | null; maxUses: number | null; uses: number };
type LiveSession = { id: string; requestId: string; title: string; description: string; status: string; startsAt: string; endsAt: string; meetUrl: string | null; teacherName: string; attended: boolean; attendanceCount: number };
type GoogleConnection = { connected: boolean; configured: boolean; enabled: boolean; maxDurationMinutes: number; googleEmail: string | null };

export default function ClassroomDetailPage() {
  const { ready } = useRequireAuth();
  const user = useAuth((state) => state.user);
  const { id = "" } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = `/api/v1/classrooms/${encodeURIComponent(id)}`;
  const classroom = useApi<Classroom>(ready && id ? path : null);
  const isTeacher = user?.role === "instructor";
  const members = useApi<Member[]>(ready && isTeacher && id ? `${path}/members` : null);
  const invite = useApi<Invite>(ready && isTeacher && classroom.data?.status === "active" ? `${path}/invite` : null);
  const connection = useApi<GoogleConnection>(ready && isTeacher ? "/api/v1/classrooms/google/connection" : null);
  const sessions = useApi<LiveSession[]>(ready && id ? `${path}/live-sessions` : null);
  const [busy, setBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionRequestId, setSessionRequestId] = useState("");
  const [sessionDuration, setSessionDuration] = useState(60);
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("");

  useEffect(() => {
    const result = searchParams.get("google");
    if (result === "connected") toast.ok("Google Calendar connected.");
    if (result === "error") toast.err("Google Calendar connection did not complete.");
  }, [searchParams]);
  useEffect(() => {
    if (!invite.data) return;
    setInviteMaxUses(invite.data.maxUses?.toString() ?? "");
    if (!invite.data.expiresAt) {
      setInviteExpiry("");
      return;
    }
    const date = new Date(`${invite.data.expiresAt.replace(" ", "T")}Z`);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    setInviteExpiry(localDate.toISOString().slice(0, 16));
  }, [invite.data]);

  const inviteUrl = useMemo(() => invite.data ? `${window.location.origin}/join/${invite.data.inviteToken}` : "", [invite.data]);
  if (!ready || classroom.loading) return <SphereLoader label="Loading classroom" />;
  if (!classroom.data) return <div className="card p-6 text-sm text-coral">{classroom.error ?? "Classroom unavailable."}</div>;
  const data = classroom.data;
  const requests = (members.data ?? []).filter((member) => member.status === "pending");
  const students = (members.data ?? []).filter((member) => member.status === "active");

  const action = async (label: string, method: "post" | "patch", endpoint: string, body?: unknown) => {
    setBusy(true);
    const result = await api[method](endpoint, body);
    setBusy(false);
    if (!result.success) {
      toast.err(result.message);
      return false;
    }
    toast.ok(result.message || label);
    await Promise.all([classroom.refetch(), members.refetch(), invite.refetch()]);
    return true;
  };
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.ok(`${label} copied.`);
    } catch {
      toast.err("Could not copy to clipboard. Select and copy the value instead.");
    }
  };
  const connectGoogle = async () => {
    const result = await api.post<{ authorizationUrl: string }>("/api/v1/classrooms/google/connect");
    if (!result.success) { toast.err(result.message); return; }
    window.location.assign(result.data.authorizationUrl);
  };
  const disconnectGoogle = async () => {
    if (!window.confirm("Disconnect Google Calendar? Existing Meet links remain in their sessions, but new sessions will require reconnecting.")) return;
    const result = await api.delete("/api/v1/classrooms/google/connection");
    if (!result.success) { toast.err(result.message); return; }
    toast.ok(result.message);
    await connection.refetch();
  };
  const saveInviteLimits = async () => {
    const maxUses = inviteMaxUses.trim() === "" ? null : Number(inviteMaxUses);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 50000)) {
      toast.err("Use limit must be a whole number between 1 and 50,000.");
      return;
    }
    const expiresAt = inviteExpiry ? new Date(inviteExpiry).toISOString() : null;
    const result = await api.patch<Invite>(`${path}/invite`, { maxUses, expiresAt });
    if (!result.success) { toast.err(result.message); return; }
    invite.setData(result.data);
    toast.ok(result.message);
  };
  const startSession = async () => {
    const title = sessionTitle.trim() || `${data.name} live class`;
    const requestId = sessionRequestId || crypto.randomUUID();
    setSessionRequestId(requestId);
    setSessionBusy(true);
    const result = await api.post<{ session: LiveSession }>(`${path}/live-sessions/start`, {
      requestId, title, durationMinutes: Math.min(sessionDuration, connection.data?.maxDurationMinutes ?? sessionDuration),
    });
    setSessionBusy(false);
    if (!result.success) { toast.err(result.message); return; }
    toast.ok(result.message);
    if (result.data.session.status === "live") setSessionRequestId("");
    setSessionTitle("");
    await sessions.refetch();
  };
  const joinSession = async (session: LiveSession) => {
    const tab = window.open("about:blank", "_blank");
    const result = await api.post<{ meetUrl: string; title: string }>(`/api/v1/classroom-sessions/${session.id}/join`);
    if (!result.success) {
      tab?.close();
      toast.err(result.message);
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.meetUrl;
    } else {
      window.location.assign(result.data.meetUrl);
    }
  };
  const endSession = async (session: LiveSession) => {
    setSessionBusy(true);
    const result = await api.post<{ ended: boolean; calendarEventRemoved: boolean }>(`/api/v1/classroom-sessions/${session.id}/end`);
    setSessionBusy(false);
    if (!result.success) { toast.err(result.message); return; }
    toast.info(result.message);
    await sessions.refetch();
  };

  return (
    <div className="space-y-6">
      <button onClick={() => router.push("/classrooms")} className="btn btn-ghost -ml-3"><ArrowLeft size={15} /> My classrooms</button>
      <PageHeader title={data.name} sub={`${data.subject}${data.gradeLevel ? ` · ${data.gradeLevel}` : ""}${data.status === "archived" ? " · Archived" : ""}`}
        actions={isTeacher && data.teacherRole ? (data.status === "active"
          ? <button className="btn btn-ghost" disabled={busy} onClick={() => void action("Classroom archived.", "post", `${path}/archive`)}><ShieldOff size={15} /> Archive</button>
          : <button className="btn btn-primary" disabled={busy} onClick={() => void action("Classroom restored.", "post", `${path}/restore`)}>Restore</button>) : undefined} />

      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <section className="card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${data.themeColor}22`, color: data.themeColor }}><BookOpen size={20} /></span>
            <div className="min-w-0">
              <h2 className="display font-bold">{data.subject}</h2>
              <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{data.description || "No classroom description yet."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge flex items-center gap-1"><Users size={12} /> {data.studentCount} students</span>
            {isTeacher && <span className="badge">{data.pendingCount} pending requests</span>}
            <span className="badge">{data.approvalMode === "auto" ? "Automatic enrollment" : "Teacher approval"}</span>
          </div>
          {!isTeacher && data.membershipStatus === "pending" && <div className="rounded-xl border border-amber/25 bg-amber/5 p-4 text-sm text-amber">Your request is waiting for the teacher's approval.</div>}
          {!isTeacher && data.membershipStatus === "active" && <button className="btn btn-ghost text-coral" disabled={busy} onClick={() => void action("You left the classroom.", "post", `${path}/leave`)}><ArrowLeft size={14} /> Leave classroom</button>}
        </section>

        {isTeacher && data.teacherRole && data.status === "active" && (
          <section className="card p-5 space-y-4">
            <div>
              <h2 className="display font-bold flex items-center gap-2"><Link2 size={16} className="text-primary" /> Invite students</h2>
              <p className="text-xs text-muted mt-1">Share either the code or secure link. Resetting revokes the old link and code.</p>
            </div>
            {invite.data ? <>
              <div>
                <p className="eyebrow">Class code</p>
                <div className="flex items-center gap-2 mt-1"><code className="font-mono text-lg tracking-[0.18em]">{invite.data.joinCode}</code><button className="btn btn-ghost !p-2" onClick={() => void copy(invite.data!.joinCode, "Code")} aria-label="Copy code"><Copy size={14} /></button></div>
              </div>
              <div>
                <p className="eyebrow">Invitation link</p>
                <div className="flex gap-2 mt-1"><input className="input min-w-0 text-xs" readOnly value={inviteUrl} /><button className="btn btn-ghost !p-2" onClick={() => void copy(inviteUrl, "Invitation link")} aria-label="Copy invitation link"><Copy size={14} /></button></div>
              </div>
              <p className={`text-xs ${invite.data.invitationsEnabled ? "text-mint" : "text-coral"}`}>{invite.data.invitationsEnabled ? "Invitations enabled" : "Invitations paused"} · {invite.data.uses} uses</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted">Use limit<input className="input mt-1" type="number" min={1} max={50000} value={inviteMaxUses} onChange={(event) => setInviteMaxUses(event.target.value)} placeholder="No limit" /></label>
                <label className="text-[11px] text-muted">Expires at<input className="input mt-1" type="datetime-local" value={inviteExpiry} onChange={(event) => setInviteExpiry(event.target.value)} /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" disabled={busy} onClick={() => void saveInviteLimits()}>Save invite limits</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => void action("Invitation settings updated.", "patch", `${path}/invite`, { enabled: !invite.data!.invitationsEnabled })}>{invite.data.invitationsEnabled ? "Pause invites" : "Enable invites"}</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => window.confirm("Create a new code and link? The current invitations will stop working.") && void action("Invitation code and link rotated.", "patch", `${path}/invite`, { reset: true })}><RefreshCw size={13} /> Reset</button>
              </div>
            </> : <p className="text-sm text-muted">{invite.error ?? "Loading invitation settings…"}</p>}
          </section>
        )}
      </div>

      {isTeacher && data.teacherRole && <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div><h2 className="display text-xl font-bold">Student management</h2><p className="text-sm text-muted mt-1">Review requests and manage current members.</p></div>
          <button className="btn btn-ghost" disabled={members.loading} onClick={() => void members.refetch()}><RefreshCw size={14} /> Refresh</button>
        </div>
        {members.error && <div className="card p-4 text-sm text-coral">{members.error}</div>}
        {requests.length > 0 && <div className="card overflow-hidden">
          <h3 className="px-5 py-4 display font-bold border-b border-line">Pending requests <span className="text-amber">({requests.length})</span></h3>
          <div className="divide-y divide-line">
            {requests.map((member) => <div key={member.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">{member.name}</p><p className="text-xs text-muted flex items-center gap-1 mt-1"><Mail size={12} /> {member.email}</p></div>
              <div className="flex gap-2">
                <button className="btn btn-primary !px-3 !py-2" disabled={busy} onClick={() => void action("Student approved.", "post", `${path}/members/${member.id}/approve`)}><Check size={14} /> Approve</button>
                <button className="btn btn-ghost !px-3 !py-2 text-coral" disabled={busy} onClick={() => void action("Request declined.", "post", `${path}/members/${member.id}/decline`, {})}><X size={14} /> Decline</button>
              </div>
            </div>)}
          </div>
        </div>}
        <div className="card overflow-hidden">
          <h3 className="px-5 py-4 display font-bold border-b border-line">Enrolled students <span className="text-muted">({students.length})</span></h3>
          {students.length ? <div className="divide-y divide-line">
            {students.map((member) => <div key={member.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">{member.name}</p><p className="text-xs text-muted mt-1">{member.email}</p></div>
              <button className="btn btn-ghost !px-3 !py-2 text-coral" disabled={busy} onClick={() => window.confirm(`Remove ${member.name} from this classroom?`) && void action("Student removed.", "post", `${path}/members/${member.id}/remove`, {})}><Trash2 size={14} /> Remove</button>
            </div>)}
          </div> : <div className="p-5"><EmptyState icon={<Users size={18} />} title="No students yet" body="Share the invitation link or class code to get started." /></div>}
        </div>
      </section>}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div><h2 className="display text-xl font-bold flex items-center gap-2"><Radio size={18} className="text-primary" /> Live sessions</h2><p className="text-sm text-muted mt-1">Start a Google Meet session instantly or join one hosted by your teacher.</p></div>
          <button className="btn btn-ghost" disabled={sessions.loading} onClick={() => void sessions.refetch()}><RefreshCw size={14} /> Refresh</button>
        </div>
        {isTeacher && data.teacherRole && data.status === "active" && <div className="card p-5 space-y-3">
          {connection.error ? <p className="text-sm text-coral">{connection.error}</p>
            : connection.data && !connection.data.enabled ? <p className="text-sm text-muted">Live sessions are currently disabled by an administrator.</p>
            : !connection.data?.configured ? <p className="text-sm text-muted">Live sessions need Google OAuth credentials and token encryption configured on the backend.</p>
            : !connection.data.connected ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Connect a Google account that can create Calendar events and Meet links.</p><button className="btn btn-primary" onClick={() => void connectGoogle()}><Link2 size={14} /> Connect Google Calendar</button></div>
              : <div className="space-y-3">
                <p className="text-xs text-mint">Connected to {connection.data.googleEmail ?? "Google Calendar"} · attendees are active classroom members only.</p>
                <div className="flex flex-wrap gap-2">
                  <input className="input min-w-[220px] flex-1" value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} maxLength={160} placeholder={`${data.name} live class`} aria-label="Session title" />
                  <select className="input w-32" value={Math.min(sessionDuration, connection.data.maxDurationMinutes)} onChange={(event) => setSessionDuration(Number(event.target.value))} aria-label="Session duration">
                    {[10, 30, 60, 90, 120, 180, 240].filter((minutes) => minutes <= connection.data!.maxDurationMinutes).map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                  </select>
                  <button className="btn btn-primary" disabled={sessionBusy} onClick={() => void startSession()}><Video size={14} /> {sessionBusy ? "Starting…" : sessionRequestId ? "Retry Meet setup" : "Start live session"}</button>
                </div>
                <button className="text-xs text-muted underline underline-offset-2" onClick={() => void disconnectGoogle()}>Disconnect Google Calendar</button>
              </div>}
        </div>}
        {sessions.error && <div className="card p-4 text-sm text-coral">{sessions.error}</div>}
        {sessions.loading ? <p className="text-sm text-muted">Loading live sessions…</p> : sessions.data?.length ? <div className="grid md:grid-cols-2 gap-3">
          {sessions.data.map((session) => <article key={session.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="display font-bold">{session.title}</h3><p className="text-xs text-muted mt-1">Started by {session.teacherName} · {new Date(session.startsAt.replace(" ", "T") + "Z").toLocaleString()}</p></div>
              <span className={`badge ${session.status === "live" ? "text-mint" : "text-muted"}`}>{session.status}</span>
            </div>
            {session.description && <p className="text-sm text-muted mt-3">{session.description}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
              <p className="text-xs text-muted">{session.attendanceCount} join clicks recorded</p>
              <div className="flex gap-2">
                {session.status === "live" && session.meetUrl && <button className="btn btn-primary !px-3 !py-2" onClick={() => void joinSession(session)}><ExternalLink size={13} /> Join Meet</button>}
                {isTeacher && data.teacherRole && session.status === "live" && <button className="btn btn-ghost !px-3 !py-2 text-coral" disabled={sessionBusy} onClick={() => window.confirm("End the EduSphere session and cancel its Calendar event?") && void endSession(session)}><X size={13} /> End</button>}
                {isTeacher && data.teacherRole && ["provisioning", "failed"].includes(session.status) && <button className="btn btn-ghost !px-3 !py-2" disabled={sessionBusy} onClick={() => { setSessionRequestId(session.requestId); setSessionTitle(session.title); }}><RefreshCw size={13} /> Retry</button>}
              </div>
            </div>
          </article>)}
        </div> : <EmptyState icon={<Radio size={18} />} title="No live sessions yet" body={isTeacher ? "Connect Google Calendar above to start a live class." : "Your teacher's live sessions will appear here."} />}
        <p className="text-[11px] text-muted">Attendance records represent when a classroom member clicked Join in EduSphere; Google Meet participation is not independently verified.</p>
      </section>
    </div>
  );
}
