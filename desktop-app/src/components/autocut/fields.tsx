import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function NumField({ label, value, onChange, step = 0.05, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input type="number" className="h-8" value={value} step={step} min={min} max={max} onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </label>
  );
}

export function SwitchField({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="text-xs font-normal leading-snug">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b pb-3">
      <h3 className="font-display text-lg tracking-wide text-primary">{title}</h3>
      {children}
    </section>
  );
}
