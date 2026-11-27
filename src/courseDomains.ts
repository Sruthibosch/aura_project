/** Prefer saved domain metadata. Older courses use subject keywords, never learner audience. */
export type CourseDomainMetadata = {
  domain?: string;
  category?: string;
  topics?: string[];
};
type DomainCourse = CourseDomainMetadata & {
  title: string;
  description?: string;
  course?: CourseDomainMetadata & {
    title?: string;
    description?: string;
    modules?: { title?: string; slides?: { title?: string }[] }[];
  };
};
const rules: { name: string; icon: string; matches: RegExp; aliases: string[] }[] = [
  { name: "Python", icon: "🐍", matches: /\b(?:python|pandas|numpy|django|flask)\b/i, aliases: ["python programming"] },
  { name: "JavaScript & TypeScript", icon: "JS", matches: /\b(?:javascript|typescript|node\.?js|react\.?js|next\.?js|angular|vue\.?js)\b/i, aliases: ["javascript", "typescript", "js", "ts"] },
  { name: "Java", icon: "☕", matches: /\bjava\b|\bspring boot\b/i, aliases: ["java programming"] },
  { name: "C & C++", icon: "C++", matches: /\bc\+\+|\bc programming\b|\bprogramming (?:in|with) c\b/i, aliases: ["c", "c++", "cpp"] },
  { name: "AI & Machine Learning", icon: "🤖", matches: /\b(?:artificial intelligence|machine learning|deep learning|neural networks?|generative ai|genai|llms?|large language models?|transformers?|multi[- ]head attention|natural language processing|computer vision|reinforcement learning)\b|\bAI\b/i, aliases: ["ai", "ml", "machine learning", "artificial intelligence", "ai & ml", "ai and machine learning", "deep learning"] },
  { name: "Data Science", icon: "📊", matches: /\b(?:data science|data analysis|data analytics|data visualization|statistics|statistical|pandas|numpy|power bi|tableau)\b/i, aliases: ["data analytics", "data analysis"] },
  { name: "SQL & Databases", icon: "▤", matches: /\b(?:sql|mysql|postgresql|sqlite|mongodb|databases?|database management|dbms|nosql)\b/i, aliases: ["sql", "databases", "database"] },
  { name: "Web Development", icon: "💻", matches: /\b(?:web development|full[- ]stack|front[- ]end|back[- ]end|html|css|javascript|typescript|react|angular|vue|django|flask|web applications?)\b/i, aliases: ["full-stack dev", "full stack", "full-stack development", "frontend", "backend", "web dev"] },
  { name: "UI / UX Design", icon: "🎨", matches: /\b(?:ui\s*[/&]\s*ux|user experience|user interface|interface design|design systems?|figma|wirefram(?:e|es|ing)|visual hierarchy|usability)\b/i, aliases: ["ui/ux", "ui/ux design", "ui design", "ux design", "ui & ux design"] },
  { name: "Cybersecurity", icon: "🛡", matches: /\b(?:cybersecurity|cyber security|ethical hacking|penetration testing|network security|cryptography|information security)\b/i, aliases: ["cyber security", "information security"] },
  { name: "Cloud & DevOps", icon: "☁", matches: /\b(?:cloud computing|cloud architecture|aws|azure|google cloud|devops|docker|kubernetes|terraform|ci\/cd)\b/i, aliases: ["cloud", "cloud computing", "devops"] },
  { name: "Mobile Development", icon: "📱", matches: /\b(?:android|ios|flutter|react native|swiftui|mobile (?:apps?|applications?|development))\b/i, aliases: ["mobile", "app development"] },
  { name: "Engineering", icon: "⚙", matches: /\b(?:engineering|mechanics|thermodynamics|robotics|electrical circuits?|electronics|cad|kinematics)\b/i, aliases: [] },
  { name: "Animation & Graphics", icon: "◈", matches: /\b(?:animations?|computer graphics|motion design|blender|3d model(?:ing|ling)|2d graphics|3d graphics)\b/i, aliases: ["animation", "graphics", "2d animation", "3d animation"] },
  { name: "Business & Management", icon: "▣", matches: /\b(?:business|project management|leadership|entrepreneurship|product management|business strategy|people management)\b/i, aliases: ["business", "management", "leadership"] },
  { name: "Marketing & Growth", icon: "↗", matches: /\b(?:marketing|seo|growth strategy|growth marketing|social media marketing|brand strategy)\b/i, aliases: ["marketing", "growth", "digital marketing"] },
  { name: "Finance", icon: "◉", matches: /\b(?:finance|financial|accounting|investment|budgeting|economics)\b/i, aliases: ["accounting"] },
  { name: "Mathematics", icon: "∑", matches: /\b(?:mathematics|calculus|algebra|geometry|trigonometry|probability)\b/i, aliases: ["math", "maths"] },
];
const audienceWords = /^(?:beginner|intermediate|advanced|student|it professional|content creator|developer|manager|other|general)$/i;
function normalizeDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const label = value.trim().replace(/\s+/g, " ");
  if (!label || label.split(/\s*[•|]\s*/).every(part => audienceWords.test(part))) return;
  const normalized = label.toLowerCase();
  return rules.find(rule => rule.name.toLowerCase() === normalized || rule.aliases.includes(normalized))?.name || label;
}
export function getCourseDomains(item: DomainCourse): string[] {
  const explicit = [item.domain, item.category, ...(Array.isArray(item.topics) ? item.topics : []), item.course?.domain, item.course?.category, ...(Array.isArray(item.course?.topics) ? item.course.topics : [])]
    .map(normalizeDomain).filter((name): name is string => Boolean(name));
  if (explicit.length) return [...new Map(explicit.map(name => [name.toLowerCase(), name])).values()];
  const headingText = [item.title, item.course?.title, item.description, item.course?.description,
    ...(item.course?.modules ?? []).flatMap(module => [module.title, ...(module.slides ?? []).map(slide => slide.title)]),
  ].filter(Boolean).join(" ");
  const inferred = rules.filter(rule => rule.matches.test(headingText)).map(rule => rule.name);
  return inferred.length ? inferred : ["General Learning"];
}
export function getDomainIcon(name: string): string {
  return rules.find(rule => rule.name === name)?.icon || "✦";
}
