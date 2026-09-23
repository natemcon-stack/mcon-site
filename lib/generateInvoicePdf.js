"use client";
import { jsPDF } from "jspdf";
import { supabase } from "@/lib/supabase/client";
import { withBrandDefaults } from "@/lib/brand";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Renders a clean, simple invoice PDF (not a pixel copy of the on-screen letterhead,
// but a genuine, readable PDF) and uploads it to the private 'documents' bucket,
// then registers it in the invoice_documents library so it shows up sorted by
// month and by paid/invoiced status. Called automatically when an invoice is
// created, and again when it's marked paid (so the paid stamp/status stays current).
export async function generateAndStoreInvoicePdf({ invoice, job, contact, lines, company }) {
  const doc = new jsPDF();
  const marginX = 20;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text(withBrandDefaults(company).companyName, marginX, y);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  y += 7;
  if (company?.address) { doc.text(company.address, marginX, y); y += 5; }
  if (company?.phone) { doc.text(`Phone: ${company.phone}`, marginX, y); y += 5; }

  doc.setFontSize(20);
  doc.setFont(undefined, "bold");
  doc.text("INVOICE", 150, 20);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Invoice #${invoice.doc_number}`, 150, 28);
  doc.text(`Date: ${invoice.date}`, 150, 33);
  if (invoice.due_date) doc.text(`Due: ${invoice.due_date}`, 150, 38);

  if (invoice.payment_status === "paid") {
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("PAID IN FULL", 150, 46);
    doc.setTextColor(0, 0, 0);
  }

  y = 55;
  doc.setFont(undefined, "bold");
  doc.text("Bill To:", marginX, y);
  doc.setFont(undefined, "normal");
  y += 5;
  doc.text(contact?.name || "", marginX, y);
  if (contact?.address) { y += 5; doc.text(contact.address, marginX, y); }

  y += 12;
  doc.setFont(undefined, "bold");
  doc.text("Description", marginX, y);
  doc.text("Amount", 180, y, { align: "right" });
  doc.line(marginX, y + 2, 190, y + 2);
  doc.setFont(undefined, "normal");
  y += 8;

  for (const line of lines || []) {
    const amount = Number(line.quantity) * Number(line.unit_cost) * (1 + Number(line.markup_pct) / 100);
    const descLines = doc.splitTextToSize(line.description, 140);
    doc.text(descLines, marginX, y);
    doc.text(money(amount), 190, y, { align: "right" });
    y += descLines.length * 5 + 3;
    if (y > 260) { doc.addPage(); y = 20; }
  }

  y += 5;
  doc.line(marginX, y, 190, y);
  y += 7;
  doc.setFont(undefined, "bold");
  doc.text(`Total: ${money(invoice.amount)}`, 190, y, { align: "right" });

  const blob = doc.output("blob");
  const path = `invoices/${invoice.id}-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("documents").upload(path, blob, { upsert: true });
  if (error) return { error };

  await supabase.from("invoice_documents").upsert(
    [{
      invoice_id: invoice.id,
      client_name: contact?.name || "Unknown",
      doc_date: invoice.date,
      status: invoice.payment_status === "paid" ? "paid" : "invoiced",
      file_path: path,
      source: "generated",
    }],
    { onConflict: "invoice_id" }
  );

  return { path };
}
