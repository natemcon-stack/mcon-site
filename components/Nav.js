"use client";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { useCompanyBranding } from "@/lib/useCompanyBranding";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { useEffect, useRef, useState } from "react";
import { subscribeToPush, registerServiceWorker } from "@/lib/push";

const links = [
  { href: "/today", label: "This Week" },
  { href: "/", label: "Jobs" },
  { href: "/contacts", label: "Contacts" },
  { href: "/map", label: "Map" },
  { href: "/messages", label: "Team Chat" },
  { href: "/time-off", label: "Time Off" },
];

// Visible to a foreman as well as an admin. A foreman prices and bills work, so they
// need estimates, invoices, the price book, leads and receipts.
const managementLinks = [
  { href: "/estimates", label: "Estimates" },
  { href: "/invoices", label: "Invoices" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/price-book", label: "Price Book" },
  { href: "/admin/receipts", label: "Receipts" },
  { href: "/admin/expenses", label: "All Expenses" },
];

// Admin only. Reports is here specifically because it shows company-wide monthly and
// yearly revenue; payroll carries pay rates; the rest are configuration.
const adminOnlyLinks = [
  { href: "/admin/approvals", label: "Approvals" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/pdf-library", label: "PDF Library" },
  { href: "/admin/company", label: "Company" },
  { href: "/admin/accounting", label: "Accounting" },
  { href: "/admin/tax-summary", label: "Tax Summary" },
  { href: "/admin/import", label: "Import" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isAdmin, isManagement } = useProfile();
  const branding = useCompanyBranding();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    // Registered first and separately: offline support must not depend on someone
    // accepting notifications.
    registerServiceWorker().catch(() => {});
    subscribeToPush().catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // What this person actually sees in the dropdown.
  const visibleMenuLinks = isAdmin ? [...managementLinks, ...adminOnlyLinks] : managementLinks;
  const isAdminSectionActive = visibleMenuLinks.some((l) => pathname === l.href);

  return (
    // NOTE: the dropdown panel below is intentionally NOT inside the horizontally
    // scrollable <nav> — a box with overflow-x set forces overflow-y to clip too,
    // which was silently hiding the dropdown. Keeping it as a sibling avoids that.
    <header className="bg-ink text-white sticky top-0 z-20 border-b-4 border-accent no-print">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-wide text-lg shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-8 w-auto bg-white rounded px-1.5 py-1 object-contain"
              onError={(e) => { e.target.style.display = "none"; }} />
          )}
          <span className="hidden sm:inline uppercase">{branding.header}</span>
        </Link>

        <div className="flex items-center gap-1 min-w-0">
          <nav className="flex items-center gap-1 overflow-x-auto">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded font-display text-sm tracking-wide uppercase whitespace-nowrap ${
                  pathname === l.href ? "bg-accent text-white" : "text-white/80 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {isManagement && (
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={`px-3 py-1.5 rounded font-display text-sm tracking-wide uppercase whitespace-nowrap flex items-center gap-1 ${
                  isAdminSectionActive || menuOpen ? "bg-accent text-white" : "text-white/80 hover:text-white"
                }`}
              >
                {isAdmin ? "Admin" : "Manage"} <span className="text-xs">▾</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-surface text-ink rounded-lg shadow-lg border border-border overflow-hidden z-50">
                  {visibleMenuLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`block px-4 py-2 text-sm font-display uppercase tracking-wide ${
                        pathname === l.href ? "bg-accent/10 text-accent-dark" : "hover:bg-paper"
                      }`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* The role doubles as the way into account settings — it's already where
              someone looks to check who they're signed in as. */}
          <Link href="/report-bug"
            className="ml-1 text-xs text-white/40 hover:text-white uppercase hidden md:inline whitespace-nowrap shrink-0"
            title="Report a problem">
            Report a bug
          </Link>
          <Link href="/account"
            className="ml-1 text-xs font-mono text-white/40 hover:text-white uppercase hidden md:inline whitespace-nowrap shrink-0"
            title="Your account and password">
            {profile?.role}
          </Link>
          <button
            onClick={signOut}
            className="ml-1 px-3 py-1.5 rounded font-display text-sm tracking-wide uppercase text-white/60 hover:text-white border border-white/20 whitespace-nowrap shrink-0"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
