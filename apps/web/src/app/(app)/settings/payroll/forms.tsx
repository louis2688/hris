"use client";

import { isPayrollPercentField, type PayrollConfig } from "@hris/shared";
import { resetPayrollConfigAction, saveCompanyAction, savePayrollConfigAction } from "@/server/actions/payroll";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";

type Company = { name: string; address: string; tin: string; signatoryName: string; signatoryTitle: string };

export function CompanyForm({ company }: { company: Company }) {
  return (
    <Card>
      <CardHeader title="Company" description="Printed on payslips and certificates of employment." />
      <CardBody>
        <ActionForm action={saveCompanyAction} submitLabel="Save company">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Registered name" name="name" required className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={company.name} />
            </FormField>
            <FormField label="Address" name="address" className="sm:col-span-2">
              <Textarea id="address" name="address" rows={2} className="min-h-0" defaultValue={company.address} />
            </FormField>
            <FormField label="Company TIN" name="tin">
              <Input id="tin" name="tin" defaultValue={company.tin} placeholder="000-000-000-00000" />
            </FormField>
            <div className="hidden sm:block" />
            <FormField label="Signatory name" name="signatoryName">
              <Input id="signatoryName" name="signatoryName" defaultValue={company.signatoryName} />
            </FormField>
            <FormField label="Signatory title" name="signatoryTitle">
              <Input id="signatoryTitle" name="signatoryTitle" defaultValue={company.signatoryTitle} />
            </FormField>
          </div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

type Group = "sss" | "philhealth" | "pagibig" | "premiums";
type F = { k: string; label: string; unit?: "%" | "PHP" };

const GROUPS: { g: Group; title: string; source: string; fields: F[] }[] = [
  {
    g: "sss",
    title: "SSS",
    source: "SSS Circular 2024-006 (15% of MSC from Jan 2025)",
    fields: [
      { k: "eeRate", label: "Employee share", unit: "%" },
      { k: "erRate", label: "Employer share", unit: "%" },
      { k: "mscMin", label: "Minimum MSC", unit: "PHP" },
      { k: "mscMax", label: "Maximum MSC", unit: "PHP" },
      { k: "mscStep", label: "MSC step", unit: "PHP" },
      { k: "regularMscMax", label: "Regular SS cap (MPF above)", unit: "PHP" },
      { k: "ecLow", label: "EC below threshold", unit: "PHP" },
      { k: "ecHigh", label: "EC at/above threshold", unit: "PHP" },
      { k: "ecThreshold", label: "EC threshold MSC", unit: "PHP" },
    ],
  },
  {
    g: "philhealth",
    title: "PhilHealth",
    source: "RA 11223 (UHC): 5% premium from 2024",
    fields: [
      { k: "rate", label: "Premium rate", unit: "%" },
      { k: "eeShare", label: "Employee portion of premium", unit: "%" },
      { k: "floor", label: "Income floor", unit: "PHP" },
      { k: "ceiling", label: "Income ceiling", unit: "PHP" },
    ],
  },
  {
    g: "pagibig",
    title: "Pag-IBIG (HDMF)",
    source: "HDMF Circular 460 (P10,000 max fund salary)",
    fields: [
      { k: "eeRate", label: "Employee rate", unit: "%" },
      { k: "eeRateLow", label: "Employee rate at/below threshold", unit: "%" },
      { k: "lowThreshold", label: "Low-income threshold", unit: "PHP" },
      { k: "erRate", label: "Employer rate", unit: "%" },
      { k: "maxFundSalary", label: "Maximum fund salary", unit: "PHP" },
    ],
  },
  {
    g: "premiums",
    title: "Premium pay (% of daily / hourly rate)",
    source: "Labor Code arts. 86-94; DOLE Handbook on Statutory Monetary Benefits",
    fields: [
      { k: "overtime", label: "OT, regular day" },
      { k: "nightDiff", label: "Night differential (10pm-6am)" },
      { k: "restDay", label: "Rest day worked" },
      { k: "restDayOt", label: "Rest day OT" },
      { k: "specialHoliday", label: "Special holiday worked" },
      { k: "specialHolidayOt", label: "Special holiday OT" },
      { k: "specialHolidayRestDay", label: "Special holiday on rest day" },
      { k: "specialHolidayRestDayOt", label: "Special holiday on rest day, OT" },
      { k: "regularHoliday", label: "Regular holiday worked" },
      { k: "regularHolidayOt", label: "Regular holiday OT" },
      { k: "regularHolidayRestDay", label: "Regular holiday on rest day" },
      { k: "regularHolidayRestDayOt", label: "Regular holiday on rest day, OT" },
    ],
  },
];

const shown = (v: number, pct: boolean) => String(pct ? Math.round(v * 1e6) / 1e4 : v);

export function RatesForm({ config }: { config: PayrollConfig }) {
  return (
    <Card>
      <CardHeader
        title="Payroll rates"
        description="Statutory rates used when computing payslips. Update when an agency issues a new circular; existing payslips are not changed."
        action={
          <ConfirmButton action={resetPayrollConfigAction} confirm="Reset every rate, tax table and schedule to the built-in defaults?" variant="ghost" size="sm">
            Reset to defaults
          </ConfirmButton>
        }
      />
      <CardBody>
        <ActionForm action={savePayrollConfigAction} submitLabel="Save rates" className="space-y-8">
          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-ink">Pay schedule</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Default frequency" name="schedule.frequency">
                <Select id="schedule.frequency" name="schedule.frequency" defaultValue={config.schedule.frequency}>
                  <option value="SEMI_MONTHLY">Semi-monthly (1-15, 16-end)</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </FormField>
              <FormField label="1st cutoff pay day" name="schedule.firstPayDay" hint="Day of month">
                <Input id="schedule.firstPayDay" name="schedule.firstPayDay" type="number" min={0} max={31} defaultValue={config.schedule.firstPayDay} />
              </FormField>
              <FormField label="2nd cutoff pay day" name="schedule.secondPayDay" hint="0 = last day of month">
                <Input id="schedule.secondPayDay" name="schedule.secondPayDay" type="number" min={0} max={31} defaultValue={config.schedule.secondPayDay} />
              </FormField>
              <FormField label="Contributions deducted" name="contributionTiming">
                <Select id="contributionTiming" name="contributionTiming" defaultValue={config.contributionTiming}>
                  <option value="SPLIT">Half each cutoff</option>
                  <option value="SECOND_HALF">All on the 2nd cutoff</option>
                </Select>
              </FormField>
              <FormField label="Days per year" name="daysPerYear" hint="261 = 5-day week, 313 = 6-day week">
                <Input id="daysPerYear" name="daysPerYear" type="number" min={200} max={366} defaultValue={config.daysPerYear} />
              </FormField>
              <FormField label="Hours per day" name="hoursPerDay">
                <Input id="hoursPerDay" name="hoursPerDay" type="number" step="0.5" min={1} max={12} defaultValue={config.hoursPerDay} />
              </FormField>
              <FormField label="13th month + benefits tax exemption (PHP)" name="thirteenthMonthExempt" className="sm:col-span-2" hint="NIRC sec. 32(B)(7)(e), TRAIN: P90,000">
                <Input id="thirteenthMonthExempt" name="thirteenthMonthExempt" type="number" step="0.01" min={0} defaultValue={config.thirteenthMonthExempt} />
              </FormField>
            </div>
          </fieldset>

          {GROUPS.map(({ g, title, source, fields }) => (
            <fieldset key={g} className="border-t border-slate-100 pt-6">
              <legend className="sr-only">{title}</legend>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-semibold text-ink">{title}</h3>
                <p className="text-xs text-slate-500">{source}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {fields.map((f) => {
                  const name = `${g}.${f.k}`;
                  const pct = isPayrollPercentField(name);
                  const v = (config[g] as Record<string, number>)[f.k] ?? 0;
                  return (
                    <FormField key={name} label={`${f.label}${pct ? " (%)" : f.unit === "PHP" ? " (PHP)" : ""}`} name={name}>
                      <Input id={name} name={name} type="number" step="any" min={0} inputMode="decimal" defaultValue={shown(v, pct)} />
                    </FormField>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <fieldset className="border-t border-slate-100 pt-6">
            <legend className="sr-only">Withholding tax</legend>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-sm font-semibold text-ink">Withholding tax tables</h3>
              <p className="text-xs text-slate-500">BIR RR 11-2018 Annex E, effective 1 Jan 2023</p>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              JSON list of brackets. Tax = <code className="font-mono">base + rate x (taxable - over)</code> for the highest bracket where taxable exceeds <code className="font-mono">over</code>. Rate is a fraction (0.15 = 15%).
            </p>
            <div className="grid gap-4">
              {(["semiMonthly", "monthly"] as const).map((t) => (
                <FormField key={t} label={t === "monthly" ? "Monthly" : "Semi-monthly"} name={`tax.${t}`}>
                  <Textarea id={`tax.${t}`} name={`tax.${t}`} rows={config.tax[t].length + 2} wrap="off" spellCheck={false} className="font-mono text-xs leading-relaxed" defaultValue={`[\n  ${config.tax[t].map((b) => JSON.stringify(b)).join(",\n  ")}\n]`} />
                </FormField>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
