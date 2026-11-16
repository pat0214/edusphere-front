"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  sessionId: string;
  domain: string;
  roomName: string;
  jwt: string | null;
  displayName: string;
  fallbackUrl: string;
  onClose: () => void;
};

type JitsiApi = {
  addListener: (event: string, handler: () => void) => void;
  dispose: () => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

function loadApi(domain: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  const scriptUrl = `https://${domain}/external_api.js`;
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const loaded = () => window.JitsiMeetExternalAPI ? resolve() : reject(new Error("Jitsi loaded without its meeting API."));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load the Jitsi meeting interface.")), { once: true });
    if (!existing) {
      script.src = scriptUrl;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.JitsiMeetExternalAPI) {
      resolve();
    }
  });
}

export function JitsiMeeting({ sessionId, domain, roomName, jwt, displayName, fallbackUrl, onClose }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<() => void>(() => undefined);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const roomPath = roomName.split("/").map(encodeURIComponent).join("/");
  const androidAppUrl = `intent://${domain}/${roomPath}${jwt ? `?jwt=${encodeURIComponent(jwt)}` : ""}#Intent;scheme=org.jitsi.meet;package=org.jitsi.meet;end`;
  const iosAppUrl = `org.jitsi.meet://${domain}/${roomPath}${jwt ? `?jwt=${encodeURIComponent(jwt)}` : ""}`;
  const isAndroid = /android/i.test(navigator.userAgent);
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mobileAppUrl = isAndroid ? androidAppUrl : iosAppUrl;

  useEffect(() => {
    let disposed = false;
    let hasLeft = false;
    let meeting: JitsiApi | null = null;
    const leave = () => {
      if (disposed || hasLeft) return;
      hasLeft = true;
      void api.post(`/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/leave`);
      onClose();
    };
    leaveRef.current = leave;

    void loadApi(domain).then(() => {
      if (disposed || !container.current || !window.JitsiMeetExternalAPI) return;
      meeting = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        parentNode: container.current,
        jwt: jwt ?? undefined,
        userInfo: { displayName },
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: false,
        },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
      });
      meeting.addListener("videoConferenceJoined", () => setConnected(true));
      meeting.addListener("videoConferenceLeft", leave);
      meeting.addListener("readyToClose", leave);
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : "Could not open the live session.");
    });

    return () => {
      disposed = true;
      leaveRef.current = () => undefined;
      meeting?.dispose();
    };
  }, [displayName, domain, jwt, onClose, roomName, sessionId]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-line">
        <div>
          <h3 className="display font-bold">Live classroom</h3>
          <p className="text-xs text-muted">Your microphone and camera start muted.</p>
        </div>
        <div className="flex gap-2">
          <a className="btn btn-ghost" href={fallbackUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open in new tab</a>
          {(isAndroid || isAppleMobile) && <a className="btn btn-ghost" href={mobileAppUrl}>Open Jitsi app</a>}
          <button className="btn btn-ghost text-coral" onClick={() => leaveRef.current()}>Leave</button>
        </div>
      </div>
      {error ? <div className="p-5 space-y-3" role="alert">
        <p className="text-sm text-coral">{error}</p>
        <p className="text-xs text-muted">Try opening the session in a new tab or use the Jitsi mobile app.</p>
      </div> : <div className="min-h-[65vh] bg-slate-950 relative">
        <div ref={container} className="absolute inset-0" />
        {!connected && <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs text-white" role="status">
          <LoaderCircle size={13} className="animate-spin" /> Connecting to Jitsi…
        </div>}
      </div>}
    </section>
  );
}
