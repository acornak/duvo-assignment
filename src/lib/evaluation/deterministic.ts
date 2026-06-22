import type { DeterministicCheck } from "@/lib/types";

/** Minimal CSV row count + header presence checks (no full RFC parser needed). */
export function runDeterministicChecks(fileName: string, content: string): DeterministicCheck[] {
  const checks: DeterministicCheck[] = [];

  const nonEmpty = content.trim().length > 0;
  checks.push({
    name: "file-non-empty",
    passed: nonEmpty,
    detail: nonEmpty ? `${content.length} bytes` : "file is empty",
  });

  const isCsv = fileName.toLowerCase().endsWith(".csv");
  if (isCsv) {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const hasHeader = lines.length >= 1 && lines[0].includes(",");
    checks.push({
      name: "csv-has-header",
      passed: hasHeader,
      detail: hasHeader ? `header: ${lines[0].slice(0, 200)}` : "no comma-delimited header row found",
    });

    const dataRows = Math.max(0, lines.length - 1);
    checks.push({
      name: "csv-has-data-rows",
      passed: dataRows >= 1,
      detail: `${dataRows} data row(s)`,
    });
  }

  return checks;
}
