export function downloadReport(repName, accounts, summary, actionsTaken = []) {
  const rows = accounts
    .map(
      (a) => `
    <tr>
      <td style="padding:8px;border:1px solid #ccc;">${a.name}</td>
      <td style="padding:8px;border:1px solid #ccc;">${a.stage ?? '—'}</td>
      <td style="padding:8px;border:1px solid #ccc;">${a.forecastCategory ?? '—'}</td>
      <td style="padding:8px;border:1px solid #ccc;">${a.dealValueArr ?? '—'}</td>
      <td style="padding:8px;border:1px solid #ccc;">${(a.issues || []).join('; ') || 'None'}</td>
      <td style="padding:8px;border:1px solid #ccc;">${a.nextStep ?? '—'}</td>
    </tr>`
    )
    .join('');

  const actionsList = actionsTaken.length
    ? actionsTaken.map((act) => `<li><b>${act.title}</b> ${act.detail}</li>`).join('')
    : '<li>No actions recorded yet.</li>';

  const html = `
    <html><head><meta charset="utf-8"></head><body style="font-family:Calibri, Arial, sans-serif;">
    <h1 style="color:#2e6fe0;">Sales Rep Performance Report</h1>
    <p><b>Rep:</b> ${summary?.repName ?? repName}${summary?.repTier ? ` (${summary.repTier})` : ''}</p>
    <table style="border-collapse:collapse;margin:10px 0;">
      <tr><td style="padding:8px;border:1px solid #ccc;"><b>Monthly ARR target</b></td><td style="padding:8px;border:1px solid #ccc;">${summary?.quarterTarget ?? '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ccc;"><b>Current attainment</b></td><td style="padding:8px;border:1px solid #ccc;">${summary?.currentAttainment ?? '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ccc;"><b>Open pipeline ARR</b></td><td style="padding:8px;border:1px solid #ccc;">${summary?.openPipelineArr ?? '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ccc;"><b>Open opportunities</b></td><td style="padding:8px;border:1px solid #ccc;">${summary?.openOpportunityCount ?? '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ccc;"><b>Risk (preliminary)</b></td><td style="padding:8px;border:1px solid #ccc;">${summary?.risk ?? '—'}</td></tr>
    </table>
    <h2>Account Analysis</h2>
    <table style="border-collapse:collapse;width:100%;">
      <tr style="background:#eef5ff;">
        <th style="padding:8px;border:1px solid #ccc;">Account</th>
        <th style="padding:8px;border:1px solid #ccc;">Stage</th>
        <th style="padding:8px;border:1px solid #ccc;">Forecast</th>
        <th style="padding:8px;border:1px solid #ccc;">Deal value (ARR)</th>
        <th style="padding:8px;border:1px solid #ccc;">Objections</th>
        <th style="padding:8px;border:1px solid #ccc;">Next step</th>
      </tr>
      ${rows}
    </table>
    <h2>Actions Taken</h2>
    <ul>
      ${actionsList}
    </ul>
    </body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sales_Rep_Report_${(summary?.repName ?? repName).split(' ')[0]}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function emailReport(email, repName, accounts, summary, actionsTaken = []) {
  const displayName = summary?.repName ?? repName;
  const subject = encodeURIComponent(`Sales Rep Performance Report — ${displayName}`);

  const flagged = accounts
    .filter((a) => (a.issues || []).length)
    .map((a) => `- ${a.name} (${a.stage}, ${a.dealValueArr}): ${a.issues.join('; ')}`)
    .join('\n');

  const actionsText = actionsTaken.length
    ? actionsTaken.map((act) => `- ${act.title}: ${act.detail}`).join('\n')
    : '- No actions recorded yet.';

  const body = encodeURIComponent(
    `Performance summary for ${displayName}\n\n` +
      `Monthly ARR target: ${summary?.quarterTarget ?? '—'}\n` +
      `Current attainment: ${summary?.currentAttainment ?? '—'}\n` +
      `Open pipeline ARR: ${summary?.openPipelineArr ?? '—'}\n` +
      `Open opportunities: ${summary?.openOpportunityCount ?? '—'}\n` +
      `Risk (preliminary): ${summary?.risk ?? '—'}\n\n` +
      `Accounts flagged:\n${flagged || '- None'}\n\n` +
      `Actions taken:\n${actionsText}`
  );
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}