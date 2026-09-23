import type { AIProvider, ClassifyResult } from "./provider.js";

const CATEGORIES: { slug: string; keywords: string[]; skills: string[]; techs: string[] }[] = [
  {
    slug: "water",
    keywords: ["water", "fluoride", "arsenic", "well", "handpump", "drinking", "turbidity"],
    skills: ["Environmental Engineering", "Water Chemistry", "Community WASH"],
    techs: ["field test kits", "household filters", "GIS well mapping"],
  },
  {
    slug: "sanitation",
    keywords: ["toilet", "sanitation", "sewage", "waste", "garbage", "drain"],
    skills: ["Sanitation Engineering", "Behaviour Change"],
    techs: ["segregation stalls", "decentralised treatment"],
  },
  {
    slug: "healthcare",
    keywords: ["health", "hospital", "clinic", "doctor", "anemia", "malaria", "phc"],
    skills: ["Public Health", "Health Systems"],
    techs: ["referral rostering", "ASHA comms"],
  },
  {
    slug: "education",
    keywords: ["school", "teacher", "dropout", "education", "student", "classroom"],
    skills: ["Education Technology", "Pedagogy"],
    techs: ["offline teaching kits", "rostering tools"],
  },
  {
    slug: "agriculture",
    keywords: ["farm", "crop", "drought", "soil", "paddy", "irrigation", "kisan", "pump", "motor", "villages"],
    skills: ["Agricultural Engineering", "Agronomy"],
    techs: ["soil moisture sensors", "irrigation scheduling"],
  },
  {
    slug: "environment",
    keywords: ["pollution", "dust", "air", "forest", "mine", "emission", "tree"],
    skills: ["Environmental Science", "Air Quality"],
    techs: ["low-cost PM sensors", "barrier plantation"],
  },
  {
    slug: "energy",
    keywords: ["electricity", "power", "solar", "grid", "outage", "energy", "voltage", "fluctuation", "load-shedding"],
    skills: ["Electrical Engineering", "Power Electronics"],
    techs: ["voltage stabilizers", "solar-hybrid inverters", "IoT energy monitors"],
  },
  {
    slug: "accessibility",
    keywords: ["ramp", "disability", "accessible", "wheelchair", "divyang"],
    skills: ["Inclusive Design", "Civil Engineering"],
    techs: ["modular ramps", "counter redesign"],
  },
  {
    slug: "urban_infra",
    keywords: ["flood", "road", "traffic", "housing", "slum", "urban"],
    skills: ["Urban Planning", "Civil Engineering"],
    techs: ["drain mapping", "silt traps"],
  },
  {
    slug: "rural_livelihoods",
    keywords: ["livelihood", "ntfp", "forest produce", "mgnrega", "income", "tribal"],
    skills: ["Rural Management", "Value Chains"],
    techs: ["price boards", "voice logs"],
  },
  {
    slug: "public_admin",
    keywords: ["ration", "certificate", "panchayat", "service", "delay", "csc"],
    skills: ["Public Administration", "Service Design"],
    techs: ["SMS tokens", "checklist posters"],
  },
];

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreCategory(text: string, cat: (typeof CATEGORIES)[number]) {
  return cat.keywords.filter((k) => text.includes(k)).length;
}

export class DemoAIProvider implements AIProvider {
  name = "DemoAI";
  mode: "demo" = "demo";

  async classify(text: string): Promise<ClassifyResult> {
    const lower = text.toLowerCase();
    const ranked = CATEGORIES.map((c) => ({ c, hits: scoreCategory(lower, c) })).sort((a, b) => b.hits - a.hits);
    const primary = ranked[0];
    const secondary = ranked[1].hits > 0 ? ranked[1] : undefined;

    const irrigationVoltage =
      /pump|irrigation/.test(lower) && /voltage|fluctuat|electric|power|outage|grid/.test(lower);

    const categorySlug = irrigationVoltage ? "agriculture" : primary.c.slug;
    const secondarySlug = irrigationVoltage ? "energy" : secondary?.c.slug;
    const subDomain = irrigationVoltage
      ? "Farm electrification / irrigation energy reliability"
      : `${categorySlug.replaceAll("_", " ")} operations`;

    const skills = irrigationVoltage
      ? ["Electrical Engineering", "Agricultural Engineering", "IoT"]
      : Array.from(new Set([...(primary.c.skills), ...(secondary?.c.skills ?? [])])).slice(0, 5);

    const technologies = irrigationVoltage
      ? ["voltage stabilizer", "IoT voltage logger", "solar-hybrid pump controller"]
      : Array.from(new Set([...(primary.c.techs), ...(secondary?.c.techs ?? [])])).slice(0, 5);

    const tags = (irrigationVoltage ? ["irrigation", "voltage", "pump", "energy", "crops"] : primary.c.keywords.filter((k) => lower.includes(k))).slice(0, 6);
    const hits = irrigationVoltage ? 6 : primary.hits;
    const confidence = Math.min(0.93, 0.38 + hits * 0.1);
    const summary = irrigationVoltage
      ? "Demo AI Mode: irrigation pumps failing under voltage fluctuation, affecting crops in neighbouring villages. Primary domain agriculture with secondary energy. Advisory only — a human must validate."
      : `Demo AI Mode classified this report under ${categorySlug.replaceAll("_", " ")} based on keyword overlap (${hits} matches). This is a deterministic demo score, not measured ML accuracy.`;

    return {
      categorySlug,
      secondarySlug,
      subDomain,
      suggestedTags: tags.length ? tags : tokenize(lower).slice(0, 4),
      skills,
      technologies,
      urgencyHint: irrigationVoltage || /frequent|stops|children|hospital/.test(lower) ? 4 : 3,
      confidence,
      summary,
      pipeline: [
        { id: "lang", label: "Language understood", done: true },
        { id: "domain", label: "Domain identified", done: true },
        { id: "related", label: "Related challenges searched", done: true },
        { id: "priority", label: "Priority calculated", done: true },
        { id: "skills", label: "Required skills extracted", done: true },
        { id: "institutions", label: "Institutions matched", done: false },
      ],
    };
  }

  async embed(text: string): Promise<number[]> {
    const dim = 64;
    const vec = new Array(dim).fill(0);
    const tokens = tokenize(text);
    for (const t of tokens) {
      let h = 0;
      for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
      vec[h % dim] += 1;
      vec[(h >>> 8) % dim] += 0.5;
    }
    const boost = ["irrigation", "pump", "voltage", "crop", "village", "fluctuation", "motor"];
    for (const t of boost) {
      if (text.toLowerCase().includes(t)) {
        vec[12] += 0.8;
        vec[27] += 0.6;
      }
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  async summarize(text: string): Promise<string> {
    const clipped = text.replace(/\s+/g, " ").trim().slice(0, 280);
    return `Demo AI Mode summary: ${clipped}${text.length > 280 ? "…" : ""}`;
  }
}
