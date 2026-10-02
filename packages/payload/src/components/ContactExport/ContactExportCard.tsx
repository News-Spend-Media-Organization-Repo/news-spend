import type { ReactNode } from "react";

/**
 * The "Email list" card shown on the dashboard and above the Users list.
 *
 * Plain server-rendered markup: each download is an ordinary link, so nothing
 * here needs a script. Colours come from Payload's theme variables, so light
 * and dark both work.
 */

const CSS = `
.cx{display:flex;flex-direction:column;gap:14px;font-size:14px;color:var(--theme-text);border:1px solid var(--theme-elevation-150);border-radius:12px;background:var(--theme-elevation-0);padding:18px 20px}
.cx *{box-sizing:border-box}
.cx-head{display:flex;gap:12px;align-items:center}
.cx-icon{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(94,127,179,.16);color:#5E7FB3}
.cx-title{margin:0;font-size:15px;font-weight:600}
.cx-sub{margin:2px 0 0;font-size:13px;color:var(--theme-elevation-600)}
.cx-tiles{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.cx-tile{display:flex;flex-direction:column;gap:8px;border:1px solid var(--theme-elevation-150);border-radius:10px;padding:14px;background:var(--theme-elevation-50)}
.cx-tile[data-primary=true]{background:#10264A;border-color:#10264A;color:#fff}
.cx-label{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--theme-elevation-600)}
.cx-tile[data-primary=true] .cx-label{color:rgba(255,255,255,.72)}
.cx-count{font-size:28px;font-weight:700;line-height:1.1}
.cx-share{font-size:12px;color:var(--theme-elevation-600)}
.cx-tile[data-primary=true] .cx-share{color:rgba(255,255,255,.72)}
.cx-track{height:5px;border-radius:999px;background:var(--theme-elevation-150);overflow:hidden}
.cx-tile[data-primary=true] .cx-track{background:rgba(255,255,255,.22)}
.cx-fill{height:100%;border-radius:999px;background:#D9A23B}
.cx-btn{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:8px;border:1px solid var(--theme-elevation-250);background:var(--theme-elevation-0);color:var(--theme-text);font-size:13px;font-weight:500;text-decoration:none}
.cx-btn:hover{background:var(--theme-elevation-100)}
.cx-tile[data-primary=true] .cx-btn{background:#fff;color:#10264A;border-color:#fff}
.cx-tile[data-primary=true] .cx-btn:hover{background:rgba(255,255,255,.88)}
.cx-btn[aria-disabled=true]{opacity:.45;pointer-events:none}
.cx-note{font-size:12px;color:var(--theme-elevation-600)}
.cx-note summary{cursor:pointer;width:fit-content}
.cx-note p{margin:6px 0 0;max-width:70ch;line-height:1.5}
`;

export type ContactExportTile = {
  key: string;
  label: string;
  count: number;
  /** Days not seen; 0 means everyone. */
  days: number;
};

const href = (days: number) =>
  days > 0
    ? `/api/users/export-contacts?inactiveDays=${days}`
    : "/api/users/export-contacts";

const MailIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="18"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="18"
  >
    <rect height="16" rx="2" width="20" x="2" y="4" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="14"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="14"
  >
    <path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />
  </svg>
);

export function ContactExportCard({
  total,
  tiles,
}: {
  total: number;
  tiles: ContactExportTile[];
}): ReactNode {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant stylesheet defined in this file. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <section className="cx">
        <div className="cx-head">
          <span className="cx-icon">
            <MailIcon />
          </span>
          <div>
            <h3 className="cx-title">Email list</h3>
            <p className="cx-sub">
              Names and emails of registered users, as a CSV. Guests have no
              address, so they are not included.
            </p>
          </div>
        </div>

        <div className="cx-tiles">
          {tiles.map((tile) => {
            const share = total > 0 ? (tile.count / total) * 100 : 0;
            const isAll = tile.days === 0;
            return (
              <div className="cx-tile" data-primary={isAll} key={tile.key}>
                <span className="cx-label">{tile.label}</span>
                <span className="cx-count">
                  {tile.count.toLocaleString("en-US")}
                </span>
                {isAll ? null : (
                  <>
                    <div className="cx-track">
                      <div className="cx-fill" style={{ width: `${share}%` }} />
                    </div>
                    <span className="cx-share">
                      {share.toFixed(share < 10 && share > 0 ? 1 : 0)}% of the
                      list
                    </span>
                  </>
                )}
                <a
                  aria-disabled={tile.count === 0}
                  className="cx-btn"
                  download
                  href={href(tile.days)}
                >
                  <DownloadIcon /> Download CSV
                </a>
              </div>
            );
          })}
        </div>

        <details className="cx-note">
          <summary>How "not seen" is worked out</summary>
          <p>
            We use the latest of the app's own activity record, the newest login
            session and the sign-up date, so people who last used the app before
            activity was recorded are still placed correctly. The CSV has a
            column saying which of the three each date came from.
          </p>
        </details>
      </section>
    </>
  );
}
