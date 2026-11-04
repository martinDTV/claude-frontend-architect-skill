# Negative control: saas-dashboard-broken

A known-defect artifact that MUST fail the accessibility axis. Not a full app — a minimal, isolated
component carrying one genuine defect a human recognizes: a filter input with no associated label.
ui-audit (semantic engine) reports `form-control-without-label` on it. If a future change makes this
case pass the a11y axis, the detector or the contract regressed. Driven by the existing ui-audit tool;
no new auditor.
