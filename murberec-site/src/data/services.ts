/**
 * Draft service copy, written from the handoff brief because the live site
 * could not be fetched. TODO(owner): review wording before launch.
 */

export interface Service {
  slug: string;
  title: string;
  /** Page <title>, written around the search term the page targets. */
  seoTitle: string;
  seoDescription: string;
  summary: string;
  lede: string;
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
    summary: 'Leaders who make better decisions under pressure, and teams that trust them.',
    lede:
      'Most leadership programs are forgotten by the next quarter. We design around how the brain actually builds habits: attention, emotion, repetition and social reinforcement. What your leaders learn shows up in how they lead on a Tuesday afternoon.',
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
    summary: 'Learning people finish, remember, and actually use on the job.',
    lede:
      'Completion rates are not learning. We design experiences around how memory works: spaced practice, retrieval, emotion and context. The result is training that changes performance, not just a certificate.',
    signals: [
      'High completion, low change in performance',
      'A course library nobody browses',
      'Onboarding that takes months to reach full productivity',
      'Compliance training people click through',
    ],
    approach: {
      diagnose: 'Performance analysis to separate what is a skill gap from what is a system, process or motivation problem.',
      design: 'Learning experience design across live, digital and blended formats, produced in-house with our content arm, Xtudio®.',
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
    summary: 'Change that people adopt, rather than change that happens to them.',
    lede:
      'The brain reads uncertainty as threat. That is why most change efforts stall, and why more communication rarely fixes it. We design change around certainty, autonomy and belonging, so people can move with it instead of against it.',
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
    summary: 'Products and services designed around how people actually think and decide.',
    lede:
      'Good products reduce cognitive load. We bring behavioral and cognitive science into discovery, design and delivery, so what you ship is easier to understand, easier to adopt and harder to leave.',
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
    body: 'We build a custom solution around how people actually think, learn and change. No templates, no playbooks.',
  },
  {
    step: 'Embed',
    body: 'We stay after launch, reinforcing and measuring until the new habits stick. That is the part most firms skip.',
  },
];
