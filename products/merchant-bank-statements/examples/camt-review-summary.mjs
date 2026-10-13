// SPDX-License-Identifier: MIT
// Read-only projection of the maintained CAMT source report.
export function summarizeCamtReport(report) {
  if (!report || report.format !== 'CAMT053' || !Array.isArray(report.statements)) {
    throw new TypeError('A complete CAMT053 source report is required');
  }
  const issue = value => ({
    code: value.code, severity: value.severity, message: value.message,
    source: value.source || null
  });
  return {
    schema: 'stellar-forge.camt053.engineering-review.v1',
    file: report.file,
    messageVersion: report.camt.messageVersion,
    sourceIssues: report.issues.map(issue),
    statements: report.statements.map(statement => {
      const entries = [
        ...statement.rows, ...statement.pendingRows,
        ...statement.excludedRows.map(excluded => excluded.row)
      ].sort((a, b) => a.source.charStart - b.source.charStart);
      return {
        statementId: statement.id,
        accountId: statement.account.accountId,
        currency: statement.account.currency,
        period: statement.period,
        counts: {
          posted: statement.rows.length,
          pending: statement.pendingRows.length,
          other: statement.excludedRows.length,
          entries: entries.length,
          details: entries.reduce((count, row) => count + row.camt.details.length, 0)
        },
        pagination: statement.camt.pagination,
        arithmetic: statement.camt.balanceCheck,
        closingCandidates: statement.balances.closing.map(candidate => ({
          id: candidate.id, eligible: candidate.eligible,
          from: candidate.from, until: candidate.until,
          opening: candidate.opening, closing: candidate.closing,
          issues: candidate.issues.map(issue)
        })),
        issues: statement.issues.map(issue),
        entries: entries.map(row => ({
          id: row.id, status: row.status, eligible: row.eligible,
          amount: row.amount, currency: row.currency,
          direction: row.camt.creditDebit, reversal: row.camt.reversal,
          accountServicerReference: row.camt.accountServicerReference,
          entryReference: row.camt.entryReference,
          detailCount: row.camt.details.length,
          detailTieOut: row.camt.detailTieOut,
          source: row.source, issues: row.issues.map(issue)
        }))
      };
    })
  };
}
