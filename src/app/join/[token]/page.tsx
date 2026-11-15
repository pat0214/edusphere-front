"use client";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, LoaderCircle } from "lucide-react";
import Link from "@/router/link";
import { useParams, useRouter } from "@/router/navigation";
import { Logo } from "@/components/Logo";
import { toast, ToastHost } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { hydrateAuth, useAuth } from "@/lib/store";

type Preview = { id: string; name: string; subject: string; description: string; gradeLevel?: string | null; teacherName: string };

export default function JoinClassroomPage() {
  const { token = "" } = useParams();
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const preview = useApi<Preview>(token ? `/api/v1/classrooms/invites/${encodeURIComponent(token)}` : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { hydrateAuth(); }, []);

  const rememberAndGo = (path: string) => {
    sessionStorage.setItem("edu-classroom-invite", token);
    router.push(path);
  };
  const join = async () => {
    setBusy(true);
    const result = await api.post<{ classroomId: string; status: string }>(`/api/v1/classrooms/join/invite/${encodeURIComponent(token)}`);
    setBusy(false);
    if (!result.success) {
      toast.err(result.message);
      return;
    }
    toast.ok(result.message);
    router.replace(`/classrooms/${result.data.classroomId}`);
  };

  if (!hydrated || preview.loading) return <div className="min-h-screen grid place-items-center"><LoaderCircle className="animate-spin text-primary" /></div>;
  if (!preview.data) return <main className="min-h-screen grid place-items-center p-6"><div className="card max-w-md p-7 text-center"><Logo /><h1 className="display text-xl font-bold mt-6">Invitation unavailable</h1><p className="text-sm text-muted mt-2">{preview.error ?? "This invitation may have expired or been disabled."}</p><Link className="btn btn-ghost mt-5" href="/">Back to EduSphere</Link></div></main>;

  const classroom = preview.data;
  return <main className="min-h-screen grid place-items-center p-6">
    <div className="card max-w-lg w-full p-7">
      <Logo />
      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mt-7"><BookOpen size={22} /></div>
      <p className="eyebrow mt-5">Classroom invitation</p>
      <h1 className="display text-2xl font-bold mt-1">{classroom.name}</h1>
      <p className="text-primary font-medium mt-1">{classroom.subject}{classroom.gradeLevel ? ` · ${classroom.gradeLevel}` : ""}</p>
      <p className="text-sm text-muted mt-3">{classroom.description || "Join this subject classroom to learn and collaborate with your teacher."}</p>
      <p className="text-xs text-muted mt-4">Teacher: {classroom.teacherName}</p>
      {!user ? <div className="mt-6 grid sm:grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => rememberAndGo("/login")}>Sign in to join <ArrowRight size={14} /></button>
        <button className="btn btn-ghost" onClick={() => rememberAndGo("/register")}>Create an account</button>
      </div> : user.role !== "student" ? <p className="rounded-xl border border-amber/25 bg-amber/5 p-3 mt-6 text-sm text-amber">Classroom invitations can only be used by student accounts.</p> : <button className="btn btn-primary w-full mt-6" disabled={busy} onClick={() => void join()}>{busy ? "Joining…" : "Join this classroom"} <ArrowRight size={14} /></button>}
      <Link href="/" className="block text-center text-xs text-muted mt-5">Return to EduSphere</Link>
    </div>
    <ToastHost />
  </main>;
}
