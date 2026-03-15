export function renderSetupSummary(result) {
  const lines = [];
  lines.push('Running setup...\n');
  lines.push(`Start ready: ${result.start_ready ? 'yes' : 'no'}`);
  lines.push(`Projected start ready: ${result.projected_start_ready ? 'yes' : 'no'}`);
  lines.push(`Exit code: ${result.exit_code}`);
  lines.push(`Code: ${result.code}`);
  lines.push('');
  lines.push('Steps:');

  for (const step of result.steps || []) {
    lines.push(`  - ${step.step_id}: ${step.status} (${step.code})`);
    if (step.message) {
      lines.push(`    ${step.message}`);
    }
    if (step.remediation && step.remediation.length > 0) {
      const required = step.remediation.find((r) => r.optional === false);
      if (required) {
        lines.push(`    Next: ${required.command}`);
      }
    }
  }

  return lines.join('\n');
}

export default { renderSetupSummary };
