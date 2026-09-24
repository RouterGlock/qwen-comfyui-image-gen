/**
 * Every business fact the site shows lives here, so the owner can confirm
 * or correct it in one place. Anything left empty is hidden on the site
 * rather than shown as placeholder data. See CONTENT-CHECKLIST.md.
 */

export const site = {
  name: 'MURBEREC®',
  shortName: 'MURBEREC',
  url: 'https://murberec.com',
  tagline: 'People-first consulting, grounded in neuroscience.',
  description:
    'MURBEREC® is a people-first consulting firm that uses neuroscience to design leadership development, learning experiences, change management and products that stick. No templates, no playbooks.',

  // TODO(owner): confirm. The old footer said "Alexandria, NY", which is wrong.
  // Left blank so nothing incorrect is published; fill in to show it.
  address: {
    street: '',        // e.g. '901 N Pitt St, Suite 17'
    locality: '',      // e.g. 'Alexandria'
    region: '',        // e.g. 'VA'
    postalCode: '',
    country: 'US',
  },
  // TODO(owner): real phone number. The old one was a fictional 555 number.
  phone: '',          // display form, e.g. '(703) 000-0000'
  // TODO(owner): public contact email.
  email: '',

  // TODO(owner): social profile URLs (used in the footer and JSON-LD sameAs).
  social: [] as { label: string; href: string }[],

  primaryCta: { label: 'Book a 30-min discovery call', href: '/contact' },

  ticker: ['Develop your people', 'Grow your leaders', 'Embrace change', 'Delight your customers'],

  // From the handoff brief. TODO(owner): confirm each figure before launch.
  stats: [
    { value: '1M+', label: 'Learners reached' },
    { value: '4', label: 'Continents' },
    { value: '10+', label: 'Years of practice' },
    { value: '50+', label: 'Enterprise engagements' },
  ],

  // As shown on the current murberec.com ("Our team has delivered for").
  // Original logo files from that site, trimmed and resized to 2x display size.
  clients: [
    { name: 'Gap', logo: '/clients/gap.png' },
    { name: 'CommonSpirit Health', logo: '/clients/commonspirit.png' },
    { name: 'Athleta', logo: '/clients/athleta.png' },
    { name: 'Marriott Vacations Worldwide', logo: '/clients/marriott-vacations-worldwide.png' },
    { name: 'Capgemini', logo: '/clients/capgemini.png' },
    { name: 'Old Navy', logo: '/clients/old-navy.png' },
    { name: 'Stryker', logo: '/clients/stryker.png' },
    { name: 'Defense Language Institute', logo: '/clients/defense-language-institute.png' },
    { name: 'Banana Republic', logo: '/clients/banana-republic.png' },
    { name: 'Best Buy', logo: '/clients/best-buy.png' },
    { name: 'VMware', logo: '/clients/vmware.png' },
    { name: 'Verizon', logo: '/clients/verizon.png' },
  ] as { name: string; logo: string }[],

  industries: ['Technology', 'Healthcare', 'Retail & media', 'Professional services', 'Public sector'],

  // TODO(owner): add real, approved testimonials. Hidden while empty.
  testimonials: [] as { quote: string; name: string; role: string; org: string }[],
};

export const nav = [
  { label: 'Services', href: '/services' },
  { label: 'Xtudio®', href: '/xtudio' },
  { label: 'Work', href: '/work' },
  { label: 'About', href: '/about' },
];

export const telHref = (phone: string) => 'tel:+1' + phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

export const hasAddress = () => Boolean(site.address.street && site.address.locality);
