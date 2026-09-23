"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";

// Leaflet touches window/document, so it can only load in the browser — never during
// Next.js's server-side build/render step.
const MapView = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

const STATUS_STYLES = {
  active: "bg-success/10 text-success border-success/30",
  estimate: "bg-warn/10 text-warn border-warn/30",
  complete: "bg-ink/10 text-ink/60 border-ink/20",
};

function MapPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("jobs")
      .select("*, contacts(name)")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .then(({ data }) => {
        setJobs(data || []);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Job Map</h1>
        <p className="text-sm text-ink/60 mb-4">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} with a mapped location. Jobs missing a
          pin can have one added from their Overview tab.
        </p>

        {loading ? (
          <p className="text-ink/40 font-mono text-sm">Loading...</p>
        ) : jobs.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-10 text-center text-ink/50">
            No mapped jobs yet.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-border" style={{ height: "70vh" }}>
            <MapView jobs={jobs} statusStyles={STATUS_STYLES} />
          </div>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><MapPage /></AuthGate>;
}
