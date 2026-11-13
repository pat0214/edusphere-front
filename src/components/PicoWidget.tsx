import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/store";
import "./PicoWidget.css";

const PicoAssistant = lazy(() => import("@/components/pico/PicoAssistant.jsx"));
const PICO_CHAT_ENDPOINT = `${import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? ""}/api/pico/chat`;

export default function PicoWidget() {
  const { access, user } = useAuth();

  return (
    <div className="pico-path-assistant">
      <Suspense fallback={<div className="pico-widget-loading">Loading Pico…</div>}>
        <PicoAssistant
          endpoint={PICO_CHAT_ENDPOINT}
          context={{ page: "/path", userName: user?.name ?? "" }}
          conversationKey={user?.id ?? "guest"}
          fetchOptions={access ? { headers: { Authorization: `Bearer ${access}` } } : undefined}
          greeting={false}
          showAngles={false}
          persistentChat
        />
      </Suspense>
    </div>
  );
}
