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

  // TODO(owner): only list clients approved for public use. Each needs a
  // logo in /public/clients/ and real alt text. The section is hidden while
  // this list is empty.
  clients: [] as { name: string; logo: string }[],

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
