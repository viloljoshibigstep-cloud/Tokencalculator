"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RoleProfileForm } from "@/components/role-profile-form";
import {
  fetchProfileQuestionnaire,
  type ProfileQuestionnaire,
} from "@/lib/queries";

export function ProfileEditor() {
  const [profile, setProfile] = useState<ProfileQuestionnaire | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) return;
      const q = await fetchProfileQuestionnaire(supabase, userResp.user.id);
      if (cancelled) return;
      setProfile(q);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <div className="py-3 text-sm text-[var(--muted-foreground)]">Loading…</div>
    );
  }

  return (
    <>
      <RoleProfileForm
        initial={profile}
        onSaved={(q) => {
          setProfile(q);
          setSavedAt(new Date().toLocaleTimeString());
        }}
        submitLabel="Save changes"
        compact
      />
      {savedAt && (
        <div className="mt-3 text-[11px] text-emerald-300">Saved at {savedAt}</div>
      )}
    </>
  );
}
