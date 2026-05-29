import { Hono } from "hono";
import type { Env } from "../lib/types";

const router = new Hono<{ Bindings: Env }>();

// ─── HTML page generator ──────────────────────────────────────────────────────
// Returns a self-contained HTML page (no external JS/CSS dependencies) that:
//  - Fetches link status from procurement-api.isaudi.ai/api/public/supplier-link/:token
//  - Renders an EN/AR bilingual supplier quotation form
//  - Uploads attachments to Cloudinary (unsigned preset) before submitting
//  - Posts the completed form to procurement-api.isaudi.ai/api/public/supplier-response/:token
//
// The page works from any serving domain (procurement-api for testing, suppliers.isaudi.ai in prod).
// ─────────────────────────────────────────────────────────────────────────────

function generateHtml(token: string, cloudName: string, uploadPreset: string): string {
  const safe = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, "\\n");
  const safeToken = safe(token);
  const safeCloud = safe(cloudName);
  const safePreset = safe(uploadPreset);

  return `<!DOCTYPE html>
<html lang="en" dir="ltr" id="html-root">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="theme-color" content="#2D6491">
<title>Supplier Quotation Form – AF Procurement</title>
<style>
:root{--primary:#2D6491;--secondary:#16A8BA;--accent:#BC9B5D;--bg:#F5F7FA;--card:#FFFFFF;--fg:#111827;--muted:#6B7280;--border:#DDE3EC;--muted-bg:#EEF1F5;--error:#DC2626;--success:#16A34A;--radius:12px;--radius-sm:8px;--shadow:0 2px 12px rgba(0,0,0,.08)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;min-height:100vh}
body{padding:0 0 env(safe-area-inset-bottom,0) 0}
#app{max-width:680px;margin:0 auto;padding:16px 16px 48px}
/* ── Header ── */
.header{text-align:center;padding:24px 0 14px}
.logo-wrap{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px}
.logo-box{width:44px;height:44px;background:var(--primary);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand-name{font-size:18px;font-weight:700;color:var(--primary)}
.form-title{font-size:20px;font-weight:700;color:var(--fg);margin-bottom:4px}
.form-subtitle{font-size:13px;color:var(--muted);margin-bottom:10px}
/* ── Hint badge ── */
.hint-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(188,155,93,.12);border:1px solid rgba(188,155,93,.4);border-radius:20px;padding:4px 12px;margin-bottom:8px}
.hint-badge span{font-size:12px;font-weight:600;color:var(--accent)}
/* ── Product description ── */
.product-desc{background:rgba(45,100,145,.06);border:1px solid rgba(45,100,145,.2);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--primary);text-align:left}
.product-desc strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px}
/* ── Lang toggle ── */
.lang-toggle{display:flex;gap:6px;justify-content:center;margin-bottom:2px}
.lang-btn{padding:5px 16px;border-radius:20px;border:1.5px solid var(--border);background:transparent;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:all .15s}
.lang-btn.active{background:var(--primary);border-color:var(--primary);color:#fff}
/* ── Card / Section ── */
.card{background:var(--card);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:var(--shadow)}
.sec-hdr{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.sec-line{flex:1;height:1px;background:var(--border)}
.sec-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);white-space:nowrap}
/* ── Field ── */
.field{margin-bottom:14px}
.field:last-child{margin-bottom:0}
.label-row{display:flex;align-items:center;gap:4px;margin-bottom:5px}
.label{font-size:13px;font-weight:600;color:var(--fg)}
.req{color:var(--error);font-size:13px}
.field-err{font-size:12px;color:var(--error);margin-top:3px;display:none}
/* ── Input ── */
.inp{width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:14px;color:var(--fg);background:var(--card);outline:none;transition:border .15s;-webkit-appearance:none;appearance:none}
.inp:focus{border-color:var(--primary)}
.inp.err{border-color:var(--error)}
.inp:disabled{background:var(--muted-bg);color:var(--muted)}
textarea.inp{resize:vertical;min-height:76px}
/* ── Currency toggle ── */
.cur-toggle{display:flex;border:1.5px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:12px}
.cur-btn{flex:1;padding:8px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:var(--muted);transition:all .15s}
.cur-btn.active{background:var(--primary);color:#fff}
/* ── VAT box ── */
.vat-box{background:var(--muted-bg);border-radius:var(--radius-sm);padding:10px 12px;margin-top:8px}
.vat-note{font-size:11px;color:var(--muted);margin-bottom:4px}
.vat-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px}
.vat-row.total{font-weight:700;color:var(--primary)}
/* ── Payment terms ── */
.pt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pt-opt{padding:9px 4px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--card);cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);text-align:center;transition:all .15s}
.pt-opt.active{background:var(--primary);border-color:var(--primary);color:#fff}
.pt-opt.err-brd{border-color:var(--error)}
/* ── Upload ── */
.upload-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.upload-btn{display:flex;align-items:center;gap:6px;padding:7px 12px;border:1.5px dashed var(--border);border-radius:var(--radius-sm);background:transparent;cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);transition:all .15s;white-space:nowrap}
.upload-btn:hover{border-color:var(--secondary);color:var(--secondary)}
.file-name{font-size:12px;color:var(--success);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.rm-btn{background:none;border:none;cursor:pointer;color:var(--error);font-size:20px;line-height:1;padding:0 2px;flex-shrink:0}
.up-prog{font-size:12px;color:var(--muted)}
.up-err{font-size:12px;color:var(--error);margin-top:3px}
/* ── Error banner ── */
.err-banner{display:none;align-items:center;gap:8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;font-size:13px;color:var(--error)}
/* ── Submit ── */
.submit-btn{width:100%;padding:14px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius);font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s;margin-top:8px}
.submit-btn:disabled{opacity:.6;cursor:not-allowed}
/* ── Status / Loading ── */
.centered{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:65vh;text-align:center;padding:24px}
.status-card{background:var(--card);border-radius:var(--radius);padding:28px 20px;box-shadow:var(--shadow);max-width:320px;width:100%;border:2px solid var(--border);margin:16px 0}
.status-icon{font-size:52px;margin-bottom:12px}
.status-title{font-size:18px;font-weight:700;margin-bottom:6px}
.status-msg{font-size:14px;color:var(--muted)}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;margin-bottom:12px}
@keyframes spin{to{transform:rotate(360deg)}}
.powered-by{font-size:12px;color:var(--muted);margin-top:20px;text-align:center}
/* ── RTL ── */
[dir=rtl] .label-row,[dir=rtl] .sec-hdr,[dir=rtl] .vat-row,[dir=rtl] .upload-row{flex-direction:row-reverse}
[dir=rtl] .inp,[dir=rtl] textarea.inp,[dir=rtl] .field-err,[dir=rtl] .label,[dir=rtl] .vat-note,[dir=rtl] .up-err{text-align:right}
[dir=rtl] .pt-opt{direction:rtl}
[dir=rtl] .err-banner{flex-direction:row-reverse;text-align:right}
[dir=rtl] .product-desc{text-align:right}
/* ── Responsive ── */
@media(max-width:400px){.pt-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div id="app">

  <!-- Loading -->
  <div id="v-loading" class="centered">
    <div class="spinner"></div>
    <p id="loading-msg" style="color:var(--muted);font-size:14px"></p>
  </div>

  <!-- Status (expired / used / deactivated / not-found) -->
  <div id="v-status" style="display:none" class="centered">
    <div class="logo-wrap">
      <div class="logo-box"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
      <span class="brand-name">AF Procurement</span>
    </div>
    <div class="status-card" id="status-card">
      <div class="status-icon" id="status-icon"></div>
      <div class="status-title" id="status-title"></div>
      <div class="status-msg" id="status-msg"></div>
    </div>
    <p class="powered-by" id="pb-status"></p>
  </div>

  <!-- Success -->
  <div id="v-success" style="display:none" class="centered">
    <div class="logo-wrap">
      <div class="logo-box"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
      <span class="brand-name">AF Procurement</span>
    </div>
    <div class="status-card" style="border-color:#bbf7d0">
      <div class="status-icon">&#x2705;</div>
      <div class="status-title" id="ok-title" style="color:var(--success)"></div>
      <div class="status-msg" id="ok-msg"></div>
    </div>
    <p class="powered-by" id="pb-success"></p>
  </div>

  <!-- Form -->
  <div id="v-form" style="display:none">
    <div class="header">
      <div class="logo-wrap">
        <div class="logo-box"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
        <span class="brand-name">AF Procurement</span>
      </div>
      <p class="form-title" id="form-title"></p>
      <div id="hint-badge" class="hint-badge" style="display:none">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        <span id="hint-text"></span>
      </div>
      <div id="prod-desc-card" class="product-desc" style="display:none">
        <strong id="prod-desc-lbl"></strong>
        <span id="prod-desc-text"></span>
      </div>
      <p class="form-subtitle" id="form-subtitle"></p>
      <div class="lang-toggle">
        <button class="lang-btn active" id="btn-en" onclick="setLang('en')">English</button>
        <button class="lang-btn" id="btn-ar" onclick="setLang('ar')">&#x627;&#x644;&#x639;&#x631;&#x628;&#x64A;&#x629;</button>
      </div>
    </div>

    <!-- Error banner -->
    <div id="err-banner" class="err-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="err-banner-text"></span>
    </div>

    <!-- Company Identity -->
    <div class="card">
      <div class="sec-hdr"><div class="sec-line"></div><div class="sec-title" id="sec-company"></div><div class="sec-line"></div></div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-companyName"></label><span class="req">*</span></div>
        <input class="inp" id="f-companyName" autocomplete="organization">
        <div class="field-err" id="err-companyName"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-crNum"></label><span class="req">*</span></div>
        <input class="inp" id="f-crNum" placeholder="1010XXXXXX">
        <div class="field-err" id="err-crNum"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-crAttach"></label></div>
        <div class="upload-row">
          <button type="button" class="upload-btn" onclick="triggerUpload('crAttach')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span id="ul-crAttach"></span>
          </button>
          <span class="file-name" id="fn-crAttach" style="display:none"></span>
          <button type="button" class="rm-btn" id="rm-crAttach" style="display:none" onclick="removeUpload('crAttach')">&#x00D7;</button>
          <span class="up-prog" id="prog-crAttach" style="display:none"></span>
        </div>
        <div class="up-err" id="ue-crAttach"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-accredNum"></label><span class="req">*</span></div>
        <input class="inp" id="f-accredNum">
        <div class="field-err" id="err-accredNum"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-accredAttach"></label></div>
        <div class="upload-row">
          <button type="button" class="upload-btn" onclick="triggerUpload('accredAttach')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span id="ul-accredAttach"></span>
          </button>
          <span class="file-name" id="fn-accredAttach" style="display:none"></span>
          <button type="button" class="rm-btn" id="rm-accredAttach" style="display:none" onclick="removeUpload('accredAttach')">&#x00D7;</button>
          <span class="up-prog" id="prog-accredAttach" style="display:none"></span>
        </div>
        <div class="up-err" id="ue-accredAttach"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-zatca"></label><span class="req">*</span></div>
        <input class="inp" id="f-zatca">
        <div class="field-err" id="err-zatca"></div>
      </div>
    </div>

    <!-- Contact -->
    <div class="card">
      <div class="sec-hdr"><div class="sec-line"></div><div class="sec-title" id="sec-contact"></div><div class="sec-line"></div></div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-phone"></label><span class="req">*</span></div>
        <input class="inp" id="f-phone" type="tel" placeholder="+966 5X XXX XXXX" autocomplete="tel">
        <div class="field-err" id="err-phone"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-email"></label><span class="req">*</span></div>
        <input class="inp" id="f-email" type="email" placeholder="email@company.com" autocomplete="email" dir="ltr">
        <div class="field-err" id="err-email"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-contactPerson"></label><span class="req">*</span></div>
        <input class="inp" id="f-contactPerson" autocomplete="name">
        <div class="field-err" id="err-contactPerson"></div>
      </div>
    </div>

    <!-- National Address -->
    <div class="card">
      <div class="sec-hdr"><div class="sec-line"></div><div class="sec-title" id="sec-address"></div><div class="sec-line"></div></div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-address"></label><span class="req">*</span></div>
        <textarea class="inp" id="f-address" rows="2"></textarea>
        <div class="field-err" id="err-address"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-addrAttach"></label></div>
        <div class="upload-row">
          <button type="button" class="upload-btn" onclick="triggerUpload('addrAttach')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span id="ul-addrAttach"></span>
          </button>
          <span class="file-name" id="fn-addrAttach" style="display:none"></span>
          <button type="button" class="rm-btn" id="rm-addrAttach" style="display:none" onclick="removeUpload('addrAttach')">&#x00D7;</button>
          <span class="up-prog" id="prog-addrAttach" style="display:none"></span>
        </div>
        <div class="up-err" id="ue-addrAttach"></div>
      </div>
    </div>

    <!-- Banking -->
    <div class="card">
      <div class="sec-hdr"><div class="sec-line"></div><div class="sec-title" id="sec-banking"></div><div class="sec-line"></div></div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-iban"></label><span class="req">*</span></div>
        <input class="inp" id="f-iban" placeholder="SA00 0000 0000 0000 0000 0000" dir="ltr">
        <div class="field-err" id="err-iban"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-ibanAttach"></label></div>
        <div class="upload-row">
          <button type="button" class="upload-btn" onclick="triggerUpload('ibanAttach')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span id="ul-ibanAttach"></span>
          </button>
          <span class="file-name" id="fn-ibanAttach" style="display:none"></span>
          <button type="button" class="rm-btn" id="rm-ibanAttach" style="display:none" onclick="removeUpload('ibanAttach')">&#x00D7;</button>
          <span class="up-prog" id="prog-ibanAttach" style="display:none"></span>
        </div>
        <div class="up-err" id="ue-ibanAttach"></div>
      </div>
    </div>

    <!-- Pricing -->
    <div class="card">
      <div class="sec-hdr"><div class="sec-line"></div><div class="sec-title" id="sec-pricing"></div><div class="sec-line"></div></div>

      <div style="margin-bottom:10px">
        <div class="label-row" style="margin-bottom:6px"><label class="label" id="lbl-currency"></label></div>
        <div class="cur-toggle">
          <button type="button" class="cur-btn active" id="btn-sar" onclick="setCurrency('SAR')">SAR (&#x631;&#x64A;&#x627;&#x644;)</button>
          <button type="button" class="cur-btn" id="btn-usd" onclick="setCurrency('USD')">USD ($)</button>
        </div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-price"></label><span class="req">*</span></div>
        <input class="inp" id="f-price" type="number" placeholder="0.00" min="0" step="0.01" inputmode="decimal">
        <div class="field-err" id="err-price"></div>
      </div>

      <div id="vat-box" class="vat-box">
        <p class="vat-note" id="vat-note"></p>
        <div class="vat-row"><span id="vat-lbl"></span><span id="vat-amt">SAR 0.00</span></div>
        <div class="vat-row total"><span id="total-lbl"></span><span id="total-amt">SAR 0.00</span></div>
      </div>

      <div class="field" style="margin-top:12px">
        <div class="label-row"><label class="label" id="lbl-quotAttach"></label></div>
        <div class="upload-row">
          <button type="button" class="upload-btn" onclick="triggerUpload('quotAttach')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span id="ul-quotAttach"></span>
          </button>
          <span class="file-name" id="fn-quotAttach" style="display:none"></span>
          <button type="button" class="rm-btn" id="rm-quotAttach" style="display:none" onclick="removeUpload('quotAttach')">&#x00D7;</button>
          <span class="up-prog" id="prog-quotAttach" style="display:none"></span>
        </div>
        <div class="up-err" id="ue-quotAttach"></div>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-payment"></label><span class="req">*</span></div>
        <div class="pt-grid" id="pt-grid">
          <button type="button" class="pt-opt" id="pt-advance" onclick="setPayment('advance')"></button>
          <button type="button" class="pt-opt" id="pt-50_50" onclick="setPayment('50_50')"></button>
          <button type="button" class="pt-opt" id="pt-after_supply" onclick="setPayment('after_supply')"></button>
        </div>
        <div class="field-err" id="err-payment"></div>
      </div>
    </div>

    <!-- Notes & Extra attachments -->
    <div class="card">
      <div class="sec-hdr"><div class="sec-line"></div><div class="sec-title" id="sec-notes"></div><div class="sec-line"></div></div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-notes"></label></div>
        <textarea class="inp" id="f-notes" rows="3"></textarea>
      </div>

      <div class="field">
        <div class="label-row"><label class="label" id="lbl-extraAttach"></label></div>
        <div id="extra-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
        <button type="button" class="upload-btn" onclick="triggerExtraUpload()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span id="ul-extra"></span>
        </button>
        <div class="up-err" id="ue-extra"></div>
      </div>
    </div>

    <button type="button" class="submit-btn" id="submit-btn" onclick="handleSubmit()"></button>
    <p class="powered-by" id="pb-form"></p>
  </div>
</div>

<!-- Hidden file inputs -->
<input type="file" id="fi-crAttach"    accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="uploadFile(this,'crAttach')">
<input type="file" id="fi-accredAttach" accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="uploadFile(this,'accredAttach')">
<input type="file" id="fi-addrAttach"  accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="uploadFile(this,'addrAttach')">
<input type="file" id="fi-ibanAttach"  accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="uploadFile(this,'ibanAttach')">
<input type="file" id="fi-quotAttach"  accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="uploadFile(this,'quotAttach')">
<input type="file" id="fi-extra"       accept="image/*,.pdf,.doc,.docx" style="display:none" onchange="uploadExtraFile(this)">

<script>
// ─── Bootstrap constants (injected server-side) ────────────────────────────
var TOKEN       = '${safeToken}';
var CLOUD_NAME  = '${safeCloud}';
var UPLOAD_PRE  = '${safePreset}';
var API_BASE    = 'https://procurement-api.isaudi.ai';

// ─── App state ─────────────────────────────────────────────────────────────
var lang     = 'en';
var currency = 'SAR';
var payTerm  = '';
var uploads  = {}; // key => {url,name,storagePath} | 'uploading' | null
var extras   = []; // array of {url,name,storagePath} | null

// ─── Translations ──────────────────────────────────────────────────────────
var T = {
  en: {
    loading:'Loading supplier form\u2026',
    poweredBy:'Powered by AF Procurement Hub',
    formTitle:'Supplier Quotation Form',
    formSubtitle:'Complete all required fields (\u2605) to submit your quotation.',
    prodDescLbl:'Product / Service Description',
    secCompany:'Company Identity',
    secContact:'Contact Information',
    secAddress:'National Address',
    secBanking:'Banking Information',
    secPricing:'Pricing',
    secNotes:'Notes & Attachments',
    lblCompanyName:'Company Name',
    lblCrNum:'Commercial Registration No.',
    lblCrAttach:'CR Document (optional)',
    lblAccredNum:'Accreditation No.',
    lblAccredAttach:'Accreditation Certificate (optional)',
    lblZatca:'ZATCA Number',
    lblPhone:'Phone Number',
    lblEmail:'Email Address',
    lblContactPerson:'Contact Person Name',
    lblAddress:'National Address',
    lblAddrAttach:'Address Document (optional)',
    lblIban:'IBAN Number',
    lblIbanAttach:'IBAN Document (optional)',
    lblCurrency:'Quotation Currency',
    lblPriceSar:'Price (excl. VAT) \u2014 SAR',
    lblPriceUsd:'Price \u2014 USD',
    lblQuotAttach:'Formal Quotation (optional)',
    lblPayment:'Payment Terms',
    lblNotes:'Additional Notes (optional)',
    lblExtraAttach:'Additional Attachments',
    vatNote:'VAT calculated at 15% on SAR quotations.',
    vatLbl:'VAT (15%)',
    totalLbl:'Total incl. VAT',
    ptAdvance:'Advance Payment',
    pt50_50:'50% / 50%',
    ptAfterSupply:'After Supply',
    upload:'Upload File',
    addAttach:'Add Attachment',
    submit:'Submit Quotation',
    submitting:'Submitting\u2026',
    required:'This field is required',
    invalidEmail:'Enter a valid email address',
    invalidPrice:'Enter a valid price greater than 0',
    statusUsed:'A quotation has already been submitted for this link.',
    statusExpired:'This supplier link has expired or been deactivated.',
    statusDeactivated:'This supplier link has been deactivated.',
    statusNotFound:'Supplier link not found or invalid.',
    successTitle:'Quotation Submitted!',
    successMsg:'Your quotation has been received. The procurement team will review it shortly.',
    submitError:'Submission failed. Please try again.',
    uploadError:'Upload failed. Please try again.',
    uploading:'Uploading\u2026'
  },
  ar: {
    loading:'\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0645\u0648\u0631\u062F\u2026',
    poweredBy:'\u0645\u062F\u0639\u0648\u0645 \u0628\u0648\u0627\u0633\u0637\u0629 AF Procurement Hub',
    formTitle:'\u0646\u0645\u0648\u0630\u062C \u0639\u0631\u0636 \u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u0648\u0631\u062F',
    formSubtitle:'\u064A\u0631\u062C\u0649 \u0625\u0643\u0645\u0627\u0644 \u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 (\u2605) \u0644\u062A\u0642\u062F\u064A\u0645 \u0639\u0631\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631.',
    prodDescLbl:'\u0648\u0635\u0641 \u0627\u0644\u0645\u0646\u062A\u062C \u0623\u0648 \u0627\u0644\u062E\u062F\u0645\u0629',
    secCompany:'\u0647\u0648\u064A\u0629 \u0627\u0644\u0634\u0631\u0643\u0629',
    secContact:'\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u062A\u0648\u0627\u0635\u0644',
    secAddress:'\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0648\u0637\u0646\u064A',
    secBanking:'\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0628\u0646\u0643\u064A\u0629',
    secPricing:'\u0627\u0644\u062A\u0633\u0639\u064A\u0631',
    secNotes:'\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0648\u0645\u0631\u0641\u0642\u0627\u062A',
    lblCompanyName:'\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629',
    lblCrNum:'\u0631\u0642\u0645 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062A\u062C\u0627\u0631\u064A',
    lblCrAttach:'\u0648\u062B\u064A\u0642\u0629 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062A\u062C\u0627\u0631\u064A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)',
    lblAccredNum:'\u0631\u0642\u0645 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F',
    lblAccredAttach:'\u0634\u0647\u0627\u062F\u0629 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)',
    lblZatca:'\u0631\u0642\u0645 \u0647\u064A\u0626\u0629 \u0627\u0644\u0632\u0643\u0627\u0629',
    lblPhone:'\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641',
    lblEmail:'\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A',
    lblContactPerson:'\u0627\u0633\u0645 \u062C\u0647\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644',
    lblAddress:'\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0648\u0637\u0646\u064A',
    lblAddrAttach:'\u0648\u062B\u064A\u0642\u0629 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)',
    lblIban:'\u0631\u0642\u0645 \u0627\u0644\u0622\u064A\u0628\u0627\u0646',
    lblIbanAttach:'\u0648\u062B\u064A\u0642\u0629 \u0627\u0644\u0622\u064A\u0628\u0627\u0646 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)',
    lblCurrency:'\u0639\u0645\u0644\u0629 \u0627\u0644\u0639\u0631\u0636',
    lblPriceSar:'\u0627\u0644\u0633\u0639\u0631 (\u0628\u062F\u0648\u0646 \u0636\u0631\u064A\u0628\u0629) \u2014 \u0631\u064A\u0627\u0644',
    lblPriceUsd:'\u0627\u0644\u0633\u0639\u0631 \u2014 \u062F\u0648\u0644\u0627\u0631',
    lblQuotAttach:'\u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0631\u0633\u0645\u064A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)',
    lblPayment:'\u0634\u0631\u0648\u0637 \u0627\u0644\u062F\u0641\u0639',
    lblNotes:'\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)',
    lblExtraAttach:'\u0645\u0631\u0641\u0642\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629',
    vatNote:'\u064A\u064F\u062D\u062A\u0633\u0628 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 \u0628\u0646\u0633\u0628\u0629 15% \u0639\u0644\u0649 \u0639\u0631\u0648\u0636 \u0627\u0644\u0631\u064A\u0627\u0644.',
    vatLbl:'\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (15%)',
    totalLbl:'\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0634\u0627\u0645\u0644 \u0627\u0644\u0636\u0631\u064A\u0628\u0629',
    ptAdvance:'\u062F\u0641\u0639 \u0645\u0642\u062F\u0645',
    pt50_50:'50% / 50%',
    ptAfterSupply:'\u0628\u0639\u062F \u0627\u0644\u062A\u0648\u0631\u064A\u062F',
    upload:'\u0631\u0641\u0639 \u0645\u0644\u0641',
    addAttach:'\u0625\u0636\u0627\u0641\u0629 \u0645\u0631\u0641\u0642',
    submit:'\u0625\u0631\u0633\u0627\u0644 \u0639\u0631\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631',
    submitting:'\u062C\u0627\u0631\u064A \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026',
    required:'\u0647\u0630\u0627 \u0627\u0644\u062D\u0642\u0644 \u0645\u0637\u0644\u0648\u0628',
    invalidEmail:'\u0623\u062F\u062E\u0644 \u0639\u0646\u0648\u0627\u0646 \u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0635\u062D\u064A\u062D',
    invalidPrice:'\u0623\u062F\u062E\u0644 \u0633\u0639\u0631\u064B\u0627 \u0635\u062D\u064A\u062D\u064B\u0627 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631',
    statusUsed:'\u062A\u0645 \u062A\u0642\u062F\u064A\u0645 \u0639\u0631\u0636 \u0623\u0633\u0639\u0627\u0631 \u0644\u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637 \u0645\u0633\u0628\u0642\u064B\u0627.',
    statusExpired:'\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u0631\u062F \u0623\u0648 \u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062A\u0641\u0639\u064A\u0644\u0647.',
    statusDeactivated:'\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u0631\u062F.',
    statusNotFound:'\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u0631\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.',
    successTitle:'\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0639\u0631\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631!',
    successMsg:'\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0639\u0631\u0636 \u0623\u0633\u0639\u0627\u0631\u0643. \u0633\u064A\u0642\u0648\u0645 \u0641\u0631\u064A\u0642 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0628\u0645\u0631\u0627\u062C\u0639\u062A\u0647 \u0642\u0631\u064A\u0628\u064B\u0627.',
    submitError:'\u0641\u0634\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627.',
    uploadError:'\u0641\u0634\u0644 \u0627\u0644\u0631\u0641\u0639. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627.',
    uploading:'\u062C\u0627\u0631\u064A \u0627\u0644\u0631\u0641\u0639\u2026'
  }
};

function t(k) { return (T[lang] && T[lang][k]) || T.en[k] || k; }

// ─── View management ───────────────────────────────────────────────────────
function showView(id) {
  ['v-loading','v-status','v-success','v-form'].forEach(function(v) {
    var el = document.getElementById(v);
    if (el) el.style.display = (v === id) ? '' : 'none';
  });
}

// ─── DOM helpers ───────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function setText(id, v) { var e = el(id); if (e) e.textContent = v; }

// ─── Language ──────────────────────────────────────────────────────────────
function setLang(l) {
  lang = l;
  var root = el('html-root');
  root.setAttribute('lang', l);
  root.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
  el('btn-en').classList.toggle('active', l === 'en');
  el('btn-ar').classList.toggle('active', l === 'ar');
  renderLabels();
}

// ─── Currency ──────────────────────────────────────────────────────────────
function setCurrency(c) {
  currency = c;
  el('btn-sar').classList.toggle('active', c === 'SAR');
  el('btn-usd').classList.toggle('active', c === 'USD');
  renderPriceLbl();
  updateVat();
}

function renderPriceLbl() {
  setText('lbl-price', currency === 'SAR' ? t('lblPriceSar') : t('lblPriceUsd'));
  el('vat-box').style.display = currency === 'SAR' ? '' : 'none';
}

// ─── VAT ───────────────────────────────────────────────────────────────────
function updateVat() {
  var price = parseFloat(el('f-price').value) || 0;
  var vat   = Math.round(price * 0.15 * 100) / 100;
  var total = Math.round(price * 1.15 * 100) / 100;
  var fmt   = function(n) { return 'SAR ' + n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); };
  setText('vat-amt',   fmt(vat));
  setText('total-amt', fmt(total));
}

// ─── Payment terms ─────────────────────────────────────────────────────────
function setPayment(v) {
  payTerm = v;
  ['advance','50_50','after_supply'].forEach(function(p) {
    el('pt-' + p).classList.toggle('active', p === v);
    el('pt-' + p).classList.remove('err-brd');
  });
  clearErr('payment');
}

// ─── Upload helpers ────────────────────────────────────────────────────────
function triggerUpload(key) { el('fi-' + key).click(); }

function uploadFile(input, key) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';

  uploads[key] = 'uploading';
  el('prog-' + key).textContent = t('uploading');
  el('prog-' + key).style.display = '';
  el('fn-' + key).style.display = 'none';
  el('rm-' + key).style.display = 'none';
  el('ue-' + key).textContent = '';

  var fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRE);

  fetch('https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/auto/upload', { method: 'POST', body: fd })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.secure_url) throw new Error('no url');
      uploads[key] = { url: data.secure_url, name: data.original_filename || file.name, storagePath: data.public_id };
      el('fn-' + key).textContent = data.original_filename || file.name;
      el('fn-' + key).style.display = '';
      el('rm-' + key).style.display = '';
      el('prog-' + key).style.display = 'none';
    })
    .catch(function() {
      uploads[key] = null;
      el('ue-' + key).textContent = t('uploadError');
      el('prog-' + key).style.display = 'none';
    });
}

function removeUpload(key) {
  uploads[key] = null;
  el('fn-' + key).style.display = 'none';
  el('rm-' + key).style.display = 'none';
}

// ─── Extra attachments ─────────────────────────────────────────────────────
function triggerExtraUpload() { el('fi-extra').click(); }

function uploadExtraFile(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';

  var idx = extras.length;
  extras.push(null);
  renderExtraList();
  el('ue-extra').textContent = '';

  var fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRE);

  fetch('https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/auto/upload', { method: 'POST', body: fd })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.secure_url) throw new Error('no url');
      extras[idx] = { url: data.secure_url, name: data.original_filename || file.name, storagePath: data.public_id };
      renderExtraList();
    })
    .catch(function() {
      extras.splice(idx, 1);
      el('ue-extra').textContent = t('uploadError');
      renderExtraList();
    });
}

function removeExtra(idx) {
  extras.splice(idx, 1);
  renderExtraList();
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderExtraList() {
  var listEl = el('extra-list');
  listEl.innerHTML = '';
  extras.forEach(function(u, i) {
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:8px';
    if (u) {
      div.innerHTML = '<span class="file-name">' + escHtml(u.name) + '</span>' +
        '<button type="button" class="rm-btn" onclick="removeExtra(' + i + ')">&#x00D7;</button>';
    } else {
      div.innerHTML = '<span class="up-prog">' + t('uploading') + '</span>';
    }
    listEl.appendChild(div);
  });
}

// ─── Labels ────────────────────────────────────────────────────────────────
function renderLabels() {
  setText('loading-msg',    t('loading'));
  setText('pb-status',      t('poweredBy'));
  setText('pb-success',     t('poweredBy'));
  setText('pb-form',        t('poweredBy'));
  setText('form-title',     t('formTitle'));
  setText('form-subtitle',  t('formSubtitle'));
  setText('prod-desc-lbl',  t('prodDescLbl'));
  setText('sec-company',    t('secCompany'));
  setText('sec-contact',    t('secContact'));
  setText('sec-address',    t('secAddress'));
  setText('sec-banking',    t('secBanking'));
  setText('sec-pricing',    t('secPricing'));
  setText('sec-notes',      t('secNotes'));
  setText('lbl-companyName', t('lblCompanyName'));
  setText('lbl-crNum',       t('lblCrNum'));
  setText('lbl-crAttach',    t('lblCrAttach'));
  setText('ul-crAttach',     t('upload'));
  setText('lbl-accredNum',   t('lblAccredNum'));
  setText('lbl-accredAttach',t('lblAccredAttach'));
  setText('ul-accredAttach', t('upload'));
  setText('lbl-zatca',       t('lblZatca'));
  setText('lbl-phone',       t('lblPhone'));
  setText('lbl-email',       t('lblEmail'));
  setText('lbl-contactPerson',t('lblContactPerson'));
  setText('lbl-address',     t('lblAddress'));
  setText('lbl-addrAttach',  t('lblAddrAttach'));
  setText('ul-addrAttach',   t('upload'));
  setText('lbl-iban',        t('lblIban'));
  setText('lbl-ibanAttach',  t('lblIbanAttach'));
  setText('ul-ibanAttach',   t('upload'));
  setText('lbl-currency',    t('lblCurrency'));
  setText('vat-note',        t('vatNote'));
  setText('vat-lbl',         t('vatLbl'));
  setText('total-lbl',       t('totalLbl'));
  setText('lbl-quotAttach',  t('lblQuotAttach'));
  setText('ul-quotAttach',   t('upload'));
  setText('lbl-payment',     t('lblPayment'));
  setText('pt-advance',      t('ptAdvance'));
  setText('pt-50_50',        t('pt50_50'));
  setText('pt-after_supply', t('ptAfterSupply'));
  setText('lbl-notes',       t('lblNotes'));
  setText('lbl-extraAttach', t('lblExtraAttach'));
  setText('ul-extra',        t('addAttach'));
  setText('submit-btn',      t('submit'));
  renderPriceLbl();
  renderExtraList();
}

// ─── Validation ────────────────────────────────────────────────────────────
function clearErr(f) {
  var e = el('err-' + f); if (e) { e.textContent = ''; e.style.display = 'none'; }
  var i = el('f-' + f);   if (i) i.classList.remove('err');
}

function setErr(f, msg) {
  var e = el('err-' + f); if (e) { e.textContent = msg; e.style.display = ''; }
  var i = el('f-' + f);   if (i) i.classList.add('err');
}

function validate() {
  var ok = true;
  ['companyName','crNum','accredNum','zatca','phone','email','contactPerson','address','iban','price','payment'].forEach(clearErr);
  el('pt-grid').querySelectorAll('.pt-opt').forEach(function(e) { e.classList.remove('err-brd'); });

  var r = t('required');
  if (!el('f-companyName').value.trim())   { setErr('companyName', r); ok = false; }
  if (!el('f-crNum').value.trim())         { setErr('crNum', r); ok = false; }
  if (!el('f-accredNum').value.trim())     { setErr('accredNum', r); ok = false; }
  if (!el('f-zatca').value.trim())         { setErr('zatca', r); ok = false; }
  if (!el('f-phone').value.trim())         { setErr('phone', r); ok = false; }
  var email = el('f-email').value.trim();
  if (!email)                              { setErr('email', r); ok = false; }
  else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { setErr('email', t('invalidEmail')); ok = false; }
  if (!el('f-contactPerson').value.trim()) { setErr('contactPerson', r); ok = false; }
  if (!el('f-address').value.trim())       { setErr('address', r); ok = false; }
  if (!el('f-iban').value.trim())          { setErr('iban', r); ok = false; }
  var price = parseFloat(el('f-price').value) || 0;
  if (price <= 0) { setErr('price', t('invalidPrice')); ok = false; }
  if (!payTerm) {
    setErr('payment', r);
    el('pt-grid').querySelectorAll('.pt-opt').forEach(function(e) { e.classList.add('err-brd'); });
    ok = false;
  }
  return ok;
}

// ─── Submit ────────────────────────────────────────────────────────────────
function handleSubmit() {
  el('err-banner').style.display = 'none';
  if (!validate()) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

  var inProg = Object.keys(uploads).some(function(k) { return uploads[k] === 'uploading'; }) ||
               extras.some(function(u) { return u === null; });
  if (inProg) {
    el('err-banner-text').textContent = t('uploading');
    el('err-banner').style.display = 'flex';
    return;
  }

  el('submit-btn').disabled = true;
  setText('submit-btn', t('submitting'));

  var price = parseFloat(el('f-price').value) || 0;
  var body = {
    companyName:                     el('f-companyName').value.trim(),
    commercialRegistrationNumber:    el('f-crNum').value.trim(),
    accreditationNumber:             el('f-accredNum').value.trim(),
    zatcaNumber:                     el('f-zatca').value.trim(),
    phone:                           el('f-phone').value.trim(),
    email:                           el('f-email').value.trim().toLowerCase(),
    contactPersonName:               el('f-contactPerson').value.trim(),
    nationalAddressText:             el('f-address').value.trim(),
    ibanText:                        el('f-iban').value.trim(),
    priceExcludingVatSar:            price,
    currency:                        currency,
    paymentTerms:                    payTerm,
    notes:                           el('f-notes').value.trim() || null
  };

  // Optional attachments
  var attKeys = {
    crAttach:     'commercialRegistrationAttachment',
    accredAttach: 'accreditationAttachment',
    addrAttach:   'nationalAddressAttachment',
    ibanAttach:   'ibanAttachment',
    quotAttach:   'quotationAttachment'
  };
  Object.keys(attKeys).forEach(function(k) {
    var u = uploads[k];
    if (u && u !== 'uploading') body[attKeys[k]] = u;
  });
  var done = extras.filter(function(u) { return u && u !== null; });
  if (done.length) body.extraAttachments = done;

  fetch(API_BASE + '/api/public/supplier-response/' + TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(r) {
    return r.json().then(function(data) { return { ok: r.ok, data: data }; });
  })
  .then(function(res) {
    if (!res.ok) {
      var data = res.data;
      if (data.code === 'link_already_used') { showStatus('used'); return; }
      if (data.code === 'link_expired' || data.code === 'link_not_found') { showStatus('expired'); return; }
      el('err-banner-text').textContent = data.error || t('submitError');
      el('err-banner').style.display = 'flex';
    } else {
      el('v-success').querySelector('#ok-title').textContent = t('successTitle');
      el('v-success').querySelector('#ok-msg').textContent   = t('successMsg');
      setText('pb-success', t('poweredBy'));
      showView('v-success');
    }
  })
  .catch(function() {
    el('err-banner-text').textContent = t('submitError');
    el('err-banner').style.display = 'flex';
  })
  .finally(function() {
    el('submit-btn').disabled = false;
    setText('submit-btn', t('submit'));
  });
}

// ─── Status view ───────────────────────────────────────────────────────────
function showStatus(status) {
  var map = {
    used:        { icon:'&#x2705;', color:'var(--success)', titleKey:'successTitle', msgKey:'statusUsed',         border:'#bbf7d0' },
    expired:     { icon:'&#x274C;', color:'var(--error)',   titleKey:'',             msgKey:'statusExpired',      border:'#FECACA' },
    deactivated: { icon:'&#x26D4;', color:'var(--error)',   titleKey:'',             msgKey:'statusDeactivated',  border:'#FECACA' },
    notFound:    { icon:'&#x2754;', color:'var(--muted)',   titleKey:'',             msgKey:'statusNotFound',     border:'var(--border)' }
  };
  var cfg = map[status] || map.notFound;
  el('status-icon').innerHTML   = cfg.icon;
  el('status-title').textContent = cfg.titleKey ? t(cfg.titleKey) : '';
  el('status-title').style.color = cfg.color;
  el('status-msg').textContent  = t(cfg.msgKey);
  el('status-card').style.borderColor = cfg.border;
  setText('pb-status', t('poweredBy'));
  showView('v-status');
}

// ─── Init ──────────────────────────────────────────────────────────────────
function init() {
  renderLabels();
  setText('loading-msg', t('loading'));
  showView('v-loading');

  if (!TOKEN || TOKEN.length < 32) { showStatus('notFound'); return; }

  fetch(API_BASE + '/api/public/supplier-link/' + TOKEN)
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      var data = res.data;
      if (!res.ok || !data.status) { showStatus('notFound'); return; }
      if (data.status !== 'active') { showStatus(data.status); return; }

      if (data.supplierNameHint) {
        setText('hint-text', data.supplierNameHint);
        el('hint-badge').style.display = 'inline-flex';
      }
      if (data.productDescription) {
        setText('prod-desc-text', data.productDescription);
        el('prod-desc-card').style.display = '';
      }

      el('f-price').addEventListener('input', function() { if (currency === 'SAR') updateVat(); });
      renderLabels();
      showView('v-form');
    })
    .catch(function() { showStatus('notFound'); });
}

init();
</script>
</body>
</html>`;
}

// ─── Route: GET /supplier-test/:token  (temp test URL — no DNS change needed)
// ─── Route: GET /supplier/:token       (production URL after DNS cutover)
// Both are registered in index.ts by mounting this router at both prefixes.
router.get("/:token", (c) => {
  const token = c.req.param("token");
  const html = generateHtml(
    token ?? "",
    c.env.CLOUDINARY_CLOUD_NAME ?? "",
    c.env.CLOUDINARY_UPLOAD_PRESET ?? "",
  );
  return c.html(html);
});

export default router;
