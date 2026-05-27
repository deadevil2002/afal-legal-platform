import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Info } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type CellType = "normal" | "highlight" | "info" | "upload" | "empty";

interface WorkflowCell {
  role: string;   // i18n key e.g. "matrix.role.sourcingRep"
  action: string; // i18n key e.g. "matrix.action.upload"
  type?: CellType;
  detail?: string; // descriptive tooltip — kept in English
}

interface WorkflowRow {
  id: string;
  requestType: string; // i18n key e.g. "matrix.row.vendorSelection"
  category: string;    // i18n key e.g. "matrix.cat.vendor"
  cells: (WorkflowCell | null)[];
}

// ─── Column definitions (14 fixed workflow stages) ────────────────────────────
// label/sub resolved at render time via t(`matrix.col.${id}.label/sub`)

const COLUMNS = [
  { id: "c0" },
  { id: "c1" },
  { id: "c2" },
  { id: "c3" },
  { id: "c4" },
  { id: "c5" },
  { id: "c6" },
  { id: "c7" },
  { id: "c8" },
  { id: "c9" },
  { id: "c10" },
  { id: "c11" },
  { id: "c12" },
  { id: "c13" },
];

// ─── Matrix data ──────────────────────────────────────────────────────────────

const MATRIX: WorkflowRow[] = [
  {
    id: "vendor-selection",
    requestType: "matrix.row.vendorSelection",
    category: "matrix.cat.vendor",
    cells: [
      null,
      null,
      null,
      null,
      { role: "matrix.role.committee1ProcCFO", action: "matrix.action.vendorCompetency", type: "highlight", detail: "Approval Committee-1 (Proc Head & CFO) evaluates vendor competency and commercial terms." },
      { role: "matrix.role.committee2EVP",     action: "matrix.action.paymentTerms",     type: "normal",    detail: "EVP reviews and approves payment terms with the vendor." },
      { role: "matrix.role.reviewer",          action: "matrix.action.reviewer",         type: "highlight", detail: "Committee Reviewer verifies compliance and completeness of vendor documentation." },
      null,
      null,
      { role: "matrix.role.committee4CEO",     action: "matrix.action.finalApproval",    type: "normal",    detail: "CEO provides final approval for the vendor selection." },
      null,
      null,
      { role: "matrix.role.afcDataRep",        action: "matrix.action.upload",           type: "upload",    detail: "AFC Data Center Rep uploads final documents to the system." },
      null,
    ],
  },
  {
    id: "vendor-registration",
    requestType: "matrix.row.vendorRegistration",
    category: "matrix.cat.vendor",
    cells: [
      { role: "matrix.role.sourcingRep",      action: "matrix.action.obtainComplianceDocs", type: "normal",    detail: "Sourcing Rep gathers all required compliance and regulatory documents from the vendor." },
      null,
      null,
      null,
      { role: "matrix.role.committee1Proc",   action: "matrix.action.verify",              type: "normal",    detail: "Proc Head verifies vendor compliance documentation is complete and valid." },
      { role: "matrix.role.committee2CFOEVP", action: "matrix.action.review",              type: "normal",    detail: "CFO/EVP reviews vendor registration for financial and operational fitness." },
      { role: "matrix.role.sourcingRep",      action: "matrix.action.vendorCreation",      type: "highlight", detail: "Sourcing Rep creates the vendor record in the ERP system." },
      null,
      null,
      { role: "matrix.role.committee4CEO",    action: "matrix.action.finalApproval",       type: "normal",    detail: "CEO gives final sign-off on the new vendor registration." },
      null,
      null,
      { role: "matrix.role.afcDataRep",       action: "matrix.action.upload",              type: "upload",    detail: "AFC Data Center Rep uploads the final vendor registration package." },
      null,
    ],
  },
  {
    id: "material-po",
    requestType: "matrix.row.materialPO",
    category: "matrix.cat.purchaseOrder",
    cells: [
      { role: "matrix.role.directManager",    action: "matrix.action.initiatePR",       type: "normal",    detail: "Direct Manager (Requester) initiates the Purchase Request for materials." },
      null,
      null,
      { role: "matrix.role.enggPlanning",     action: "matrix.action.validation",       type: "normal",    detail: "Engineering & Planning validates the material requirement and specification." },
      { role: "matrix.role.committee1Proc",   action: "matrix.action.reviewer",         type: "highlight", detail: "Procurement Head reviews and approves the PR before moving to sourcing." },
      null,
      null,
      { role: "matrix.role.accountRep",       action: "matrix.action.fundAllocation",   type: "normal",    detail: "Finance / Account Rep confirms budget availability and allocates funds." },
      { role: "matrix.role.buyerRep",         action: "matrix.action.placePO",          type: "highlight", detail: "Buyer Rep raises the Purchase Order in SAP / ERP after all approvals." },
      { role: "matrix.role.committee4EVPCEO", action: "matrix.action.finalApproval",    type: "normal",    detail: "EVP or CEO provides final approval for the PO." },
      { role: "matrix.role.blDirector",       action: "matrix.action.supplierEvaluation", type: "normal",  detail: "BL Director evaluates supplier performance post-delivery." },
      { role: "matrix.role.poClosure",        action: "matrix.action.asPerSignedPolicy", type: "info",     detail: "PO is closed in accordance with the company's signed procurement policy." },
      { role: "matrix.role.afcDataRep",       action: "matrix.action.upload",           type: "upload",    detail: "AFC Data Center Rep uploads the completed PO documents." },
      null,
    ],
  },
  {
    id: "back-charge-service-po",
    requestType: "matrix.row.backChargePO",
    category: "matrix.cat.purchaseOrder",
    cells: [
      { role: "matrix.role.directManager",  action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager submits the back-charge service request." },
      { role: "matrix.role.blDirectorShort",action: "matrix.action.confirmation",      type: "normal",    detail: "BL Director confirms the back-charge claim is valid." },
      null,
      null,
      { role: "matrix.role.committee1Proc", action: "matrix.action.contractCompliance",type: "normal",    detail: "Proc Head verifies the back-charge aligns with contract terms." },
      { role: "matrix.role.committee2EVP",  action: "matrix.action.approval",          type: "normal",    detail: "EVP approves the back-charge service order." },
      null,
      { role: "matrix.role.accountRep",     action: "matrix.action.fundAllocation",    type: "normal",    detail: "Account Rep allocates funds for the back-charge service." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer Rep raises the Service PO in SAP." },
      { role: "matrix.role.committee4CEO",  action: "matrix.action.finalApproval",     type: "normal",    detail: "CEO provides final approval for back-charge service PO." },
      { role: "matrix.role.blDirector",     action: "matrix.action.supplierEvaluation",type: "normal",    detail: "BL Director evaluates the service provider." },
      { role: "matrix.role.poClosure",      action: "matrix.action.asPerSignedPolicy", type: "info",      detail: "PO closed per policy." },
      { role: "matrix.role.afcDataRep",     action: "matrix.action.upload",            type: "upload",    detail: "Upload completed documents." },
      null,
    ],
  },
  {
    id: "manpower-rental-po",
    requestType: "matrix.row.manpowerRentalPO",
    category: "matrix.cat.purchaseOrder",
    cells: [
      { role: "matrix.role.directManager",  action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager submits manpower rental request." },
      { role: "matrix.role.blDirectorShort",action: "matrix.action.confirmation",      type: "normal",    detail: "BL Director confirms the manpower requirement." },
      null,
      { role: "matrix.role.enggVP",         action: "matrix.action.assessment",        type: "normal",    detail: "Engineering VP assesses manpower specifications and requirements." },
      { role: "matrix.role.committee1Proc", action: "matrix.action.concurrence",       type: "normal",    detail: "Procurement Head concurs with the manpower rental proposal." },
      { role: "matrix.role.committee2EVP",  action: "matrix.action.approval",          type: "normal",    detail: "EVP approves the manpower rental." },
      null,
      { role: "matrix.role.accountRep",     action: "matrix.action.reviewer",          type: "highlight", detail: "Finance Reviewer validates the cost and budget allocation." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer Rep issues the manpower rental PO." },
      { role: "matrix.role.committee4CEO",  action: "matrix.action.fundAllocation",    type: "normal",    detail: "CEO approves fund allocation for manpower rental." },
      { role: "matrix.role.blDirector",     action: "matrix.action.supplierEvaluation",type: "normal",    detail: "BL Director evaluates the manpower service provider." },
      null,
      null,
      null,
    ],
  },
  {
    id: "equipment-rental-po",
    requestType: "matrix.row.equipmentRentalPO",
    category: "matrix.cat.purchaseOrder",
    cells: [
      { role: "matrix.role.directManager",  action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager initiates equipment rental request." },
      { role: "matrix.role.blDirectorShort",action: "matrix.action.confirmation",      type: "normal",    detail: "BL Director confirms the equipment need." },
      { role: "matrix.role.wsDirector",     action: "matrix.action.confirmation",      type: "normal",    detail: "Workshop Director confirms equipment specifications." },
      { role: "matrix.role.enggVP",         action: "matrix.action.assessment",        type: "normal",    detail: "Engineering VP assesses equipment requirements." },
      { role: "matrix.role.committee1Proc", action: "matrix.action.concurrence",       type: "normal",    detail: "Proc Head concurs with equipment rental plan." },
      { role: "matrix.role.committee2EVP",  action: "matrix.action.approval",          type: "normal",    detail: "EVP approves equipment rental." },
      null,
      { role: "matrix.role.accountRep",     action: "matrix.action.reviewer",          type: "highlight", detail: "Finance reviews cost and funding." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer raises the equipment rental PO." },
      { role: "matrix.role.committee4CEO",  action: "matrix.action.fundAllocation",    type: "normal",    detail: "CEO approves fund allocation." },
      { role: "matrix.role.blDirector",     action: "matrix.action.supplierEvaluation",type: "normal",    detail: "BL Director evaluates equipment supplier." },
      null,
      null,
      null,
    ],
  },
  {
    id: "camps-rental-po",
    requestType: "matrix.row.campsRentalPO",
    category: "matrix.cat.purchaseOrder",
    cells: [
      { role: "matrix.role.directManager",   action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager initiates camp rental request." },
      { role: "matrix.role.blDirectorShort", action: "matrix.action.confirmation",      type: "normal",    detail: "BL Director confirms the camp facility need." },
      { role: "matrix.role.cfmdDirector",    action: "matrix.action.confirmation",      type: "normal",    detail: "Camp Facility Management Director confirms requirements." },
      { role: "matrix.role.enggVP",          action: "matrix.action.assessment",        type: "normal",    detail: "Engineering VP assesses camp setup requirements." },
      { role: "matrix.role.committee1Proc",  action: "matrix.action.concurrence",       type: "normal",    detail: "Proc Head concurs with the camp rental plan." },
      { role: "matrix.role.committee2CFMDEVP",action: "matrix.action.approval",         type: "normal",    detail: "CFMD EVP approves the camp rental." },
      null,
      { role: "matrix.role.accountRep",      action: "matrix.action.reviewer",          type: "highlight", detail: "Finance reviews funding and costs." },
      { role: "matrix.role.buyerRep",        action: "matrix.action.placePO",           type: "highlight", detail: "Buyer raises the camp rental PO." },
      { role: "matrix.role.committee4CEO",   action: "matrix.action.fundAllocation",    type: "normal",    detail: "CEO approves fund allocation." },
      { role: "matrix.role.blDirector",      action: "matrix.action.supplierEvaluation",type: "normal",    detail: "BL Director evaluates camp service provider." },
      null,
      null,
      null,
    ],
  },
  {
    id: "manpower-cert-po",
    requestType: "matrix.row.manpowerCertPO",
    category: "matrix.cat.certification",
    cells: [
      { role: "matrix.role.directManager",  action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager submits manpower certification request." },
      { role: "matrix.role.blDirectorShort",action: "matrix.action.confirmation",      type: "normal",    detail: "BL Director confirms certification need." },
      { role: "matrix.role.hrVP",           action: "matrix.action.confirmation",      type: "normal",    detail: "HR VP confirms manpower headcount and eligibility." },
      { role: "matrix.role.enggPlanning",   action: "matrix.action.initiatePR",        type: "normal",    detail: "Planning initiates the Purchase Request for certification." },
      { role: "matrix.role.committee1Proc", action: "matrix.action.validation",        type: "normal",    detail: "Proc Head validates the certification request." },
      null,
      { role: "matrix.role.reviewer",       action: "matrix.action.reviewer",          type: "highlight", detail: "Designated reviewer checks compliance requirements." },
      { role: "matrix.role.accountRep",     action: "matrix.action.fundAllocation",    type: "normal",    detail: "Account Rep allocates budget for certification." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer raises the certification PO." },
      null,
      { role: "matrix.role.blDirector",     action: "matrix.action.supplierEvaluation",type: "normal",    detail: "BL Director evaluates certification provider." },
      { role: "matrix.role.poClosure",      action: "matrix.action.asPerSignedPolicy", type: "info",      detail: "PO closed per signed policy." },
      { role: "matrix.role.afcDataRep",     action: "matrix.action.upload",            type: "upload",    detail: "Upload certification documentation." },
      null,
    ],
  },
  {
    id: "equipment-cert-po",
    requestType: "matrix.row.equipmentCertPO",
    category: "matrix.cat.certification",
    cells: [
      { role: "matrix.role.directManager",  action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager submits equipment certification request." },
      { role: "matrix.role.blDirectorShort",action: "matrix.action.confirmation",      type: "normal",    detail: "BL Director confirms equipment certification need." },
      { role: "matrix.role.wsDirector",     action: "matrix.action.confirmation",      type: "normal",    detail: "Workshop Director confirms equipment inspection requirements." },
      { role: "matrix.role.enggPlanning",   action: "matrix.action.initiatePR",        type: "normal",    detail: "Planning initiates the PR for equipment certification." },
      { role: "matrix.role.committee1Proc", action: "matrix.action.validation",        type: "normal",    detail: "Proc Head validates the certification scope." },
      null,
      { role: "matrix.role.reviewer",       action: "matrix.action.reviewer",          type: "highlight", detail: "Reviewer checks compliance and documentation." },
      { role: "matrix.role.accountRep",     action: "matrix.action.fundAllocation",    type: "normal",    detail: "Account Rep allocates funds for certification." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer places the equipment certification PO." },
      null,
      { role: "matrix.role.blDirector",     action: "matrix.action.supplierEvaluation",type: "normal",    detail: "BL Director evaluates certification body." },
      { role: "matrix.role.poClosure",      action: "matrix.action.asPerSignedPolicy", type: "info",      detail: "PO closed per policy." },
      { role: "matrix.role.afcDataRep",     action: "matrix.action.upload",            type: "upload",    detail: "Upload certification documents." },
      null,
    ],
  },
  {
    id: "camp-material-services",
    requestType: "matrix.row.campMaterialServices",
    category: "matrix.cat.materials",
    cells: [
      { role: "matrix.role.cfmdDirector",   action: "matrix.action.requester",         type: "normal",    detail: "CFMD Director initiates camp material and services request." },
      null,
      { role: "matrix.role.cfmdRep",        action: "matrix.action.initiatePR",        type: "normal",    detail: "CFMD Representative initiates the Purchase Request." },
      { role: "matrix.role.enggPlanning",   action: "matrix.action.validation",        type: "normal",    detail: "Planning validates the camp material requirements." },
      { role: "matrix.role.committee1Proc", action: "matrix.action.reviewer",          type: "highlight", detail: "Proc Head reviews and validates the PR." },
      null,
      null,
      { role: "matrix.role.accountRep",     action: "matrix.action.fundAllocation",    type: "normal",    detail: "Account Rep allocates budget for camp materials." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer raises the camp materials PO." },
      { role: "matrix.role.committee3EVP",  action: "matrix.action.approval",          type: "normal",    detail: "EVP approves the camp materials spend." },
      { role: "matrix.role.committee4CEO",  action: "matrix.action.finalApproval",     type: "normal",    detail: "CEO provides final approval." },
      { role: "matrix.role.poClosure",      action: "matrix.action.asPerSignedPolicy", type: "info",      detail: "PO closed per policy." },
      { role: "matrix.role.afcDataRep",     action: "matrix.action.upload",            type: "upload",    detail: "Upload completed documents." },
      null,
    ],
  },
  {
    id: "workshop-material-fuel",
    requestType: "matrix.row.workshopMaterial",
    category: "matrix.cat.materials",
    cells: [
      { role: "matrix.role.directManager",  action: "matrix.action.requester",         type: "normal",    detail: "Direct Manager submits workshop material, fuel or service request." },
      { role: "matrix.role.wsDirector",     action: "matrix.action.assessmentReview",  type: "normal",    detail: "Workshop Director assesses and reviews the request." },
      { role: "matrix.role.wsRep",          action: "matrix.action.initiatePR",        type: "normal",    detail: "Workshop Rep initiates the Purchase Request." },
      { role: "matrix.role.enggPlanning",   action: "matrix.action.validation",        type: "normal",    detail: "Planning validates the material / service need." },
      { role: "matrix.role.committee1Proc", action: "matrix.action.reviewer",          type: "highlight", detail: "Proc Head reviews the workshop materials PR." },
      null,
      null,
      { role: "matrix.role.accountRep",     action: "matrix.action.fundAllocation",    type: "normal",    detail: "Account Rep allocates budget." },
      { role: "matrix.role.buyerRep",       action: "matrix.action.placePO",           type: "highlight", detail: "Buyer issues the PO in SAP." },
      { role: "matrix.role.committee3EVP",  action: "matrix.action.approval",          type: "normal",    detail: "EVP approves the PO." },
      { role: "matrix.role.committee4CEO",  action: "matrix.action.finalApproval",     type: "normal",    detail: "CEO final sign-off." },
      { role: "matrix.role.poClosure",      action: "matrix.action.asPerSignedPolicy", type: "info",      detail: "PO closed per signed policy." },
      { role: "matrix.role.afcDataRep",     action: "matrix.action.upload",            type: "upload",    detail: "AFC Data Center Rep uploads all documents." },
      null,
    ],
  },
];

const ALL_CATEGORY_KEYS = [
  "matrix.cat.all",
  ...Array.from(new Set(MATRIX.map(r => r.category))),
];

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
  const { t } = useLanguage();
  const [filterCategory, setFilterCategory] = useState("matrix.cat.all");
  const [modal, setModal] = useState<{ cell: WorkflowCell; row: WorkflowRow; colId: string } | null>(null);

  const filtered = filterCategory === "matrix.cat.all"
    ? MATRIX
    : MATRIX.filter(r => r.category === filterCategory);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("matrix.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("matrix.subtitle")}</p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {([
            { color: "bg-[#2D6491]",                                    key: "matrix.legend.keyApproval" },
            { color: "bg-[#112B4D]",                                    key: "matrix.legend.standard"    },
            { color: "bg-[#16A8BA]/30 border border-[#16A8BA]/40",      key: "matrix.legend.upload"      },
            { color: "bg-[#BC9B5D]/30 border border-[#BC9B5D]/40",      key: "matrix.legend.policy"      },
          ] as const).map(({ color, key }) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span className="text-muted-foreground">{t(key)}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ms-auto">
            <Info className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">{t("matrix.clickHint")}</span>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORY_KEYS.map(catKey => (
            <button
              key={catKey}
              onClick={() => setFilterCategory(catKey)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterCategory === catKey
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/70 text-muted-foreground"
              }`}
            >
              {t(catKey)}
            </button>
          ))}
        </div>

        {/* Matrix table */}
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: "1400px" }}>
                <thead>
                  <tr className="bg-[#0C233C]">
                    <th className="text-start px-4 py-3 text-white font-semibold border-b border-white/10 w-48 sticky start-0 bg-[#0C233C] z-10">
                      {t("matrix.requestType")}
                    </th>
                    {COLUMNS.map((col) => (
                      <th key={col.id} className="px-2 py-3 text-center border-b border-white/10 w-28">
                        <div className="text-white font-semibold leading-tight">{t(`matrix.col.${col.id}.label`)}</div>
                        <div className="text-white/50 font-normal mt-0.5 text-[10px] leading-tight">{t(`matrix.col.${col.id}.sub`)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, ri) => (
                    <tr key={row.id} className={ri % 2 === 0 ? "bg-muted/20" : "bg-background"}>
                      {/* Request type label */}
                      <td className={`px-4 py-3 font-semibold text-sm border-e border-muted sticky start-0 z-10 ${ri % 2 === 0 ? "bg-muted/20" : "bg-background"}`}>
                        <div>{t(row.requestType)}</div>
                        <Badge variant="outline" className="mt-1 text-[10px] font-normal">{t(row.category)}</Badge>
                      </td>

                      {/* Workflow cells */}
                      {COLUMNS.map((col, ci) => {
                        const cell = row.cells[ci];
                        if (!cell) {
                          return <td key={col.id} className="px-2 py-2 text-center border-e border-muted/30 last:border-e-0" />;
                        }
                        return (
                          <td key={col.id} className="px-2 py-2 border-e border-muted/30 last:border-e-0">
                            <button
                              onClick={() => setModal({ cell, row, colId: col.id })}
                              className={`w-full rounded-md border px-2 py-2 text-center transition-all ${cellClass(cell.type)}`}
                            >
                              <div className="font-semibold leading-tight whitespace-pre-wrap text-[10px]">
                                {t(cell.role)}
                              </div>
                              <div className="mt-1 text-[10px] opacity-80 leading-tight">
                                {t(cell.action)}
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
                        {t("matrix.noMatch")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          {t("matrix.footer")}
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
                <h2 className="text-lg font-bold">{t(modal.cell.action)}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{t(modal.row.requestType)}</p>
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
                <span className="font-medium text-muted-foreground w-20 shrink-0">{t("matrix.modal.role")}:</span>
                <span className="whitespace-pre-wrap">{t(modal.cell.role)}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">{t("matrix.modal.action")}:</span>
                <span>{t(modal.cell.action)}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">{t("matrix.modal.stage")}:</span>
                <span>{t(`matrix.col.${modal.colId}.label`)} — {t(`matrix.col.${modal.colId}.sub`)}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-20 shrink-0">{t("matrix.modal.category")}:</span>
                <span>{t(modal.row.category)}</span>
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
                {t("matrix.modal.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
