"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// Fetches the signed-in user's profile and derives the role flags the UI branches on.
//
//   isAdmin      — full access, and the only role that can approve a document
//   isForeman    — everything an employee sees, plus financials, price book, all staff
//                  hours, contacts, leads and receipts; work queues for approval
//   isManagement — admin or foreman; the usual test for "can see money"
//
// isManagement is the right check for most gates. Reserve isAdmin for things a foreman
// is specifically not meant to reach: payroll, company settings, team, reports,
// reviews, the PDF library, deletion, and approving documents.
export function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (active) { setProfile(null); setLoading(false); }
        return;
      }
      let { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!data) {
        // A database trigger creates this row now, but a first login racing that
        // trigger would otherwise land on a null profile.
        const { data: created } = await supabase
          .from("profiles")
          .insert([{ id: user.id, full_name: null, role: "employee" }])
          .select()
          .single();
        data = created;
      }
      if (active) { setProfile(data); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  const role = profile?.role;
  return {
    profile,
    loading,
    role,
    companyId: profile?.company_id || null,
    isAdmin: role === "admin",
    isForeman: role === "foreman",
    isManagement: role === "admin" || role === "foreman",
  };
}
