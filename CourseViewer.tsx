import React from "react";

export type Design = {
  template?: "classic" | "split" | "focus";
  fontFamily?: string; fontSize?: number; titleSize?: number;
  textColor?: string; headingColor?: string; background?: string; accent?: string;
  bold?: boolean; italic?: boolean; underline?: boolean; align?: "left" | "center" | "right";
};
export type TextStyleRange = { start: number; end: number; style: Partial<Pick<Design, "fontFamily" | "fontSize" | "textColor" | "bold" | "italic" | "underline">> };
export type TextStyles = Record<string, TextStyleRange[]>;
export type Slide = { id?: number; title: string; content: string; keyPoints: string[]; example: string; image?: string; imageAlt?: string; imageUrl?: string; imagePrompt?: string; imageRequired?: boolean; imageStatus?: string; design?: Design; textStyles?: TextStyles };
export type Module = { id?: number; title: string; slides: Slide[]; textStyles?: TextStyles };
export type Question = { id?: number; type?: string; moduleIndex?: number; question: string; options: string[]; correctAnswer: string; explanation: string; textStyles?: TextStyles };
export type Theme = { style: string; background: string; surface: string; text: string; accent: string; font: string };
export type Course = { title: string; description: string; learningObjectives: string[]; theme: Theme; overview?: Slide; recap?: Slide; modules: Module[]; assessment: Question[]; assessments?: Question[]; sourceDocumentId?: number | null; coverImage?: string; coverImageAlt?: string; coverImagePrompt?: string; design?: Design; textStyles?: TextStyles };
export const PRESENTATION_FONTS = ["Arial", "Aptos", "Calibri", "Cambria", "Constantia", "Georgia", "Garamond", "Helvetica", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"];
export function getCourseAssessment(course: Course): Question[] {
  return course.assessment?.length ? course.assessment : course.assessments ?? [];
}
export function renderStyledText(text: string, ranges?: TextStyleRange[], highlight?: { start: number; end: number }): React.ReactNode {
  const valid = ranges?.filter(range => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.start < text.length) ?? [];
  const selected = highlight && highlight.start >= 0 && highlight.end > highlight.start && highlight.start < text.length
    ? { start: highlight.start, end: Math.min(highlight.end, text.length) }
    : undefined;
  if (!valid.length && !selected) return text;
  const boundaries = [...new Set([0, text.length, ...valid.flatMap(range => [range.start, Math.min(range.end, text.length)]), ...(selected ? [selected.start, selected.end] : [])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const style = valid.filter(range => range.start <= start && range.end >= end).reduce((merged, range) => ({ ...merged, ...range.style }), {} as TextStyleRange["style"]);
    const css: React.CSSProperties = {};
    if (PRESENTATION_FONTS.includes(style.fontFamily ?? "")) css.fontFamily = style.fontFamily;
    if (style.fontSize) css.fontSize = `${Math.max(12, Math.min(32, style.fontSize))}px`;
    if (/^#[0-9a-f]{6}$/i.test(style.textColor ?? "")) css.color = style.textColor;
    if (style.bold !== undefined) css.fontWeight = style.bold ? 700 : 400;
    if (style.italic !== undefined) css.fontStyle = style.italic ? "italic" : "normal";
    if (style.underline !== undefined) css.textDecoration = style.underline ? "underline" : "none";
    if (selected && selected.start <= start && selected.end >= end) css.backgroundColor = "#cfe3ff";
    const segment = text.slice(start, end);
    return Object.keys(css).length ? <span key={start} style={css}>{segment}</span> : <React.Fragment key={start}>{segment}</React.Fragment>;
  });
}
export function renderStyledLines(lines: string[], ranges?: TextStyleRange[]): React.ReactNode[] {
  let offset = 0;
  return lines.map((line, index) => {
    const lineRanges = ranges?.flatMap(range => {
      const start = Math.max(0, range.start - offset);
      const end = Math.min(line.length, range.end - offset);
      return end > start ? [{ ...range, start, end }] : [];
    });
    const rendered = renderStyledText(line, lineRanges);
    offset += line.length + 1;
    return <li key={`${index}-${line}`}>{rendered}</li>;
  });
}
export function presentationStyle(design?: Design): React.CSSProperties {
  if (!design) return {};
  const color = (value: string | undefined, fallback: string) => /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : fallback;
  return {
    "--edit-font": PRESENTATION_FONTS.includes(design.fontFamily ?? "") ? design.fontFamily : "Arial",
    "--edit-size": `${Math.max(12, Math.min(32, design.fontSize ?? 18))}px`,
    "--edit-title-size": `${Math.max(20, Math.min(56, design.titleSize ?? 32))}px`,
    "--edit-text": color(design.textColor, "#25334d"),
    "--edit-heading": color(design.headingColor, "#172033"),
    "--edit-bg": color(design.background, "#ffffff"),
    "--edit-accent": color(design.accent, "#4f46e5"),
    "--edit-weight": design.bold ? 700 : 400,
    "--edit-italic": design.italic ? "italic" : "normal",
    "--edit-align": ["left", "center", "right"].includes(design.align ?? "") ? design.align : "left",
  } as React.CSSProperties;
}
type Page = { kind: "slide"; sectionIndex: number; slideIndex: number; slide: Slide } | { kind: "quiz"; moduleIndex: number; questionIndex: number };
type Props = { course: Course; onSave?: () => void; onBack?: () => void; isSaving?: boolean; initialPage?: number };
function correctOptionIndex(question: Question): number {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  const answer = normalize(question.correctAnswer);
  const exact = question.options.findIndex((option) => normalize(option) === answer);
  if (exact >= 0) return exact;
  const withoutLabel = (text: string) => normalize(text).replace(/^[a-z][.)]\s*/, "");
  const byText = question.options.findIndex((option) => withoutLabel(option) === withoutLabel(question.correctAnswer));
  if (byText >= 0) return byText;
  const label = answer.match(/^(?:option\s+)?([a-z])[.)]?$/);
  if (label) {
    const index = label[1].charCodeAt(0) - 97;
    return index < question.options.length ? index : -1;
  }
  return -1;
}

export default function CourseViewer({ course, onSave, onBack, isSaving = false, initialPage = 0 }: Props) {
  // Optional bookends allow older saved courses to remain readable.
  const modules = course.modules ?? [];
  const questions = getCourseAssessment(course);
  const sections = [
    ...(course.overview ? [{ title: "Course overview", slides: [course.overview], kind: "overview" as const }] : []),
    ...modules.map((item, index) => ({ ...item, kind: "module" as const, moduleNumber: index + 1, moduleIndex: index })),
    ...(course.recap ? [{ title: "Course recap", slides: [course.recap], kind: "recap" as const }] : []),
  ];
  const hasModuleAssignments = questions.some((question) => Number.isInteger(question.moduleIndex));
  const questionsByModule = modules.map((_, moduleIndex) => {
    if (hasModuleAssignments) {
      return questions.flatMap((question, questionIndex) =>
        question.moduleIndex === moduleIndex + 1 ? [questionIndex] : [],
      );
    }
    const baseCount = Math.floor(questions.length / modules.length);
    const remainder = questions.length % modules.length;
    const count = baseCount + (moduleIndex < remainder ? 1 : 0);
    const start = moduleIndex * baseCount + Math.min(moduleIndex, remainder);
    return Array.from({ length: count }, (_, index) => start + index);
  });
  const moduleSectionIndexes = modules.map((_, moduleIndex) => sections.findIndex(
    (section) => section.kind === "module" && "moduleIndex" in section && section.moduleIndex === moduleIndex,
  ));
  const pages: Page[] = [];
  sections.forEach((section, sectionIndex) => {
    (section.slides ?? []).forEach((slide, slideIndex) => {
      pages.push({ kind: "slide", sectionIndex, slideIndex, slide });
    });
    if (section.kind === "module" && "moduleIndex" in section) {
      questionsByModule[section.moduleIndex]?.forEach((questionIndex) => {
        pages.push({ kind: "quiz", moduleIndex: section.moduleIndex, questionIndex });
      });
    }
  });
  const [pageIndex, setPageIndex] = React.useState(initialPage);
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  React.useEffect(() => { setPageIndex(initialPage); setAnswers({}); }, [initialPage]);
  React.useEffect(() => { setAnswers({}); }, [course.assessment]);
  const currentIndex = Math.min(pageIndex, pages.length - 1);
  const page = pages[currentIndex];
  const showQuiz = page?.kind === "quiz";
  const activeSectionIndex = page?.kind === "quiz"
    ? moduleSectionIndexes[page.moduleIndex]
    : page?.kind === "slide" ? page.sectionIndex : 0;
  const module = sections[activeSectionIndex];
  const slideIndex = page?.kind === "slide" ? page.slideIndex : 0;
  const slide = page?.kind === "slide" ? page.slide : undefined;
  const design = course.design || slide?.design ? { ...course.design, ...slide?.design } : undefined;
  const slideImageUrl = slide?.imageUrl || slide?.image;
  const totalSlides = pages.filter((item) => item.kind === "slide").length;
  const slideNumber = pages.slice(0, currentIndex + 1).filter((item) => item.kind === "slide").length;
  const progress = pages.length ? Math.round((currentIndex + 1) / pages.length * 100) : 0;
  const quizQuestion = page?.kind === "quiz" ? questions[page.questionIndex] : undefined;
  const quizQuestionIndexes = page?.kind === "quiz" ? questionsByModule[page.moduleIndex] ?? [] : [];
  const quizPosition = page?.kind === "quiz" ? quizQuestionIndexes.indexOf(page.questionIndex) : 0;
  const quizAnswer = page?.kind === "quiz" ? answers[page.questionIndex] : undefined;
  const quizCorrectIndex = quizQuestion ? correctOptionIndex(quizQuestion) : -1;
  const quizAnsweredCorrectly = quizAnswer !== undefined && quizAnswer === quizCorrectIndex;
  const accent = /^#[0-9a-f]{6}$/i.test(course.theme?.accent ?? "") ? course.theme.accent : "#4f46e5";
  const sectionLabel = module?.kind === "module" && "moduleNumber" in module
    ? `MODULE ${String(module.moduleNumber).padStart(2, "0")}`
    : module?.title ?? "Assessment";

  function openModule(index: number) {
    const target = pages.findIndex((item) => item.kind === "slide" && item.sectionIndex === index);
    if (target >= 0) setPageIndex(target);
  }
  function openSlide(index: number) {
    const target = pages.findIndex((item) => item.kind === "slide" && item.sectionIndex === activeSectionIndex && item.slideIndex === index);
    if (target >= 0) setPageIndex(target);
  }
  function openQuiz(moduleIndex: number) {
    const target = pages.findIndex((item) => item.kind === "quiz" && item.moduleIndex === moduleIndex);
    if (target >= 0) setPageIndex(target);
  }
  function goNext() { setPageIndex((index) => Math.min(index + 1, pages.length - 1)); }
  function goPrevious() { setPageIndex((index) => Math.max(0, index - 1)); }
  if (!page || (page.kind === "slide" && (!module || !slide)) || (page.kind === "quiz" && !quizQuestion)) return <div className="course-viewer course-empty">Course content is unavailable.</div>;

  return <div className="course-viewer" style={{ "--course-accent": accent } as React.CSSProperties}>
    <div className="course-studio-bar"><span> Generated course</span><span>{modules.length} modules · {totalSlides} slides</span></div>
    <header className="course-player-header">
      <div className="course-player-intro"><div className="course-eyebrow">✦ &nbsp; AURA COURSE STUDIO</div><h1 style={course.design?.headingColor ? { color: course.design.headingColor } : undefined}>{renderStyledText(course.title, course.textStyles?.title)}</h1><p>{renderStyledText(course.description, course.textStyles?.description)}
        {course.coverImage && (
    <img
      key={course.coverImage}
      src={course.coverImage}
      alt={course.coverImageAlt || `${course.title} cover`}
      style={{ display: "block", width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 12, marginTop: 16 }}
      onError={(event) => { event.currentTarget.style.display = "none"; }}
    />)}</p></div>
      <div className="course-player-actions">
        {onBack && <button type="button" className="course-nav-button secondary" onClick={onBack}>← My Courses</button>}
        {onSave && <button type="button" className="course-nav-button" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save course"}</button>}
      </div>
    </header>
    {page.kind === "slide" && module && slide ? <div className="course-player-layout">
      <aside className="course-sidebar" aria-label="Course modules">
        <div className="course-sidebar-heading"><div><span className="course-eyebrow">YOUR LEARNING PATH</span><h2>Course modules</h2></div><span className="course-module-total">{modules.length}</span></div>
        <div className="course-module-list">{sections.map((item, index) => <React.Fragment key={`${index}-${item.title}`}><button type="button" className={`course-module${index === activeSectionIndex ? " active" : ""}`} onClick={() => openModule(index)} aria-current={index === activeSectionIndex ? "step" : undefined}>
          <span className="course-module-index">{item.kind === "module" && "moduleNumber" in item ? String(item.moduleNumber).padStart(2, "0") : "•"}</span><span className="course-module-copy"><strong>{renderStyledText(item.title, item.kind === "module" ? item.textStyles?.moduleTitle : undefined)}</strong><small>{item.slides?.length ?? 0} slides{item.kind === "module" && "moduleIndex" in item && (questionsByModule[item.moduleIndex]?.length ?? 0) > 0 ? ` · ${questionsByModule[item.moduleIndex].length} quiz questions` : ""}</small></span><span className="course-module-arrow" aria-hidden="true">›</span>
        </button>{item.kind === "module" && "moduleIndex" in item && (questionsByModule[item.moduleIndex]?.length ?? 0) > 0 && <button type="button" className="course-module-quiz" onClick={() => openQuiz(item.moduleIndex)}>Take module quiz <span aria-hidden="true">›</span></button>}</React.Fragment>)}</div>
        <p className="course-sidebar-note">✦ &nbsp; Built from your source. Move through the slides at your own pace.</p>
      </aside>
      <main className="course-slide-area">
        <div className="course-stage-toolbar"><div><span className="course-eyebrow">NOW VIEWING</span><h2>{renderStyledText(module.title, module.kind === "module" ? module.textStyles?.moduleTitle : undefined)}</h2></div><span className="course-stage-counter">Slide {slideNumber} / {totalSlides}</span></div>
        <div className="course-progress-track" role="progressbar" aria-label="Course progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
        <article className="course-feed-card" aria-live="polite">
          <div className="course-feed-author"><span className="course-feed-avatar" aria-hidden="true">A</span><div><strong>AURA Studio</strong><small>{module.title} · Slide {slideIndex + 1} of {module.slides.length}</small></div><span className="course-feed-source">From your source</span></div>
          <div key={currentIndex} className={`course-slide-card${design ? " edit-presentation" : ""}`} data-template={design?.template} style={presentationStyle(design)}><div className="course-slide-topline"><span className="course-slide-number">{sectionLabel}</span><span className="course-slide-count">{String(slideIndex + 1).padStart(2, "0")} / {String(module.slides.length).padStart(2, "0")}</span></div>
                <div className="course-slide-main"><h3>{renderStyledText(slide.title, slide.textStyles?.title)}</h3><div className="course-slide-body">
              <p className="course-slide-content">{renderStyledText(slide.content, slide.textStyles?.content)}</p>

    {slideImageUrl && (
      <img
        className="course-slide-image"
        key={slideImageUrl}
        src={slideImageUrl}
        alt={slide.imageAlt || `Illustration for ${slide.title}`}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    )}
    </div>

              {slide.keyPoints?.length > 0 && <section className="course-key-points"><h4>Key takeaways</h4><ul>{renderStyledLines(slide.keyPoints, slide.textStyles?.keyPoints)}</ul></section>}
              {slide.example && <section className="course-example"><span>✦</span><div><strong>From the material</strong><p>{renderStyledText(slide.example, slide.textStyles?.example)}</p></div></section>}
            </div><div className="course-slide-footer"><span>Explore one idea at a time</span><span className="course-slide-dots" aria-hidden="true">{module.slides.map((_, index) => <i key={index} className={index === slideIndex ? "active" : ""} />)}</span></div>
          </div><div className="course-feed-actions"><span>✦ &nbsp; Learn · Reflect · Continue</span><span>{Math.round((slideIndex + 1) / module.slides.length * 100)}% of this section</span></div>
        </article>
        <div className="course-sequence-header"><div><span className="course-eyebrow">{module.kind === "module" ? "THIS MODULE" : "COURSE SUMMARY"}</span><h3>Slide sequence</h3></div><span>{module.slides.length} slides</span></div>
        <div className="course-slide-sequence" aria-label="Choose a slide">{module.slides.map((item, index) => <button key={`${index}-${item.title}`} type="button" className={`course-sequence-item${index === slideIndex ? " active" : ""}`} onClick={() => openSlide(index)} aria-current={index === slideIndex ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong></button>)}{module.kind === "module" && "moduleIndex" in module && (questionsByModule[module.moduleIndex]?.length ?? 0) > 0 && <button type="button" className="course-sequence-item course-sequence-quiz" onClick={() => openQuiz(module.moduleIndex)}><span>QUIZ</span><strong>Module quiz · {questionsByModule[module.moduleIndex].length} questions</strong></button>}</div>
        <div className="course-navigation">
          <button type="button" className="course-nav-button secondary" onClick={goPrevious} disabled={currentIndex === 0}>← Previous</button>
          {currentIndex < pages.length - 1
            ? <button type="button" className="course-nav-button" onClick={goNext}>{pages[currentIndex + 1]?.kind === "quiz" ? "Answer module quiz →" : "Next slide →"}</button>
            : <button type="button" className="course-nav-button" onClick={() => setPageIndex(0)}>Review course ↺</button>}
        </div>
      </main>
    </div> : showQuiz && page.kind === "quiz" && quizQuestion ? <main className={`course-assessment${course.design ? " edit-presentation" : ""}`} style={presentationStyle(course.design)}>
      <div className="course-assessment-header">
        <span className="course-eyebrow">MODULE {String(page.moduleIndex + 1).padStart(2, "0")} · QUICK CHECK</span>
        <h2>{modules[page.moduleIndex]?.title}</h2>
        <p>Question {quizPosition + 1} of {quizQuestionIndexes.length} · {quizQuestionIndexes.filter((questionIndex) => answers[questionIndex] !== undefined && answers[questionIndex] === correctOptionIndex(questions[questionIndex])).length} answered</p>
      </div>
      <div className="assessment-grid"><article className="assessment-card">
        <span className="course-slide-number">QUESTION {String(quizPosition + 1).padStart(2, "0")}</span>
        <h3 id={`question-title-${page.questionIndex}`}>{quizQuestion.question}</h3>
        <div className="assessment-options" role="radiogroup" aria-labelledby={`question-title-${page.questionIndex}`}>
          {quizQuestion.options.map((option, optionIndex) => {
            const highlight = quizAnswer !== undefined && (optionIndex === quizCorrectIndex || optionIndex === quizAnswer);
            const right = optionIndex === quizCorrectIndex;
            return <label key={`${optionIndex}-${option}`} style={highlight ? {
              border: `1px solid ${right ? "#15803d" : "#b91c1c"}`,
              background: right ? "#f0fdf4" : "#fef2f2",
              color: right ? "#166534" : "#991b1b",
            } : undefined}>
              <input type="radio" name={`question-${page.questionIndex}`} value={optionIndex}
                checked={quizAnswer === optionIndex} disabled={quizAnswer !== undefined}
                onChange={() => setAnswers((previous) => ({ ...previous, [page.questionIndex]: optionIndex }))} />
              <span>{option}</span>
            </label>;
          })}
        </div>
        {quizAnswer !== undefined && <div role="status" aria-live="polite" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: quizAnsweredCorrectly ? "#f0fdf4" : "#fef2f2", color: quizAnsweredCorrectly ? "#166534" : "#991b1b" }}>
          <strong>{quizAnsweredCorrectly ? "✓ Correct!" : "✕ Not quite."}</strong>
          <p><strong>Correct answer:</strong> {quizCorrectIndex >= 0 ? quizQuestion.options[quizCorrectIndex] : quizQuestion.correctAnswer}</p>
          {quizQuestion.explanation && <p>{quizQuestion.explanation}</p>}
        </div>}
      </article></div>
      <div className="course-navigation">
        <button type="button" className="course-nav-button secondary" onClick={goPrevious} disabled={currentIndex === 0}>← Back to lesson</button>
        <button type="button" className="course-nav-button" onClick={goNext}>
          {quizPosition < quizQuestionIndexes.length - 1 ? "Next question →" : page.moduleIndex < modules.length - 1 ? `Continue to Module ${String(page.moduleIndex + 2).padStart(2, "0")} →` : course.recap ? "View course recap →" : "Finish course →"}
        </button>
      </div>
    </main> : null}
  </div>;
}
