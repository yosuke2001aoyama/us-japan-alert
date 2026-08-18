"use client";

import { useState } from "react";

export default function AlertTokenAction({ token, mode }: { token: string; mode: "confirm" | "unsubscribe" }) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const label = mode === "confirm" ? "速報メールを登録" : "速報メールを解除";

  async function submit() {
    setStatus("sending");
    try {
      const response = await fetch(`/api/alerts/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="token-action">
      {status === "done" ? (
        <p>{mode === "confirm" ? "登録しました。" : "解除しました。"}</p>
      ) : (
        <>
          <button type="button" onClick={submit} disabled={!token || status === "sending"}>
            {status === "sending" ? "処理中" : label}
          </button>
          {status === "error" && <p role="alert">リンクが無効か、処理できませんでした。</p>}
        </>
      )}
    </div>
  );
}
