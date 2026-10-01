import { AuraMark, DomainIcon } from "./BrandIcons";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import "./CourseFeed.css";
import { getCourseDomains, type CourseDomainMetadata } from "./courseDomains";

type Slide = {
  title: string;
  content: string;
  keyPoints?: string[];
  example?: string;
  imageUrl?: string;
};
type Question = {
  question: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
};
type Course = CourseDomainMetadata & {
  title: string;
  description: string;
  learningObjectives?: string[];
  modules: {
    title: string;
    introduction?: string;
    learningObjectives?: string[];
    slides: Slide[];
    recap?: string | string[];
  }[];
  assessment?: Question[];
};
type Page = Slide & { coverSeed?: string; label: string; kind: "cover" | "overview" | "lesson" | "recap" | "assessment"; questions?: Question[] };
export type FeedCourse = CourseDomainMetadata & {
  id: number;
  title: string;
  description: string;
  audience: string;
  coverImage: string;
  updatedAt: string;
  creatorName?: string;
  course: Course;
};
type Props = {
  courses: FeedCourse[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: () => void;
  composer?: ReactNode;
};
type Comment = { id: string; text: string; createdAt: string };
type Reactions = { liked: boolean; bookmarked: boolean; comments: Comment[] };
type SocialState = Record<string, Reactions>;
const SOCIAL_KEY = "aura.course-feed.social.v1";
const emptyReactions: Reactions = { liked: false, bookmarked: false, comments: [] };

// The supplied backend has no social endpoints. This adapter stores this browser's
// reactions. Replace it with your authenticated API to share activity between users.
function readSocial(): SocialState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SOCIAL_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: SocialState = {};
    Object.entries(value).forEach(([id, raw]) => {
      if (!/^\d+$/.test(id) || !raw || typeof raw !== "object") return;
      const item = raw as Partial<Reactions>;
      result[id] = {
        liked: item.liked === true,
        bookmarked: item.bookmarked === true,
        comments: Array.isArray(item.comments)
          ? item.comments.filter((comment): comment is Comment => Boolean(comment && typeof comment.id === "string" && typeof comment.text === "string" && typeof comment.createdAt === "string"))
          : [],
      };
    });
    return result;
  } catch {
    return {};
  }
}

function coursePages(item: FeedCourse): Page[] {
  const course = item.course;
  const pages: Page[] = [{
    title: course.title || item.title,
    content: "",
    imageUrl: item.coverImage || undefined,
    coverSeed: `${item.id}:${course.title || item.title}`,
    label: "",
    kind: "cover",
  }, {
    title: "Course overview",
    content: course.description || item.description,
    keyPoints: course.learningObjectives,
    label: "COURSE OVERVIEW",
    kind: "overview",
  }];
  (course.modules ?? []).forEach((module, index) => {
    const label = `MODULE ${String(index + 1).padStart(2, "0")} · ${module.title}`;
    if (module.introduction || module.learningObjectives?.length) {
      pages.push({ title: module.title, content: module.introduction || "", keyPoints: module.learningObjectives, label, kind: "lesson" });
    }
    pages.push(...(module.slides ?? []).map(slide => ({ ...slide, label, kind: "lesson" as const })));
    if (module.recap?.length) {
      pages.push({ title: "Module recap", content: typeof module.recap === "string" ? module.recap : "", keyPoints: Array.isArray(module.recap) ? module.recap : undefined, label, kind: "recap" });
    }
  });
  if (course.assessment?.length) {
    pages.push({ title: "Test your knowledge", content: "Choose your answers, then reveal each explanation.", label: "FINAL ASSESSMENT", kind: "assessment", questions: course.assessment });
  }
  return pages;
}

function Icon({ name, filled = false }: { name: "heart" | "comment" | "bookmark" | "expand" | "left" | "right" | "search" | "close" | "book" | "smile"; filled?: boolean }) {
  const paths: Record<typeof name, ReactNode> = {
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14c2 3 6 3 8 0M8 9h.01M16 9h.01" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    comment: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l1.9-4.1A8.5 8.5 0 1 1 21 11.5Z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    expand: <><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /><path d="m3 3 6 6m12-6-6 6m6 12-6-6M3 21l6-6" /></>,
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />,
    search: <><circle cx="10.8" cy="10.8" r="7" /><path d="m16 16 5 5" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    book: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" /><path d="M12 5v15" /></>,
  };
  return <svg width="23" height="23" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const creatorName = (item: FeedCourse) => item.creatorName?.trim() || "AURA Creator";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Stable artwork per course: luminous jewel-tone gradients with shared AURA styling.
// Only numeric geometry and fixed colors enter the SVG; course text stays in HTML.
function makeCourseCover(seed: string): string {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  let state = hash || 1;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const palettes = [
    ["#121746", "#4f46e5", "#a78bfa"], // AURA violet
    ["#101e49", "#3458df", "#36cce0"], // Electric blue / cyan
    ["#073442", "#088f97", "#57dcba"], // Teal / jade
    ["#29134d", "#842ee1", "#df70eb"], // Royal purple / orchid
    ["#172344", "#176fbd", "#6bdaed"], // Sapphire / sky
    ["#32154f", "#ac369d", "#fa8ba6"], // Berry / coral
  ];
  const palette = palettes[Math.floor(random() * palettes.length)];
  const cx = Math.round(760 + random() * 230);
  const cy = Math.round(190 + random() * 110);
  const rotate = Math.round(random() * 45 - 22);
  const size = Math.round(140 + random() * 70);
  const variant = hash % 6;
  let artwork = "";
  if (variant === 0) {
    // Orbital paths.
    artwork = [1, 1.5, 2.05].map((scale, index) => `<ellipse cx="${cx}" cy="${cy}" rx="${Math.round(size * scale)}" ry="${Math.round(size * scale * .64)}" transform="rotate(${rotate + index * 24} ${cx} ${cy})" fill="none" stroke="#d8d5ff" stroke-opacity="${.42 - index * .1}" stroke-width="2"/>`).join("") + `<circle cx="${cx + size}" cy="${cy}" r="13" fill="#ddd7ff" fill-opacity=".7"/>`;
  } else if (variant === 1) {
    // Layered architectural frames.
    artwork = Array.from({ length: 5 }, (_, i) => `<rect x="${cx - size + i * 23}" y="${cy - size + i * 19}" width="${size * 1.65}" height="${size * 1.65}" rx="28" transform="rotate(${rotate - 16} ${cx} ${cy})" fill="#d4ccff" fill-opacity=".025" stroke="#e3ddff" stroke-opacity="${.15 + i * .06}" stroke-width="2"/>`).join("");
  } else if (variant === 2) {
    // Flowing contour lines.
    artwork = Array.from({ length: 9 }, (_, i) => `<path d="M${cx - 340} ${cy - 180 + i * 34} C${cx - 40} ${cy - 310 + i * 17},${cx - 60} ${cy + 270 + i * 10},${cx + 400} ${cy - 60 + i * 36}" fill="none" stroke="#ded9ff" stroke-opacity="${.12 + i * .026}" stroke-width="${i === 4 ? 4 : 2}"/>`).join("");
  } else if (variant === 3) {
    // A constellation of connected ideas.
    const points = Array.from({ length: 8 }, () => [Math.round(cx - 220 + random() * 430), Math.round(cy - 140 + random() * 330)]);
    artwork = points.map((point, i) => {
      const next = points[(i + 1) % points.length];
      const cross = points[(i + 3) % points.length];
      return `<path d="M${point[0]} ${point[1]} L${next[0]} ${next[1]} M${point[0]} ${point[1]} L${cross[0]} ${cross[1]}" fill="none" stroke="#d7d2ff" stroke-opacity=".24" stroke-width="2"/><circle cx="${point[0]}" cy="${point[1]}" r="${7 + i % 3 * 4}" fill="#e6e1ff" fill-opacity=".65"/>`;
    }).join("");
  } else if (variant === 4) {
    // Isometric planes.
    artwork = Array.from({ length: 4 }, (_, i) => `<path d="M${cx} ${cy - size + i * 47} l${size} ${size * .55} -${size} ${size * .55} -${size} -${size * .55}Z" fill="#d5cbff" fill-opacity="${.04 + i * .018}" stroke="#dfd9ff" stroke-opacity="${.5 - i * .08}" stroke-width="2"/>`).join("");
  } else {
    // Radial arcs and a dotted field.
    artwork = Array.from({ length: 5 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${size * .5 + i * 32}" fill="none" stroke="#dcd6ff" stroke-opacity="${.5 - i * .075}" stroke-width="2" stroke-dasharray="${100 + i * 55} ${35 + i * 12}" transform="rotate(${rotate + i * 26} ${cx} ${cy})"/>`).join("");
    artwork += Array.from({ length: 24 }, (_, i) => `<circle cx="${cx - 270 + i % 6 * 20}" cy="${cy + Math.floor(i / 6) * 20}" r="2.5" fill="#ddd5ff" fill-opacity=".3"/>`).join("");
  }
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="bg" x2="${.55 + random() * .45}" y2="1"><stop stop-color="${palette[0]}"/><stop offset=".6" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/></linearGradient><radialGradient id="glow"><stop stop-color="${palette[2]}" stop-opacity=".4"/><stop offset="1" stop-color="${palette[2]}" stop-opacity="0"/></radialGradient></defs><path fill="url(#bg)" d="M0 0h1200v800H0z"/><circle cx="${cx}" cy="${cy}" r="470" fill="url(#glow)"/>${artwork}</svg>`);
}

function splitCoverTitle(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words;
  // Keep labels such as “2D Animations” together on the second line.
  const dimensional = words.findIndex((word, index) => index > 0 && /^(?:2d|3d)$/i.test(word));
  let split = dimensional > 0 ? dimensional : 1;
  if (dimensional < 1) {
    let difference = Infinity;
    for (let index = 1; index < words.length; index++) {
      const score = Math.abs(words.slice(0, index).join(" ").length - words.slice(index).join(" ").length);
      if (score < difference) { difference = score; split = index; }
    }
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

function CourseCover({ page }: { page: Page }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fallbackCover = useMemo(() => makeCourseCover(page.coverSeed || page.title), [page.coverSeed, page.title]);
  const source = page.imageUrl && failedUrl !== page.imageUrl ? page.imageUrl : fallbackCover;
  return <div className="sf-course-cover">
    <img className="sf-cover-image" src={source} alt="" draggable={false} onError={() => setFailedUrl(page.imageUrl || null)} />
    <div className="sf-cover-shade" />
    <div className="sf-cover-title"><h3 aria-label={page.title}>{splitCoverTitle(page.title).map((line, index) => <span className="sf-cover-title-line" key={index}>{line}</span>)}</h3></div>
  </div>;
}

function PageContent({ page, scope }: { page: Page; scope: string }) {
  const [brokenImage, setBrokenImage] = useState(false);
  if (page.kind === "cover") return <CourseCover page={page} />;
  return <div className={`sf-page-content sf-page-${page.kind}`}>
    <span className="sf-page-label"><span aria-hidden="true" />{page.label}</span>
    <h3>{page.title}</h3>
    {page.content && <p className="sf-page-copy">{page.content}</p>}
    {page.imageUrl && !brokenImage && <img className="sf-page-image" src={page.imageUrl} alt="" draggable={false} onError={() => setBrokenImage(true)} />}
    {!!page.keyPoints?.length && <section className="sf-takeaways">
      <h4>{page.kind === "overview" ? "What you’ll learn" : page.kind === "recap" ? "Remember these ideas" : "Key takeaways"}</h4>
      <ul>{page.keyPoints.map((point, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></li>)}</ul>
    </section>}
    {page.example && <section className="sf-example"><span>IN PRACTICE</span><p>{page.example}</p></section>}
    {page.questions?.map((question, questionIndex) => <section className="sf-question" key={questionIndex}>
      <h4>{questionIndex + 1}. {question.question}</h4>
      {question.options?.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={`${scope}-question-${questionIndex}`} value={option} />{option}</label>)}
      <details><summary>Reveal answer</summary><strong>{question.correctAnswer}</strong><p>{question.explanation}</p></details>
    </section>)}
    {page.kind === "overview" && <div className="sf-page-signoff"><Icon name="book" /><span>One course. A new perspective.</span><span aria-hidden="true"><AuraMark /></span></div>}
  </div>;
}

function Carousel({ pages, index, onChange, onExpand, scope, large = false }: {
  pages: Page[];
  index: number;
  onChange: (index: number) => void;
  onExpand?: () => void;
  scope: string;
  large?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(index);
  const changeRef = useRef(onChange);
  activeIndex.current = index;
  changeRef.current = onChange;
  const suppressClick = useRef(false);
  const gesture = useRef<{
    id: number; type: string; x: number; y: number; dx: number;
    startedAt: number; scrollLeft: number; startIndex: number; axis: "x" | "y" | null;
  } | null>(null);
  const clamp = (value: number) => Math.max(0, Math.min(pages.length - 1, value));
  const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest("button, input, textarea, select, label, summary, a, details");
  const scrollToPage = (value: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ left: clamp(value) * viewport.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
  };
  // Native scrolling handles finger swipes, trackpads and momentum. Resize keeps the
  // active page aligned, including when the enlarged dialog first becomes visible.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let width = 0;
    const alignPage = () => {
      if (!viewport.clientWidth || viewport.clientWidth === width) return;
      width = viewport.clientWidth;
      viewport.scrollTo({ left: activeIndex.current * width, behavior: "auto" });
    };
    alignPage();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(alignPage) : null;
    observer?.observe(viewport);
    window.addEventListener("resize", alignPage);
    return () => { observer?.disconnect(); window.removeEventListener("resize", alignPage); };
  }, [pages.length]);
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || interactive(event.target)) return;
    const viewport = event.currentTarget;
    suppressClick.current = false;
    if (event.pointerType === "mouse") {
      viewport.focus({ preventScroll: true });
      viewport.scrollTo({ left: viewport.scrollLeft, behavior: "auto" });
    }
    gesture.current = {
      id: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY,
      dx: 0, startedAt: event.timeStamp, scrollLeft: viewport.scrollLeft,
      startIndex: clamp(Math.round(viewport.scrollLeft / (viewport.clientWidth || 1))), axis: null,
    };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 5) {
      current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      suppressClick.current = true;
      if (current.type === "mouse" && current.axis === "x") {
        event.currentTarget.style.scrollSnapType = "none";
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    current.dx = dx;
    // Do not capture touch pointers or override browser-managed touch scrolling.
    if (current.type !== "mouse" || current.axis !== "x") return;
    event.preventDefault();
    event.currentTarget.scrollLeft = current.scrollLeft - dx;
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (cancelled) suppressClick.current = true;
    if (current.type === "mouse" && current.axis === "x") {
      const distance = Math.abs(current.dx);
      const velocity = distance / Math.max(1, event.timeStamp - current.startedAt);
      const threshold = Math.max(24, Math.min(60, event.currentTarget.clientWidth * .12));
      const isSwipe = distance >= threshold || (distance >= 14 && velocity > .4);
      const destination = !cancelled && isSwipe
        ? current.startIndex + (current.dx < 0 ? 1 : -1)
        : current.startIndex;
      event.currentTarget.style.scrollSnapType = "";
      scrollToPage(destination);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className={`sf-carousel${large ? " sf-carousel-large" : ""}`} role="region" aria-roledescription="carousel" aria-label="Course pages">
    <div className="sf-carousel-viewport" ref={viewportRef} tabIndex={0}
      aria-label={`Page ${index + 1} of ${pages.length}. Swipe to navigate. Arrow keys are also supported.${onExpand ? " Press Enter to enlarge." : ""}`}
      onScroll={event => {
        const viewport = event.currentTarget;
        if (!viewport.clientWidth) return;
        const next = clamp(Math.round(viewport.scrollLeft / viewport.clientWidth));
        suppressClick.current = true;
        if (next !== activeIndex.current) {
          activeIndex.current = next;
          changeRef.current(next);
        }
      }}
      onKeyDown={event => {
        if (interactive(event.target)) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); scrollToPage(activeIndex.current - 1); }
        if (event.key === "ArrowRight") { event.preventDefault(); scrollToPage(activeIndex.current + 1); }
        if (event.key === "Home") { event.preventDefault(); scrollToPage(0); }
        if (event.key === "End") { event.preventDefault(); scrollToPage(pages.length - 1); }
        if ((event.key === "Enter" || event.key === " ") && onExpand) { event.preventDefault(); onExpand(); }
      }}
      onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={event => pointerEnd(event)} onPointerCancel={event => pointerEnd(event, true)}
      onLostPointerCapture={event => pointerEnd(event, true)}
      onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) pointerEnd(event, true); }}
      onDragStart={event => event.preventDefault()}
      onClick={event => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (!interactive(event.target)) onExpand?.();
      }}>
      {pages.map((page, position) => <div className={`sf-carousel-page${page.kind === "cover" ? " sf-cover-page" : ""}`} key={`${scope}-${position}`} aria-hidden={position !== index} ref={element => { element?.toggleAttribute("inert", position !== index); }}>
        <PageContent page={page} scope={`${scope}-${position}`} />
      </div>)}
    </div>
    <span className="sf-page-counter" aria-live="polite">{index + 1} / {pages.length}</span>
  </div>;
}

function CoursePost({ item, domains, reactions, onUpdate, onOpen, onCreator, onDomain }: {
  item: FeedCourse;
  domains: string[];
  onDomain: (domain: string) => void;
  reactions: Reactions;
  onUpdate: (update: (previous: Reactions) => Reactions) => void;
  onOpen: (index: number) => void;
  onCreator: () => void;
}) {
  const pages = useMemo(() => coursePages(item), [item]);
  const [index, setIndex] = useState(0);
  const [comment, setComment] = useState("");
  const [showComments, setShowComments] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const creator = creatorName(item);
  const count = item.course.modules.reduce((total, module) => total + (module.slides?.length ?? 0), 0);
  const visibleComments = showComments ? reactions.comments : reactions.comments.slice(-1);
  return <article className="sf-post" aria-label={`Course post: ${item.title}`}>
    <header className="sf-post-header">
      <span className="sf-avatar" aria-hidden="true">{initials(creator)}</span>
      <div className="sf-post-author"><div><button type="button" onClick={onCreator}>{creator}</button><time dateTime={item.updatedAt || undefined}>{displayDate(item.updatedAt)}</time></div><small><Icon name="book" />{item.course.modules.length} modules · {count} slides{item.audience ? ` · ${item.audience}` : ""}</small></div>
      <button type="button" className="sf-expand" onClick={() => onOpen(index)} aria-label={`Enlarge ${item.title}`} title="Enlarge course"><Icon name="expand" /></button>
    </header>
    <Carousel pages={pages} index={Math.min(index, pages.length - 1)} onChange={setIndex} onExpand={() => onOpen(index)} scope={`post-${item.id}`} />
    <div className="sf-post-social">
      <div className="sf-reaction-row">
        <button type="button" className={`sf-reaction${reactions.liked ? " is-liked" : ""}`} aria-label={reactions.liked ? "Unlike course" : "Like course"} aria-pressed={reactions.liked} onClick={() => onUpdate(previous => ({ ...previous, liked: !previous.liked }))}><Icon name="heart" filled={reactions.liked} /><span>{reactions.liked ? 1 : 0}</span></button>
        <button type="button" className="sf-reaction" aria-label="Comment on course" onClick={() => { setShowComments(true); inputRef.current?.focus(); }}><Icon name="comment" /><span>{reactions.comments.length}</span></button>
      </div>
      <p className="sf-like-note" aria-live="polite">{reactions.liked ? "Liked by you" : "Like this course"}</p>
      <p className="sf-caption"><strong>{creator}</strong> {item.description || item.course.description}</p>
      <div className="sf-domain-tags" aria-label="Course domains">{domains.map(name => <button type="button" key={name} onClick={() => onDomain(name)}>{name}</button>)}</div>
      {!!reactions.comments.length && <button className="sf-view-comments" type="button" onClick={() => setShowComments(value => !value)}>{showComments ? "Show fewer comments" : `View all ${reactions.comments.length} ${reactions.comments.length === 1 ? "comment" : "comments"}`}</button>}
      {showComments && !reactions.comments.length && <p className="sf-comment-empty">Start the conversation. What did you learn?</p>}
      <div className="sf-comments" aria-live="polite">{visibleComments.map(entry => <div className="sf-comment" key={entry.id}><span className="sf-comment-avatar" aria-hidden="true">Y</span><div><p><strong>You</strong> {entry.text}</p><time dateTime={entry.createdAt}>{displayDate(entry.createdAt)}</time></div></div>)}</div>
      <form className="sf-comment-form" onSubmit={event => {
        event.preventDefault();
        const text = comment.trim();
        if (!text) return;
        const entry: Comment = { id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: text.slice(0, 1000), createdAt: new Date().toISOString() };
        onUpdate(previous => ({ ...previous, comments: [...previous.comments, entry] }));
        setComment("");
        setShowComments(true);
      }}><span aria-hidden="true"><Icon name="smile" /></span><input ref={inputRef} value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment or ask a question…" aria-label={`Comment on ${item.title}`} maxLength={1000} /><button type="submit" disabled={!comment.trim()}>Post</button></form>
    </div>
  </article>;
}

function ExpandedCourse({ item, initialIndex, onClose }: { item: FeedCourse; initialIndex: number; onClose: () => void }) {
  const pages = useMemo(() => coursePages(item), [item]);
  const [index, setIndex] = useState(Math.min(initialIndex, pages.length - 1));
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = oldOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog className="sf-dialog" ref={dialogRef} aria-label={item.title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sf-expanded">
      <header><div><span className="sf-eyebrow">{creatorName(item)} · COURSE</span><h2>{item.title}</h2></div><button type="button" className="sf-expand" aria-label="Close course" onClick={onClose}><Icon name="close" /></button></header>
      <Carousel pages={pages} index={index} onChange={setIndex} scope={`expanded-${item.id}`} large />
    </div>
  </dialog>;
}

export default function CourseFeed({ courses, loading, error, onRefresh, onCreate, composer }: Props) {
  const [social, setSocial] = useState<SocialState>(readSocial);
  const [storageError, setStorageError] = useState("");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [creator, setCreator] = useState("");
  const [selected, setSelected] = useState<{ id: number; index: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem(SOCIAL_KEY, JSON.stringify(social)); setStorageError(""); }
    catch { setStorageError("Your changes are visible now, but this browser could not save them for your next visit."); }
  }, [social]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === SOCIAL_KEY || event.key === null) setSocial(readSocial()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const domainsById = useMemo(() => new Map(courses.map(item => [item.id, getCourseDomains(item)])), [courses]);
  const domains = useMemo(() => {
    const counts = new Map<string, number>();
    domainsById.forEach(names => names.forEach(name => counts.set(name, (counts.get(name) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [domainsById]);
  const creators = useMemo(() => {
    const result = new Map<string, number>();
    courses.forEach(item => result.set(creatorName(item), (result.get(creatorName(item)) || 0) + 1));
    return [...result].sort((a, b) => b[1] - a[1]);
  }, [courses]);
  const shown = useMemo(() => courses.filter(item =>
    (!domain || domainsById.get(item.id)?.includes(domain)) && (!creator || creatorName(item) === creator) &&
    `${item.title} ${item.description} ${(domainsById.get(item.id) || []).join(" ")} ${creatorName(item)}`.toLowerCase().includes(query.toLowerCase()),
  ).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)), [courses, domain, creator, query, domainsById]);
  const selectedCourse = courses.find(item => item.id === selected?.id);
  return <section className="sf-feed" aria-label="Creator course feed">
    <div className="sf-search-row"><label className="sf-search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search courses, creators, topics…" aria-label="Search courses" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" /></button>}</label></div>
    <div className="sf-layout"><div className="sf-main">
      <div className="sf-topic-row" aria-label="Filter by course domain"><button type="button" className={!domain ? "is-active" : ""} aria-pressed={!domain} onClick={() => setDomain("")}>All Topics</button>{domains.map(([name, count]) => <button key={name} type="button" className={domain === name ? "is-active" : ""} aria-pressed={domain === name} onClick={() => setDomain(name)} title={`${count} ${count === 1 ? "course" : "courses"}`}><span aria-hidden="true"><DomainIcon name={name} /></span>{name}</button>)}</div>
      {creator && <div className="sf-filter-note">Courses by {creator}<button type="button" onClick={() => setCreator("")}>Clear filter ×</button></div>}
      {storageError && <p className="sf-storage-error" role="alert">{storageError}</p>}
      {loading ? <div className="sf-empty" role="status"><span className="sf-loading-dot" />Loading courses…</div> : error ? <div className="sf-empty" role="alert"><h2>Couldn’t load the feed</h2><p>{error}</p><button type="button" onClick={onRefresh}>Try again</button></div> : !shown.length ? <div className="sf-empty"><Icon name="book" /><h2>{query || domain || creator ? "No matching courses" : "A new idea starts here"}</h2><p>{query || domain || creator ? "Try a different search or clear your filters." : "Create and save a course, then explore it in the feed."}</p><button type="button" onClick={() => { if (query || domain || creator) { setQuery(""); setDomain(""); setCreator(""); } else onCreate(); }}>{query || domain || creator ? "Show all courses" : "Create a course"}</button></div> : <div className="sf-posts">{shown.map(item => <CoursePost key={item.id} item={item} domains={domainsById.get(item.id) || []} onDomain={setDomain} reactions={social[item.id] || emptyReactions} onUpdate={update => setSocial(previous => ({ ...previous, [item.id]: update(previous[item.id] || emptyReactions) }))} onOpen={index => setSelected({ id: item.id, index })} onCreator={() => setCreator(creatorName(item))} />)}</div>}
    </div><aside className="sf-side" aria-label="Discover more">
      <section className="sf-side-card sf-discover"><h2>Meet the creators <span>{creators.length}</span></h2>{creators.length ? creators.slice(0, 4).map(([name, count]) => <div className="sf-creator-row" key={name}><span className="sf-avatar" aria-hidden="true">{initials(name)}</span><div><strong>{name}</strong><small>{count} {count === 1 ? "course" : "courses"}</small></div><button type="button" onClick={() => { setCreator(name); setDomain(""); setQuery(""); }}>View</button></div>) : <p className="sf-side-muted">Creators appear here when courses are available.</p>}</section>
      {!!domains.length && <section className="sf-side-card sf-discover"><h2>Explore topics <span aria-hidden="true"><Icon name="right" /></span></h2><div className="sf-domain-list">{domains.map(([name, count]) => <button className="sf-path" key={name} type="button" onClick={() => { setDomain(name); setCreator(""); setQuery(""); }}><span><strong><DomainIcon name={name} /> {name}</strong><small>{count} {count === 1 ? "course" : "courses"} to explore</small></span><Icon name="right" /></button>)}</div></section>}
      {composer && <section className="sf-side-card sf-assistant">{composer}</section>}
      <p className="sf-local-note">Likes and comments are saved in this browser.</p>
    </aside></div>
    {selectedCourse && selected && <ExpandedCourse key={selectedCourse.id} item={selectedCourse} initialIndex={selected.index} onClose={() => setSelected(null)} />}
  </section>;
}
