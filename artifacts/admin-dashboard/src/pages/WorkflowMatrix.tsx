import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CellType = "normal" | "highlight" | "info" | "upload" | "empty";

interface WorkflowCell {
  role: string;
  action: string;
  type?: CellType;
  detail?: string;
}

interface WorkflowRow {
  id: string;
  requestType: string;
  category: string;
  cells: (WorkflowCell | null)[];
}

// ─── Column headers (14 fixed workflow members) ───────────────────────────────

const COLUMNS = [
  { id: "c0",  label: "Requester",               sub: "Direct Manager / Initiator" },
  { id: "c1",  label: "BL Director",              sub: "Business Line Director" },
  { id: "c2",  label: "Dept. Director",           sub: "WS / CFMD / HR VP" },
  { id: "c3",  label: "Engg / Planning",          sub: "Engineering & Planning VP" },
  { id: "c4",  label: "Proc. Committee 1",        sub: "Proc Head / Sourcing Rep" },
  { id: "c5",  label: "Committee 2",              sub: "CFO / EVP" },
  { id: "c6",  label: "Committee 3",              sub: "EVP / Sourcing Rep" },
  { id: "c7",  label: "Account Rep",              sub: "Finance / Account Rep" },
  { id: "c8",  label: "Buyer Rep",                sub: "Procurement Buyer" },
  { id: "c9",  label: "Committee 4",              sub: "CEO Final Approval" },
  { id: "c10", label: "BL Director",              sub: "Business Line — PO Review" },
  { id: "c11", label: "PO Closure",               sub: "As per Signed Policy" },
  { id: "c12", label: "AFC Data Center",          sub: "AFC Data Center Rep" },
  { id: "c13", label: "Compliance / Verify",      sub: "Additional Sign-off" },
];

// ─── Matrix data (mapped from reference image) ────────────────────────────────

const MATRIX: WorkflowRow[] = [
  {
    id: "vendor-selection",
    requestType: "Vendor Selection",
    category: "Vendor",
    cells: [
      null,
      null,
      null,
      null,
      { role: "Approval Committee-1\nProc Head & CFO", action: "Vendor Competency", type: "highlight", detail: "Approval Committee-1 (Proc Head & CFO) evaluates vendor competency and commercial terms." },
      { role: "Approval Committee-2\nEVP", action: "Payment Terms", type: "normal", detail: "EVP reviews and approves payment terms with the vendor." },
      { role: "Reviewer", action: "Reviewer", type: "highlight", detail: "Committee Reviewer verifies compliance and completeness of vendor documentation." },
      null,
      null,
      { role: "Approval Committee-4\nCEO", action: "Final Approval", type: "normal", detail: "CEO provides final approval for the vendor selection." },
      null,
      null,
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "AFC Data Center Rep uploads final documents to the system." },
      null,
    ],
  },
  {
    id: "vendor-registration",
    requestType: "Vendor Registration",
    category: "Vendor",
    cells: [
      { role: "Sourcing Rep", action: "Obtain Compliance Docs from Vendor", type: "normal", detail: "Sourcing Rep gathers all required compliance and regulatory documents from the vendor." },
      null,
      null,
      null,
      { role: "Approval Committee-1\nProc Head", action: "Verify", type: "normal", detail: "Proc Head verifies vendor compliance documentation is complete and valid." },
      { role: "Approval Committee-2\nCFO / EVP", action: "Review", type: "normal", detail: "CFO/EVP reviews vendor registration for financial and operational fitness." },
      { role: "Sourcing Rep", action: "Vendor Creation", type: "highlight", detail: "Sourcing Rep creates the vendor record in the ERP system." },
      null,
      null,
      { role: "Approval Committee-4\nCEO", action: "Final Approval", type: "normal", detail: "CEO gives final sign-off on the new vendor registration." },
      null,
      null,
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "AFC Data Center Rep uploads the final vendor registration package." },
      null,
    ],
  },
  {
    id: "material-po",
    requestType: "Material PO",
    category: "Purchase Order",
    cells: [
      { role: "Direct Manager", action: "Initiate PR", type: "normal", detail: "Direct Manager (Requester) initiates the Purchase Request for materials." },
      null,
      null,
      { role: "Engg / Planning", action: "Validation", type: "normal", detail: "Engineering & Planning validates the material requirement and specification." },
      { role: "Approval Committee-1\nProc Head", action: "Reviewer", type: "highlight", detail: "Procurement Head reviews and approves the PR before moving to sourcing." },
      null,
      null,
      { role: "Account Rep", action: "Fund Allocation", type: "normal", detail: "Finance / Account Rep confirms budget availability and allocates funds." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer Rep raises the Purchase Order in SAP / ERP after all approvals." },
      { role: "Approval Committee-4\nEVP / CEO", action: "Final Approval", type: "normal", detail: "EVP or CEO provides final approval for the PO." },
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates supplier performance post-delivery." },
      { role: "PO Closure", action: "As per Signed Policy", type: "info", detail: "PO is closed in accordance with the company's signed procurement policy." },
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "AFC Data Center Rep uploads the completed PO documents." },
      null,
    ],
  },
  {
    id: "back-charge-service-po",
    requestType: "Back Charge Service PO",
    category: "Purchase Order",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager submits the back-charge service request." },
      { role: "BL Director", action: "Confirmation", type: "normal", detail: "BL Director confirms the back-charge claim is valid." },
      null,
      null,
      { role: "Approval Committee-1\nProc Head", action: "Contract Compliance", type: "normal", detail: "Proc Head verifies the back-charge aligns with contract terms." },
      { role: "Approval Committee-2\nEVP", action: "Approval", type: "normal", detail: "EVP approves the back-charge service order." },
      null,
      { role: "Account Rep", action: "Fund Allocation", type: "normal", detail: "Account Rep allocates funds for the back-charge service." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer Rep raises the Service PO in SAP." },
      { role: "Approval Committee-4\nCEO", action: "Final Approval", type: "normal", detail: "CEO provides final approval for back-charge service PO." },
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates the service provider." },
      { role: "PO Closure", action: "As per Signed Policy", type: "info", detail: "PO closed per policy." },
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "Upload completed documents." },
      null,
    ],
  },
  {
    id: "manpower-rental-po",
    requestType: "Manpower Rental Services PO",
    category: "Purchase Order",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager submits manpower rental request." },
      { role: "BL Director", action: "Confirmation", type: "normal", detail: "BL Director confirms the manpower requirement." },
      null,
      { role: "Engg VP", action: "Assessment", type: "normal", detail: "Engineering VP assesses manpower specifications and requirements." },
      { role: "Approval Committee-1\nProc Head", action: "Concurrence", type: "normal", detail: "Procurement Head concurs with the manpower rental proposal." },
      { role: "Approval Committee-2\nEVP", action: "Approval", type: "normal", detail: "EVP approves the manpower rental." },
      null,
      { role: "Account Rep", action: "Reviewer", type: "highlight", detail: "Finance Reviewer validates the cost and budget allocation." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer Rep issues the manpower rental PO." },
      { role: "Approval Committee-4\nCEO", action: "Fund Allocation", type: "normal", detail: "CEO approves fund allocation for manpower rental." },
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates the manpower service provider." },
      null,
      null,
      null,
    ],
  },
  {
    id: "equipment-rental-po",
    requestType: "Equipment Rental Services PO",
    category: "Purchase Order",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager initiates equipment rental request." },
      { role: "BL Director", action: "Confirmation", type: "normal", detail: "BL Director confirms the equipment need." },
      { role: "WS Director", action: "Confirmation", type: "normal", detail: "Workshop Director confirms equipment specifications." },
      { role: "Engg VP", action: "Assessment", type: "normal", detail: "Engineering VP assesses equipment requirements." },
      { role: "Approval Committee-1\nProc Head", action: "Concurrence", type: "normal", detail: "Proc Head concurs with equipment rental plan." },
      { role: "Approval Committee-2\nEVP", action: "Approval", type: "normal", detail: "EVP approves equipment rental." },
      null,
      { role: "Account Rep", action: "Reviewer", type: "highlight", detail: "Finance reviews cost and funding." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer raises the equipment rental PO." },
      { role: "Approval Committee-4\nCEO", action: "Fund Allocation", type: "normal", detail: "CEO approves fund allocation." },
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates equipment supplier." },
      null,
      null,
      null,
    ],
  },
  {
    id: "camps-rental-po",
    requestType: "Camps Rental Services PO",
    category: "Purchase Order",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager initiates camp rental request." },
      { role: "BL Director", action: "Confirmation", type: "normal", detail: "BL Director confirms the camp facility need." },
      { role: "CFMD Director", action: "Confirmation", type: "normal", detail: "Camp Facility Management Director confirms requirements." },
      { role: "Engg VP", action: "Assessment", type: "normal", detail: "Engineering VP assesses camp setup requirements." },
      { role: "Approval Committee-1\nProc Head", action: "Concurrence", type: "normal", detail: "Proc Head concurs with the camp rental plan." },
      { role: "Approval Committee-2\nCFMD EVP", action: "Approval", type: "normal", detail: "CFMD EVP approves the camp rental." },
      null,
      { role: "Account Rep", action: "Reviewer", type: "highlight", detail: "Finance reviews funding and costs." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer raises the camp rental PO." },
      { role: "Approval Committee-4\nCEO", action: "Fund Allocation", type: "normal", detail: "CEO approves fund allocation." },
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates camp service provider." },
      null,
      null,
      null,
    ],
  },
  {
    id: "manpower-cert-po",
    requestType: "Manpower Certification PO",
    category: "Certification",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager submits manpower certification request." },
      { role: "BL Director", action: "Confirmation", type: "normal", detail: "BL Director confirms certification need." },
      { role: "HR VP", action: "Confirmation", type: "normal", detail: "HR VP confirms manpower headcount and eligibility." },
      { role: "Engg / Planning", action: "Initiate PR", type: "normal", detail: "Planning initiates the Purchase Request for certification." },
      { role: "Approval Committee-1\nProc Head", action: "Validation", type: "normal", detail: "Proc Head validates the certification request." },
      null,
      { role: "Reviewer", action: "Reviewer", type: "highlight", detail: "Designated reviewer checks compliance requirements." },
      { role: "Account Rep", action: "Fund Allocation", type: "normal", detail: "Account Rep allocates budget for certification." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer raises the certification PO." },
      null,
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates certification provider." },
      { role: "PO Closure", action: "As per Signed Policy", type: "info", detail: "PO closed per signed policy." },
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "Upload certification documentation." },
      null,
    ],
  },
  {
    id: "equipment-cert-po",
    requestType: "Equipment Certification PO",
    category: "Certification",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager submits equipment certification request." },
      { role: "BL Director", action: "Confirmation", type: "normal", detail: "BL Director confirms equipment certification need." },
      { role: "WS Director", action: "Confirmation", type: "normal", detail: "Workshop Director confirms equipment inspection requirements." },
      { role: "Engg / Planning", action: "Initiate PR", type: "normal", detail: "Planning initiates the PR for equipment certification." },
      { role: "Approval Committee-1\nProc Head", action: "Validation", type: "normal", detail: "Proc Head validates the certification scope." },
      null,
      { role: "Reviewer", action: "Reviewer", type: "highlight", detail: "Reviewer checks compliance and documentation." },
      { role: "Account Rep", action: "Fund Allocation", type: "normal", detail: "Account Rep allocates funds for certification." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer places the equipment certification PO." },
      null,
      { role: "Business Line Director", action: "Supplier Evaluation", type: "normal", detail: "BL Director evaluates certification body." },
      { role: "PO Closure", action: "As per Signed Policy", type: "info", detail: "PO closed per policy." },
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "Upload certification documents." },
      null,
    ],
  },
  {
    id: "camp-material-services",
    requestType: "Camp Material and Services",
    category: "Materials & Services",
    cells: [
      { role: "CFMD Director", action: "Requester", type: "normal", detail: "CFMD Director initiates camp material and services request." },
      null,
      { role: "CFMD Rep", action: "Initiate PR", type: "normal", detail: "CFMD Representative initiates the Purchase Request." },
      { role: "Engg / Planning", action: "Validation", type: "normal", detail: "Planning validates the camp material requirements." },
      { role: "Approval Committee-1\nProc Head", action: "Reviewer", type: "highlight", detail: "Proc Head reviews and validates the PR." },
      null,
      null,
      { role: "Account Rep", action: "Fund Allocation", type: "normal", detail: "Account Rep allocates budget for camp materials." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer raises the camp materials PO." },
      { role: "Approval Committee-3\nEVP", action: "Approval", type: "normal", detail: "EVP approves the camp materials spend." },
      { role: "Approval Committee-4\nCEO", action: "Final Approval", type: "normal", detail: "CEO provides final approval." },
      { role: "PO Closure", action: "As per Signed Policy", type: "info", detail: "PO closed per policy." },
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "Upload completed documents." },
      null,
    ],
  },
  {
    id: "workshop-material-fuel",
    requestType: "Workshop Material, Fuel & Services",
    category: "Materials & Services",
    cells: [
      { role: "Direct Manager", action: "Requester", type: "normal", detail: "Direct Manager submits workshop material, fuel or service request." },
      { role: "WS Director", action: "Assessment & Review", type: "normal", detail: "Workshop Director assesses and reviews the request." },
      { role: "WS Rep", action: "Initiate PR", type: "normal", detail: "Workshop Rep initiates the Purchase Request." },
      { role: "Engg / Planning", action: "Validation", type: "normal", detail: "Planning validates the material / service need." },
      { role: "Approval Committee-1\nProc Head", action: "Reviewer", type: "highlight", detail: "Proc Head reviews the workshop materials PR." },
      null,
      null,
      { role: "Account Rep", action: "Fund Allocation", type: "normal", detail: "Account Rep allocates budget." },
      { role: "Buyer Rep", action: "Place PO", type: "highlight", detail: "Buyer issues the PO in SAP." },
      { role: "Approval Committee-3\nEVP", action: "Approval", type: "normal", detail: "EVP approves the PO." },
      { role: "Approval Committee-4\nCEO", action: "Final Approval", type: "normal", detail: "CEO final sign-off." },
      { role: "PO Closure", action: "As per Signed Policy", type: "info", detail: "PO closed per signed policy." },
      { role: "AFC Data Center Rep", action: "Upload", type: "upload", detail: "AFC Data Center Rep uploads all documents." },
      null,
    ],
  },
];

const ALL_CATEGORIES = ["All", ...Array.from(new Set(MATRIX.map(r => r.category)))];

// ─── Cell styling ─────────────────────────────────────────────────────────────

function cellClass(type: CellType | undefined) {
  switch (type) {
    case "highlight": return "bg-[#2D6491] text-white cursor-pointer hover:bg-[#245480] border-[#2D6491]";
    case "upload":    return "bg-[#16A8BA]/10 text-[#16A8BA] border-[#16A8BA]/30 cursor-pointer hover:bg-[#16A8BA]/20";
    case "info":      return "bg-[#BC9B5D]/10 text-[#BC9B5D] border-[#BC9B5D]/30 cursor-pointer hover:bg-[#BC9B5D]/20";
    default:          return "bg-[#112B4D] text-white cursor-pointer hover:bg-[#1a3a60] border-[#112B4D]";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkflowMatrix() {
  const [filterCategory, setFilterCategory] = useState("All");
  const [modal, setModal] = useState<{ cell: WorkflowCell; row: WorkflowRow; col: typeof COLUMNS[0] } | null>(null);

  const filtered = filterCategory === "All"
    ? MATRIX
    : MATRIX.filter(r => r.category === filterCategory);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Matrix</h1>
          <p className="text-muted-foreground mt-1">
            Approval workflow for department representative requests — Supply Chain
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {[
            { color: "bg-[#2D6491]", label: "Key Approval Step" },
            { color: "bg-[#112B4D]", label: "Standard Approval" },
            { color: "bg-[#16A8BA]/30 border border-[#16A8BA]/40", label: "Upload / Document" },
            { color: "bg-[#BC9B5D]/30 border border-[#BC9B5D]/40", label: "Policy / Closure" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
            <Info className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Click any cell for details</span>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/70 text-muted-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Matrix table */}
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: "1400px" }}>
                <thead>
                  {/* Column headers — row 1: member labels */}
                  <tr className="bg-[#0C233C]">
                    <th className="text-left px-4 py-3 text-white font-semibold border-b border-white/10 w-48 sticky left-0 bg-[#0C233C] z-10">
                      REQUEST TYPE
                    </th>
                    {COLUMNS.map((col) => (
                      <th key={col.id} className="px-2 py-3 text-center border-b border-white/10 w-28">
                        <div className="text-white font-semibold leading-tight">{col.label}</div>
                        <div className="text-white/50 font-normal mt-0.5 text-[10px] leading-tight">{col.sub}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, ri) => (
                    <tr key={row.id} className={ri % 2 === 0 ? "bg-muted/20" : "bg-background"}>
                      {/* Request type label */}
                      <td className={`px-4 py-3 font-semibold text-sm border-r border-muted sticky left-0 z-10 ${ri % 2 === 0 ? "bg-muted/20" : "bg-background"}`}>
                        <div>{row.requestType}</div>
                        <Badge variant="outline" className="mt-1 text-[10px] font-normal">{row.category}</Badge>
                      </td>

                      {/* Workflow cells */}
                      {COLUMNS.map((col, ci) => {
                        const cell = row.cells[ci];
                        if (!cell) {
                          return <td key={col.id} className="px-2 py-2 text-center border-r border-muted/30 last:border-r-0" />;
                        }
                        return (
                          <td key={col.id} className="px-2 py-2 border-r border-muted/30 last:border-r-0">
                            <button
                              onClick={() => setModal({ cell, row, col })}
                              className={`w-full rounded-md border px-2 py-2 text-center transition-all ${cellClass(cell.type)}`}
                            >
                              <div className="font-semibold leading-tight whitespace-pre-wrap text-[10px]">
                                {cell.role}
                              </div>
                              <div className="mt-1 text-[10px] opacity-80 leading-tight">
                                {cell.action}
                              </div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="py-12 text-center text-muted-foreground">
                        No request types match the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Reference: Approval for Department Representative Request Workflow — Supply Chain. Data sourced from the AF Procurement Hub workflow matrix document.
        </p>
      </div>

      {/* Cell detail modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{modal.cell.action}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{modal.row.requestType}</p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">Role:</span>
                <span className="whitespace-pre-wrap">{modal.cell.role}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">Action:</span>
                <span>{modal.cell.action}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">Stage:</span>
                <span>{modal.col.label} — {modal.col.sub}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">Category:</span>
                <span>{modal.row.category}</span>
              </div>
            </div>

            {modal.cell.detail && (
              <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed">
                {modal.cell.detail}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
