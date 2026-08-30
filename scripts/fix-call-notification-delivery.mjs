import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(process.cwd(), "src/components/CallProvider.tsx");
let source = readFileSync(filePath, "utf8");
const original = source;

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`[Call notifications] Motif introuvable: ${label}`);
  source = source.replace(before, after);
}

replaceRequired(
  `import { getRtcIceConfiguration } from "@/lib/rtc-config.functions";`,
  `import { getRtcIceConfiguration } from "@/lib/rtc-config.functions";\nimport { notifyIncomingCall, sendCallPush } from "@/lib/push-notifications";`,
  "import push notifications",
);

replaceRequired(
  `        incomingRef.current = session;\n        setIncoming(session);\n        incomingTimeoutRef.current = window.setTimeout(() => {`,
  `        incomingRef.current = session;\n        setIncoming(session);\n        void notifyIncomingCall({\n          callId,\n          conversationId,\n          kind,\n          callerName: session.peer.name,\n          callerAvatar: session.peer.avatar,\n        });\n        incomingTimeoutRef.current = window.setTimeout(() => {`,
  "notification système appel entrant",
);

replaceRequired(
  `        await insertRtcMessage(session, "invite");\n        const offer = await pc.createOffer({`,
  `        await insertRtcMessage(session, "invite");\n        void sendCallPush({\n          recipientId: session.peer.id,\n          callId: session.callId,\n          conversationId: session.conversationId,\n          kind: session.kind,\n          callerName:\n            user.user_metadata?.display_name ||\n            user.user_metadata?.full_name ||\n            user.email?.split("@")[0] ||\n            "Un voyageur",\n          callerAvatar: user.user_metadata?.avatar_url ?? null,\n        });\n        const offer = await pc.createOffer({`,
  "push serveur après invitation",
);

replaceRequired(
  `    return () => {\n      void supabase.removeChannel(broadcastChannel);\n      void supabase.removeChannel(databaseChannel);\n    };`,
  `    const recoveryTimer = window.setInterval(() => {\n      if (document.visibilityState !== "visible" || activeRef.current || incomingRef.current) return;\n      const recentSince = new Date(Date.now() - 15_000).toISOString();\n      supabase\n        .from("messages")\n        .select("id, conversation_id, sender_id, attachment_type, attachment_meta, created_at")\n        .eq("attachment_type", RTC_ATTACHMENT_TYPE)\n        .gte("created_at", recentSince)\n        .order("created_at", { ascending: true })\n        .limit(60)\n        .then(({ data }) => {\n          for (const rawRow of data ?? []) {\n            const row = rawRow as unknown as RtcMessageRow;\n            const meta = row.attachment_meta;\n            if (!meta) continue;\n            signalQueueRef.current = signalQueueRef.current\n              .then(() => processSignal(row.id, row.conversation_id, row.sender_id, meta))\n              .catch((error) => console.error("Call polling recovery error", error));\n          }\n        });\n    }, 3_000);\n\n    return () => {\n      window.clearInterval(recoveryTimer);\n      void supabase.removeChannel(broadcastChannel);\n      void supabase.removeChannel(databaseChannel);\n    };`,
  "secours polling Realtime",
);

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(`[Call notifications] CallProvider.tsx: ${source === original ? "déjà conforme" : "corrigé"}`);
