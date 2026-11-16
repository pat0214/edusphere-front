"use client";
import { ChangeEvent, useState } from "react";
import { Download, FileText, RefreshCw, Upload } from "lucide-react";
import { toast } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

type Material = {
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  createdAt: string;
  uploaderName: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClassroomMaterials({ classroomId, canUpload }: { classroomId: string; canUpload: boolean }) {
  const endpoint = `/api/v1/classrooms/${encodeURIComponent(classroomId)}/materials`;
  const materials = useApi<Material[]>(endpoint);
  const [busy, setBusy] = useState(false);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    setBusy(true);
    const result = await api.upload(endpoint, body);
    setBusy(false);
    input.value = "";
    if (!result.success) { toast.err(result.message); return; }
    toast.ok(result.message);
    await materials.refetch();
  };

  const download = async (material: Material) => {
    try {
      const result = await api.download(`/api/v1/classroom-materials/${encodeURIComponent(material.id)}`);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.err(error instanceof Error ? error.message : "The material could not be downloaded.");
    }
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display font-bold flex items-center gap-2"><FileText size={17} className="text-primary" /> Class materials</h2>
          <p className="text-xs text-muted mt-1">Shared files are available to active classroom members.</p>
        </div>
        <button className="btn btn-ghost !p-2" disabled={materials.loading} onClick={() => void materials.refetch()} aria-label="Refresh class materials">
          <RefreshCw size={14} />
        </button>
      </div>
      {canUpload && <label className="btn btn-ghost w-fit cursor-pointer">
        <Upload size={14} /> {busy ? "Uploading…" : "Upload material"}
        <input className="sr-only" type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.zip"
          disabled={busy} onChange={(event) => void upload(event)} />
      </label>}
      {materials.error && <p className="text-sm text-coral">{materials.error}</p>}
      {materials.loading && !materials.data ? <p className="text-sm text-muted">Loading materials…</p>
        : materials.data?.length ? <div className="divide-y divide-line">
          {materials.data.map((material) => (
            <article key={material.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{material.name}</p>
                <p className="text-[11px] text-muted mt-1">{formatBytes(Number(material.bytes))} · {material.uploaderName} · {new Date(`${material.createdAt.replace(" ", "T")}Z`).toLocaleDateString()}</p>
              </div>
              <button className="btn btn-ghost !p-2 shrink-0" onClick={() => void download(material)} aria-label={`Download ${material.name}`}>
                <Download size={14} />
              </button>
            </article>
          ))}
        </div> : <p className="text-sm text-muted">{canUpload ? "No materials yet. Upload a file for the class." : "Your instructor has not shared any materials yet."}</p>}
      <p className="text-[11px] text-muted">PDF, Office, CSV, text, image, and ZIP files up to 25 MB.</p>
    </section>
  );
}
