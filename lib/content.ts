// Every visible word on the site lives here. The résumé PDF is generated from it too.

/** Flip to true once github.com/DaivikChawla has at least one public repo (this one). */
export const SHOW_GITHUB = true;

export const meta = {
  name: "Daivik Chawla",
  site: "daivik.mysterystudios.xyz",
  url: "https://daivik.mysterystudios.xyz",
  email: "daivikchawla001@gmail.com",
  linkedin: "https://www.linkedin.com/in/daivikchawla/",
  github: "https://github.com/DaivikChawla",
  fiverr: "https://www.fiverr.com/daivikchawla",
  title: "Daivik Chawla — 18, first year at Thapar, already running a business",
  description:
    "First-year computer science student at Thapar. I run a freelance dev studio, co-founded a web studio, and fund my own expenses.",
  status: "First year, B.E. Computer Science, Thapar Institute of Engineering & Technology, Patiala",
  resume: "/daivik-chawla-resume.pdf",
};

export const hero = {
  eyebrow: "First year · Computer Science · Thapar",
  headline: "I’m 18 and I already run a business.",
  sub: "I run a freelance dev studio with 100+ five-star reviews, I co-founded a web studio, and I fund my own expenses. Now I want to build with a team.",
  ctaPrimary: "See what I’ve built",
  ctaSecondary: "Download résumé (PDF)",
};

export type Proof = {
  big: string;
  star?: boolean;
  small: string;
  href: string;
  note: number;
  external: boolean;
};

export const proof: Proof[] = [
  { big: "5.0", star: true, small: "from 100+ client reviews", href: meta.fiverr, note: 1, external: true },
  { big: "Level 2", small: "Fiverr seller since 2023", href: meta.fiverr, note: 2, external: true },
  { big: "2023", small: "freelancing since", href: meta.fiverr, note: 3, external: true },
  { big: "2", small: "businesses running right now", href: "#work", note: 4, external: false },
];

export const proofNotes = [
  { marks: "1–3", label: "fiverr.com/daivikchawla", href: meta.fiverr, external: true },
  { marks: "4", label: "Work section", href: "#work", external: false },
];

export const about = {
  header: "A bit about me",
  paragraphs: [
    "I’m a first-year computer science student at Thapar. I’ve been obsessed with tech for as long as I can remember. If something new comes out, I want to know how it works and what I can build with it.",
    "I started freelancing in school. Since then I’ve earned around ₹12 lakh, and these days I pay my own expenses. My first iPhone was bought with money I made myself, and that still feels good to say.",
    "Not everything worked. I tried dropshipping and it didn’t stick. That’s fine. I’d rather try five things and keep two than sit around waiting for the perfect idea.",
  ],
  outside: [
    "I invest in the stock market.",
    "I read about new tech the way some people follow cricket.",
  ],
};

export type LinkButton = { label: string; href: string };

export const mysteryStudios = {
  id: "mysterystudios",
  name: "MysteryStudios",
  sub: "my freelance dev studio",
  tag: { role: "Founder", from: "2023", to: "now" },
  line: "I build and launch multiplayer game servers for clients around the world.",
  body: [
    "MysteryStudios is where most of my income comes from. Clients bring me an idea for a game server, and I hand back something ready to launch: the gameplay systems, custom features, menus, in-game economy and the online store that makes it money. Most of my clients find me on Fiverr, where I’m a Level 2 seller with a 5.0 rating across more than a hundred reviews, from clients in the US, the UK and Europe.",
    "Running it taught me the parts of building that school doesn’t: scoping work with a client, quoting a price, hitting deadlines, and fixing things when they break the night before launch.",
  ],
  byHand: "For a long time I built every server by hand, piece by piece.",
  automated:
    "Once I learned to work with AI tools, I automated most of that process, so work that used to eat my days now takes a fraction of the time.",
  buttons: [
    { label: "Visit mysterystudios.xyz", href: "https://mysterystudios.xyz" },
    { label: "See reviews on Fiverr", href: meta.fiverr },
  ] as LinkButton[],
};

export const pagewalla = {
  id: "pagewalla",
  name: "pagewalla",
  sub: "websites for local businesses",
  tag: "Co-founder",
  line: "Websites for businesses that only exist on Instagram.",
  body: [
    "Plenty of good local businesses — clinics, salons, gyms — have a great Instagram and no website, so they don’t show up when someone searches Google. pagewalla builds them a proper site in about a week. We’ve already built one for Shri Raam Engineering, a crane engineering company in Gurugram.",
    "I’ve made the cold calls myself, and the ones that ended in “no thanks” taught me more about selling than anything else this year.",
  ],
  buttons: [
    { label: "Visit pagewalla.site", href: "https://pagewalla.site" },
    { label: "See Shri Raam Engineering", href: "https://shriraamengineering.in" },
  ] as LinkButton[],
  shots: [
    { src: "/sites/pagewalla.webp", host: "pagewalla.site", href: "https://pagewalla.site", alt: "pagewalla.site" },
    {
      src: "/sites/shriraam.webp",
      host: "shriraamengineering.in",
      href: "https://shriraamengineering.in",
      alt: "Shri Raam Engineering",
    },
  ],
};

export const vesper = {
  id: "vesper",
  name: "Vesper",
  sub: "an AI assistant running on my own subscription",
  tag: "Side project · macOS",
  line: "An AI assistant that lives on my screen and talks back.",
  body: [
    "I found Clicky, an open-source AI screen companion, and made my own version of it. The main thing I changed: instead of paying for API usage, Vesper runs on my existing Claude subscription. I also gave it a personality. It’s blunt, a little sarcastic, and tells me when I’m wrong.",
  ],
  credit: "Based on the open-source Clicky project.",
};

export const howIBuild = {
  header: "How I build",
  paragraphs: [
    "I don’t write most of my code by hand. I direct AI agents that do: I decide what to build, write the brief, check what comes back, and push it until it’s right. That’s how a first-year ships things that would normally need a whole team.",
    "I learned to work this way by doing it the slow way first. I used to build game servers entirely by hand, and once I understood the work, I automated most of it. I’m learning the fundamentals properly too, which is why I’m doing Harvard’s CS50 on the side, on top of college.",
  ],
  toolkit: [
    {
      group: "Building with AI",
      items: [
        "Claude Code",
        "Claude Design",
        "agent skills and subagents",
        "MCP tools",
        "briefing and directing agents",
      ],
    },
    { group: "Code", items: ["C (college)", "CS50"] },
    {
      group: "Business",
      items: [
        "100+ five-star reviews on Fiverr",
        "clients in the US, the UK and Europe",
        "scoping and quoting projects",
        "cold calls and selling",
      ],
    },
  ],
};

export const gdg = {
  header: "What I’d bring to GDG",
  paragraphs: [
    "So far I’ve mostly built alone. I want to build with people who care about this as much as I do.",
    "What I’d bring: I know how to take something from an idea to a live product before the deadline, and I know how to talk to the people it’s for. I’d love to run hands-on sessions on building with AI tools — take a room from an empty folder to a live website in one evening.",
  ],
};

export const footer = {
  line: "If you’re reading this for GDG recruitment, thanks for making it to the bottom.",
  smallPrint: "Built by me, with the same tools I’d love to teach.",
  copyright: "© 2026 Daivik Chawla",
};

export const footerLinks: LinkButton[] = [
  { label: "LinkedIn", href: meta.linkedin },
  { label: "Fiverr", href: meta.fiverr },
  ...(SHOW_GITHUB ? [{ label: "GitHub", href: meta.github }] : []),
];
