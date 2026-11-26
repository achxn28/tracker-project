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

export const collegeHref = (id: string) => `/admissions?college=${encodeURIComponent(id)}#college-${encodeURIComponent(id)}`;
export const supplementHref = (id: string) => `/admissions#supplement-${encodeURIComponent(id)}`;

export function validDocsUrl(url: string) {
  return /^https:\/\/docs\.google\.com\/document\/d\/[\w-]+(?:\/edit)?(?:\?tab=[\w.-]+)?$/.test(url);
}
