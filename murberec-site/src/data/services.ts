/**
 * Service copy. `summary`, `lede` and `focus` are Marc's own words from the
 * current murberec.com "Capabilities" section. `signals`, `approach` and
 * `deliverables` are drafts. TODO(owner): review those before launch.
 */

export interface Service {
  slug: string;
  title: string;
  /** Page <title>, written around the search term the page targets. */
  seoTitle: string;
  seoDescription: string;
  /** Tagline, from the live site. */
  summary: string;
  /** Description, from the live site. */
  lede: string;
  /** The three focus areas listed on the live site. */
  focus: string[];
  signals: string[];
  approach: { diagnose: string; design: string; embed: string };
  deliverables: string[];
}

export const services: Service[] = [
  {
    slug: 'leadership-development',
    title: 'Leadership Development',
    seoTitle: 'Neuroscience-Based Leadership Development',
    seoDescription:
      'Custom leadership development programs grounded in neuroscience. MURBEREC® helps leaders build the habits that hold up under pressure, and stays until they stick.',
    summary: 'Leaders people choose to follow.',
    lede:
      'From first-time managers to senior executives, we turn behavioral science into practical habits that build trust, presence, and performance.',
    focus: ['New managers', 'Executive presence', 'Team trust'],
    signals: [
      'New managers promoted for technical skill, now leading people',
      'A senior team that agrees in the room and drifts apart outside it',
      'Engagement scores that point at a leadership gap',
      'A leadership framework nobody references after the offsite',
    ],
    approach: {
      diagnose: 'Interviews, observation and data to find which leadership behaviors matter most in your context, and what gets in the way of them.',
      design: 'A custom journey mixing live sessions, coaching, peer practice and in-the-flow nudges. No off-the-shelf curriculum.',
      embed: 'Manager reinforcement, practice loops and measurement at 30, 60 and 90 days, so new behavior becomes the default.',
    },
    deliverables: ['Leadership capability model', 'Cohort programs', 'Executive and team coaching', 'Manager toolkits', 'Behavior-based measurement'],
  },
  {
    slug: 'learning-development',
    title: 'Learning & Development',
    seoTitle: 'Custom Learning Experience Design',
    seoDescription:
      'Custom learning experience design (LXD) and eLearning built on the science of memory and attention. Programs people finish, remember and use on the job.',
    summary: 'People who never stop growing.',
    lede:
      'Bespoke learning journeys built for how the brain pays attention, retains knowledge, and converts insight into action.',
    focus: ['Onboarding', 'Upskilling', 'Everyday learning'],
    signals: [
      'High completion, low change in performance',
      'A course library nobody browses',
      'Onboarding that takes months to reach full productivity',
      'Compliance training people click through',
    ],
    approach: {
      diagnose: 'Performance analysis to separate what is a skill gap from what is a system, process or motivation problem.',
      design: 'Learning experience design across live, digital and blended formats, produced in-house with our content arm, Xtudio™.',
      embed: 'Spaced reinforcement, on-the-job application and learning analytics tied to business outcomes.',
    },
    deliverables: ['Learning strategy', 'Learning experience design (LXD)', 'Custom eLearning', 'Blended and cohort programs', 'Onboarding journeys', 'Measurement frameworks'],
  },
  {
    slug: 'change-management',
    title: 'Change Management',
    seoTitle: 'People-First Change Management Consulting',
    seoDescription:
      'Change management consulting that treats resistance as a signal, not an obstacle. MURBEREC® uses neuroscience to help organizations adopt change and keep it.',
    summary: 'Change people embrace, not endure.',
    lede:
      'We reduce uncertainty, create meaning, and build the conditions for new behaviors to take hold across the organization.',
    focus: ['Adoption', 'Communication', 'Momentum'],
    signals: [
      'A new system or restructure that people are working around',
      'Change fatigue after several initiatives in a row',
      'A merger or reorganization with two cultures to bring together',
      'Leaders who announced the change and assumed it happened',
    ],
    approach: {
      diagnose: 'Stakeholder and impact mapping to find where change will land hardest and why.',
      design: 'Change strategy, leader enablement, communications and learning built for each group affected.',
      embed: 'Adoption tracking, feedback loops and reinforcement until the new way is simply the way.',
    },
    deliverables: ['Change readiness assessment', 'Change strategy and roadmap', 'Leader and sponsor enablement', 'Communication plans', 'Adoption measurement'],
  },
  {
    slug: 'product-design-delivery',
    title: 'Product Design & Delivery',
    seoTitle: 'Human-Centered Product Design & Delivery',
    seoDescription:
      'Human-centered product design and delivery informed by behavioral science. MURBEREC® designs products and services people understand, adopt and come back to.',
    summary: 'Experiences people want to use.',
    lede:
      'Human-centered products and experiences, simplified around real behavior and delivered with clarity, pace, and purpose.',
    focus: ['Simplicity', 'On-time delivery', 'Customer experience'],
    signals: [
      'A product that works but that customers find confusing',
      'Internal tools with low adoption',
      'A service experience with drop-off you cannot explain',
      'A new offering that needs to go from idea to launch',
    ],
    approach: {
      diagnose: 'User research and behavioral analysis to understand decisions, friction and motivation.',
      design: 'Service and product design, prototyping and testing with real users.',
      embed: 'Delivery support, adoption measurement and iteration after launch.',
    },
    deliverables: ['User and behavioral research', 'Service design', 'Product and UX design', 'Prototyping and testing', 'Delivery and launch support'],
  },
];

export const approach = [
  {
    step: 'Diagnose',
    body: 'We start by understanding what is really happening: the behaviors, the systems and the people behind the problem. No assumptions carried in from the last client.',
  },
  {
    step: 'Design',
    body: 'We use neuroscience as a lens, not a formula, to design experiences that move people from knowing to doing.',
  },
  {
    step: 'Embed',
    body: 'We stay after launch, reinforcing and measuring until the new habits stick. That is the part most firms skip.',
  },
];
