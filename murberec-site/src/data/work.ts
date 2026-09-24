/**
 * Case studies. Empty until the owner supplies real, approved engagements
 * (problem -> approach -> measurable result). No invented results are shown.
 * Copy the commented example below to add one; /work/[slug] builds from it.
 */

export interface CaseStudy {
  slug: string;
  client: string;          // or an anonymized description, e.g. 'Global healthcare provider'
  industry: string;
  services: string[];      // service slugs
  title: string;
  summary: string;
  problem: string;
  approach: string;
  results: { value: string; label: string }[];
  quote?: { text: string; name: string; role: string };
}

export const caseStudies: CaseStudy[] = [
  // {
  //   slug: 'global-manager-onboarding',
  //   client: 'Global technology company',
  //   industry: 'Technology',
  //   services: ['leadership-development', 'learning-development'],
  //   title: 'Cutting time-to-confidence for first-time managers',
  //   summary: 'One sentence for the card.',
  //   problem: '...',
  //   approach: '...',
  //   results: [{ value: '38%', label: 'faster time to productivity' }],
  // },
];
