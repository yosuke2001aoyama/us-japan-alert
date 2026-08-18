"use client";

import { FormEvent, useState } from "react";

export default function AlertSubscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, company: data.get("company") || "" }),
      });
      if (!response.ok) throw new Error();
      setEmail("");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="alert-subscribe" onSubmit={submit} aria-label="速報メール登録">
      <label htmlFor="alert-email">速報メール</label>
      <input
        id="alert-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={254}
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="メールアドレス"
      />
      <input className="form-trap" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button type="submit" disabled={status === "sending"}>{status === "sending" ? "送信中" : "登録"}</button>
      <span role="status">{status === "sent" ? "確認メールを送信しました" : status === "error" ? "送信できませんでした" : ""}</span>
    </form>
  );
}
