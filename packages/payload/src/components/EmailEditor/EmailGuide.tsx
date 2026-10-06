"use client";

import { TEMPLATE_VARIABLES } from "../../lib/email/templateVariables";

/**
 * Author guide for email templates. Variable docs render from the
 * registry so they can never drift from what the system resolves.
 */
export function EmailGuide() {
  return (
    <div className="email-guide">
      <section>
        <h3>Writing templates</h3>
        <p>
          Compose in the Design tab. Type <kbd>/</kbd> for blocks, images, and
          columns, or pick a variable from the Variables section — it inserts a{" "}
          <kbd>{"{{placeholder}}"}</kbd> at the cursor.
        </p>
      </section>
      <section>
        <h3>Variables</h3>
        <p>
          Only the variables below resolve in real sends. Anything else blocks
          saving, so a typo can never reach a recipient as a blank. Production
          values come from the recipient&apos;s record; preview and test sends
          use the samples.
        </p>
        <table className="email-guide-table">
          <thead>
            <tr>
              <th>Placeholder</th>
              <th>Resolves to</th>
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_VARIABLES.map((variable) => (
              <tr key={variable.key}>
                <td>
                  <kbd>{`{{${variable.key}}}`}</kbd>
                </td>
                <td>{variable.description}</td>
                <td>
                  <kbd>{variable.sample}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Saving</h3>
        <p>
          The canvas syncs to the template automatically as you work. Saving a
          draft keeps editing; only a <strong>published</strong> template is
          used for real sends.
        </p>
      </section>
      <section>
        <h3>Testing</h3>
        <p>
          Use the live preview under the canvas, or the <kbd>Send test</kbd>{" "}
          button in the toolbar for a real inbox check.
        </p>
      </section>
    </div>
  );
}
