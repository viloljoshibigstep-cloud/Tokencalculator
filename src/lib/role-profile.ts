// Role profile vocabulary used by the questionnaire UI.
// Kept in one place so onboarding + settings stay in sync.

import type { ExpectedPattern, Seniority } from "@/lib/queries";

export const JOB_ROLES = [
  "Backend Engineer",
  "Frontend Engineer",
  "Full-Stack Engineer",
  "Mobile Engineer",
  "Data Scientist",
  "ML Engineer",
  "DevOps",
  "Platform Engineer",
  "QA Engineer",
  "Product Manager",
  "Designer",
  "Technical Writer",
  "Marketing",
  "Sales",
  "Support",
  "Other",
] as const;

export const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Data",
  "DevOps / Platform",
  "Marketing",
  "Sales",
  "Customer Support",
  "Operations",
  "Other",
] as const;

export const SENIORITY_OPTIONS: { value: Seniority; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff / Lead" },
  { value: "principal", label: "Principal / Director" },
];

export const PATTERN_OPTIONS: {
  value: ExpectedPattern;
  label: string;
  hint: string;
}[] = [
  { value: "light",    label: "Light",    hint: "A few prompts a day, mostly chat." },
  { value: "moderate", label: "Moderate", hint: "Several sessions a day, mixed use." },
  { value: "heavy",    label: "Heavy",    hint: "Live-coding all day with an AI." },
];

export const TASK_TYPES = [
  "coding",
  "debugging",
  "code review",
  "refactoring",
  "docs",
  "research",
  "planning",
  "prototyping",
  "testing",
  "data analysis",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
