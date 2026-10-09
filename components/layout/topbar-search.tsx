"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export function TopbarSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/reports?q=${encodeURIComponent(value)}` : "/reports");
  }

  return (
    <form className="search" onSubmit={submit}>
      <Search />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Szukaj zgłoszenia, miejsca…"
        autoComplete="off"
        aria-label="Szukaj w zgłoszeniach"
      />
    </form>
  );
}
