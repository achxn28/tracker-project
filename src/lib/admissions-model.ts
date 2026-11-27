export const supplementStatuses = ["To write", "Drafting", "Ready for review", "Done"] as const;
export type SupplementStatus = typeof supplementStatuses[number];

export type College = {
  id: string;
  name: string;
  round: string;
  deadline: string | null;
  submitted: boolean;
  docsUrl: string | null;
  supplementsUnknown: boolean;
};

export type Supplement = {
  id: string;
  collegeId: string;
  title: string;
  prompt: string | null;
  wordLimit: number | null;
  dueDate: string | null;
  status: SupplementStatus;
  docsUrl: string | null;
};

export type AdmissionsData = { colleges: College[]; supplements: Supplement[] };

export const ucCampusIds = ["uc-berkeley", "ucla", "ucsd"];

export const collegeHref = (id: string) => `/admissions?college=${encodeURIComponent(id)}#college-${encodeURIComponent(id)}`;
export const supplementHref = (essay: Supplement) => `/admissions?college=${encodeURIComponent(essay.collegeId)}#supplement-${encodeURIComponent(essay.id)}`;

export function scheduledSupplements({ colleges, supplements }: AdmissionsData) {
  const schools = new Map(colleges.map(college => [college.id, college.name]));
  return supplements.flatMap(essay => essay.dueDate ? [{
    id: essay.id, title: essay.title, school: schools.get(essay.collegeId) ?? "Admissions",
    dueDate: essay.dueDate, status: essay.status, href: supplementHref(essay),
  }] : []);
}

export type ScheduledSupplement = ReturnType<typeof scheduledSupplements>[number];

export function validDocsUrl(url: string) {
  return /^https:\/\/docs\.google\.com\/document\/d\/[\w-]+(?:\/edit)?(?:\?tab=[\w.-]+)?$/.test(url);
}
