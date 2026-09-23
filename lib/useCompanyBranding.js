"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/signedUrl";
import { brand } from "@/lib/brand";

// The company's own name, header text and logo, for anything crew- or client-facing.
//
// Reads from company_settings rather than the build-time env vars in lib/brand.js.
// Those were fine when a deployment served one company; now that a single deployment
// serves many, branding has to come from the row, not the build.

let cached = null;

export function useCompanyBranding() {
  const [branding, setBranding] = useState(cached);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("company_settings")
        .select("company_name, app_header, logo_path, logo_url, province")
        .maybeSingle();

      if (!active) return;

      const companyName = data?.company_name || brand.companyName;
      const value = {
        companyName,
        // Falls back to "<Company> Job Board" so a company that never sets a header
        // still gets its own name rather than someone else's.
        header: data?.app_header || `${companyName} Job Board`,
        logoUrl: null,
        province: data?.province || "BC",
      };

      if (data?.logo_path) {
        value.logoUrl = await getSignedUrl("documents", data.logo_path);
      } else if (data?.logo_url) {
        value.logoUrl = data.logo_url;
      }

      if (!active) return;
      cached = value;
      setBranding(value);
    }

    load();
    // Cleared when settings are saved, so a rename shows up without a reload.
    const onChange = () => { cached = null; load(); };
    window.addEventListener("company-branding-changed", onChange);
    return () => { active = false; window.removeEventListener("company-branding-changed", onChange); };
  }, []);

  return branding || {
    companyName: brand.companyName,
    header: `${brand.companyName} Job Board`,
    logoUrl: null,
    province: "BC",
  };
}
