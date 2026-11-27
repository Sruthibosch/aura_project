import React from "react";
import CourseViewer, { getCourseAssessment, PRESENTATION_FONTS, renderStyledText, type Course, type Design, type Slide, type Question, type TextStyleRange } from "./CourseViewer";

export const EDITOR_DRAFT_KEY = "aura.course-editor.draft.v1";
type Target = { kind: "course" } | { kind: "slide"; module: number; slide: number } | { kind: "question"; question: number };
type Props = { course: Course; documentId: number | null; apiBase: string; onChange: (course: Course) => void; onPublish: () => void; isPublishing: boolean; publishError?: string; publishLabel?: string; onBack?: () => void };
type Suggestion = { kind: "text"; content: Record<string, unknown> } | { kind: "image"; imageUrl: string; imageAlt: string; prompt: string };
const defaultDesign: Design = { template: "classic", fontFamily: "Arial", fontSize: 18, titleSize: 32, textColor: "#25334d", headingColor: "#172033", background: "#ffffff", accent: "#4f46e5", align: "left" };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function readTarget(course: Course, target: Target): Course | Slide | Question {
  if (target.kind === "course") return course;
  if (target.kind === "question") return getCourseAssessment(course)[target.question];
  if (target.module === -1) return course.overview!;
  if (target.module === -2) return course.recap!;
  return course.modules[target.module].slides[target.slide];
}
function writeTarget(course: Course, target: Target, patch: object): Course {
  const next = clone(course);
  if (target.kind === "question" && !next.assessment?.length) next.assessment = next.assessments ?? [];
  Object.assign(readTarget(next, target), patch);
  return next;
}
function publishProblem(course: Course): string {
  if (!course.title.trim() || !course.description.trim()) return "Add a course title and description before publishing.";
  const slides = [...(course.overview ? [course.overview] : []), ...course.modules.flatMap(module => module.slides), ...(course.recap ? [course.recap] : [])];
  if (course.modules.some(module => !module.title.trim()) || slides.some(slide => !slide.title.trim() || !slide.content.trim())) return "Every module needs a title, and every slide needs a title and content.";
  if (getCourseAssessment(course).some(question => !question.question.trim() || question.options.length !== 4 || question.options.some(option => !option.trim()) || new Set(question.options.map(option => option.trim().toLowerCase())).size !== 4 || !question.options.includes(question.correctAnswer))) return "Check the assessment: each question needs four distinct options and a matching correct answer.";
  return "";
}
function updateTextRanges(ranges: TextStyleRange[], start: number, end: number, patch: TextStyleRange["style"], textLength: number): TextStyleRange[] {
  const valid = ranges.filter(range => range.start >= 0 && range.end > range.start && range.start < textLength);
  const boundaries = [...new Set([0, textLength, start, end, ...valid.flatMap(range => [range.start, Math.min(range.end, textLength)])])].sort((a, b) => a - b);
  const result: TextStyleRange[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const segmentStart = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    if (segmentEnd <= segmentStart) continue;
    const style = valid.filter(range => range.start <= segmentStart && range.end >= segmentEnd).reduce((merged, range) => ({ ...merged, ...range.style }), {} as TextStyleRange["style"]);
    const nextStyle = segmentStart < end && segmentEnd > start ? { ...style, ...patch } : style;
    if (!Object.keys(nextStyle).length) continue;
    const previous = result[result.length - 1];
    if (previous && previous.end === segmentStart && JSON.stringify(previous.style) === JSON.stringify(nextStyle)) previous.end = segmentEnd;
    else result.push({ start: segmentStart, end: segmentEnd, style: nextStyle });
  }
  return result;
}

export default function CourseEditor({ course, documentId, apiBase, onChange, onPublish, isPublishing, publishError, publishLabel = "Save to Creator Studio", onBack }: Props) {
  const [target, setTarget] = React.useState<Target>({ kind: "course" });
  const [mode, setMode] = React.useState<"edit" | "preview">("preview");
  const [draggingSlide, setDraggingSlide] = React.useState<{ module: number; slide: number } | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ module: number; slide: number } | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [draftStatus, setDraftStatus] = React.useState("");
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [past, setPast] = React.useState<Course[]>([]);
  const [future, setFuture] = React.useState<Course[]>([]);
  const [scope, setScope] = React.useState<"course" | "slide" | "selection">("course");
  const [selection, setSelection] = React.useState<{ key: string; start: number; end: number } | null>(null);
  const activeTextEditor = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const pending = React.useRef<AbortController | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const current = readTarget(course, target);
  const locked = !!busy || isPublishing;
  const slide = target.kind === "slide" ? current as Slide : null;
  const question = target.kind === "question" ? current as Question : null;
  const design = { ...defaultDesign, ...course.design, ...(scope === "slide" && slide ? slide.design : {}) };
  const targetLabel = target.kind === "course" ? "Course details & cover" : target.kind === "question" ? `Question ${target.question + 1}` : slide?.title ?? "Slide";
  const toolbarDesign = { ...design, ...selectedFormatting() };
  const problem = publishProblem(course);
  React.useEffect(() => () => pending.current?.abort(), []);
  React.useEffect(() => {
    if (isPublishing) return;
    setDraftStatus("Saving draft…");
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({ course, documentId, savedAt: new Date().toISOString() }));
        setDraftStatus("Draft saved on this browser · Not published");
      } catch { setDraftStatus("Browser draft could not be saved. Keep this page open until you publish."); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [course, documentId, isPublishing]);
  function commit(next: Course) {
    setPast(items => [...items.slice(-39), clone(course)]); setFuture([]);
    setSuggestion(null); setError(""); onChange(next);
  }
  function edit(patch: object) { commit(writeTarget(course, target, patch)); }
  function choose(next: Target) { if (locked) return; setTarget(next); setSuggestion(null); setError(""); setPrompt(""); }
  function reorderSlide(moduleIndex: number, fromIndex: number, toIndex: number) {
    if (locked || fromIndex === toIndex) return;
    const next = clone(course);
    const slides = next.modules[moduleIndex].slides;
    const [moved] = slides.splice(fromIndex, 1);
    slides.splice(toIndex, 0, moved);
    commit(next);
    setTarget(currentTarget => {
      if (currentTarget.kind !== "slide" || currentTarget.module !== moduleIndex) return currentTarget;
      let slideIndex = currentTarget.slide;
      if (slideIndex === fromIndex) slideIndex = toIndex;
      else if (fromIndex < toIndex && slideIndex > fromIndex && slideIndex <= toIndex) slideIndex--;
      else if (fromIndex > toIndex && slideIndex >= toIndex && slideIndex < fromIndex) slideIndex++;
      return { ...currentTarget, slide: slideIndex };
    });
    setDraggingSlide(null);
    setDropTarget(null);
  }
  function changeDesign(patch: Partial<Design>) {
    if (scope === "slide" && slide) edit({ design: { ...slide.design, ...patch } });
    else commit({ ...course, design: { ...defaultDesign, ...course.design, ...patch } });
  }
  function getTextRanges(key: string): TextStyleRange[] {
    if (key === "moduleTitle" && target.kind === "slide" && target.module >= 0) return course.modules[target.module].textStyles?.[key] ?? [];
    return "textStyles" in current ? current.textStyles?.[key] ?? [] : [];
  }
  function selectedTextValue(key: string): string {
    if (key === "moduleTitle" && target.kind === "slide" && target.module >= 0) return course.modules[target.module].title;
    const value = (current as unknown as Record<string, unknown>)[key];
    return Array.isArray(value) ? value.join("\n") : String(value ?? "");
  }
  function captureSelection(key: string, element: HTMLInputElement | HTMLTextAreaElement) {
    activeTextEditor.current = element;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    if (end > start) { setSelection({ key, start, end }); setScope("selection"); }
    else { setSelection(null); if (scope === "selection") setScope(slide ? "slide" : "course"); }
  }
  function restoreTextSelection(start: number, end: number) {
    const element = activeTextEditor.current;
    if (!element) return;
    window.requestAnimationFrame(() => {
      if (!element.isConnected) return;
      element.focus({ preventScroll: true });
      element.setSelectionRange(start, end);
    });
  }
  function changeFormatting(patch: Partial<Design>) {
    if (scope !== "selection" || !selection) { changeDesign(patch); return; }
    const { start, end } = selection;
    const text = selectedTextValue(selection.key);
    const ranges = updateTextRanges(getTextRanges(selection.key), selection.start, selection.end, patch, text.length);
    if (selection.key === "moduleTitle" && target.kind === "slide" && target.module >= 0) {
      const next = clone(course);
      const module = next.modules[target.module];
      module.textStyles = { ...module.textStyles, [selection.key]: ranges };
      commit(next);
    } else edit({ textStyles: { ...("textStyles" in current ? current.textStyles : {}), [selection.key]: ranges } });
    restoreTextSelection(start, end);
  }
  function selectedFormatting(): Partial<Design> {
    if (!selection || scope !== "selection") return {};
    return getTextRanges(selection.key).filter(range => range.start < selection.end && range.end > selection.start).reduce((merged, range) => ({ ...merged, ...range.style }), {} as Partial<Design>);
  }
  function editTextField(key: string, value: string) {
    if (key === "moduleTitle" && target.kind === "slide" && target.module >= 0) {
      const next = clone(course);
      next.modules[target.module].title = value;
      next.modules[target.module].textStyles = { ...next.modules[target.module].textStyles, [key]: [] };
      commit(next);
    } else {
      const textStyles = { ...("textStyles" in current ? current.textStyles : {}), [key]: [] };
      edit({ [key]: value, textStyles });
    }
    setSelection(null);
    if (scope === "selection") setScope(slide ? "slide" : "course");
  }
  function editLinesField(key: string, value: string[]) {
    edit({ [key]: value, textStyles: { ...("textStyles" in current ? current.textStyles : {}), [key]: [] } });
    setSelection(null);
    if (scope === "selection") setScope(slide ? "slide" : "course");
  }
  function undo() {
    const previous = past[past.length - 1]; if (!previous) return;
    setPast(items => items.slice(0, -1)); setFuture(items => [clone(course), ...items]); setSuggestion(null); onChange(previous);
  }
  function redo() {
    const next = future[0]; if (!next) return;
    setFuture(items => items.slice(1)); setPast(items => [...items, clone(course)]); setSuggestion(null); onChange(next);
  }
  async function request(path: string, body: object | FormData, label: string) {
    if (pending.current || isPublishing) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(label); setError(""); setSuggestion(null);
    try {
      const response = await fetch(`${apiBase}${path}`, { method: "POST", signal: controller.signal,
        ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const payload = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
      if (!response.ok) throw new Error(payload.error || "Unable to complete this edit.");
      if (!controller.signal.aborted) {
        if (path.endsWith("/rewrite")) setSuggestion({ kind: "text", content: payload.content });
        else setSuggestion({ kind: "image", imageUrl: payload.imageUrl, imageAlt: payload.imageAlt || "", prompt });
      }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Edit failed."); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(""); } }
  }
  function rewrite(action: "rewrite" | "regenerate") {
    if (!documentId) { setError("The original source is required for AI text edits. Generate a course from a source first."); return; }
    const content = target.kind === "course" ? { title: course.title, description: course.description, learningObjectives: course.learningObjectives }
      : target.kind === "slide" ? { title: slide!.title, content: slide!.content, keyPoints: slide!.keyPoints, example: slide!.example } : question;
    void request("/api/course/editor/rewrite", { documentId, kind: target.kind, content, prompt, action }, "Writing a suggestion…");
  }
  function applySuggestion() {
    if (!suggestion) return;
    if (suggestion.kind === "text") edit(suggestion.content);
    else if (target.kind === "course") edit({ coverImage: suggestion.imageUrl, coverImageAlt: suggestion.imageAlt, coverImagePrompt: suggestion.prompt });
    else edit({ imageUrl: suggestion.imageUrl, image: "", imageAlt: suggestion.imageAlt, imagePrompt: suggestion.prompt, imageRequired: true, imageStatus: "ready" });
  }
  function styledTextControl(key: string, value: string, multiline: boolean, onChange: (value: string) => void, allowSelection = true) {
    const fieldDesign = { ...defaultDesign, ...course.design, ...(slide?.design ?? {}) };
    const fieldTextColor = fieldDesign.textColor ?? "#25334d";
    const fieldStyle: React.CSSProperties & { "--ce-rich-text-color": string } = {
      fontFamily: fieldDesign.fontFamily,
      fontSize: `${fieldDesign.fontSize}px`,
      color: fieldTextColor,
      "--ce-rich-text-color": fieldTextColor,
      fontWeight: fieldDesign.bold ? 700 : 400,
      fontStyle: fieldDesign.italic ? "italic" : "normal",
      textAlign: fieldDesign.align,
    };
    const shared = {
      value,
      style: fieldStyle,
      onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { activeTextEditor.current = event.currentTarget; },
      onSelect: allowSelection ? (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => captureSelection(key, event.currentTarget) : undefined,
      onScroll: (event: React.UIEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const preview = event.currentTarget.previousElementSibling as HTMLElement | null;
        if (preview) { preview.scrollTop = event.currentTarget.scrollTop; preview.scrollLeft = event.currentTarget.scrollLeft; }
      },
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    };
    const activeRange = selection?.key === key ? selection : undefined;
    return <span className="ce-rich-field">
      <span className={`ce-rich-preview${multiline ? " multiline" : ""}`} style={fieldStyle} aria-hidden="true">{renderStyledText(value, getTextRanges(key), activeRange)}</span>
      {multiline ? <textarea rows={4} {...shared} /> : <input {...shared} />}
    </span>;
  }
  function textField(label: string, key: string, value: string, multiline = false) {
    return <label className="ce-field" key={key}><span>{label}</span>{styledTextControl(key, value, multiline, next => editTextField(key, next))}</label>;
  }
  function linesField(label: string, key: string, value: string[]) {
    return <label className="ce-field"><span>{label} <small>one per line</small></span>{styledTextControl(key, value.join("\n"), true, next => editLinesField(key, next.split("\n")), key === "keyPoints")}</label>;
  }
  const imageUrl = target.kind === "course" ? course.coverImage : slide?.imageUrl || slide?.image;
  const assessment = getCourseAssessment(course);
  const hasModuleAssignments = assessment.some(question => Number.isInteger(question.moduleIndex));
  const questionIndexesByModule = course.modules.map((_, moduleIndex) => {
    if (hasModuleAssignments) return assessment.flatMap((question, index) => question.moduleIndex === moduleIndex + 1 ? [index] : []);
    const baseCount = Math.floor(assessment.length / course.modules.length);
    const remainder = assessment.length % course.modules.length;
    const count = baseCount + (moduleIndex < remainder ? 1 : 0);
    const start = moduleIndex * baseCount + Math.min(moduleIndex, remainder);
    return Array.from({ length: count }, (_, index) => start + index);
  });
  const modulePageStart = (moduleIndex: number) => (course.overview ? 1 : 0) + course.modules.slice(0, moduleIndex).reduce((total, module, index) => total + module.slides.length + questionIndexesByModule[index].length, 0);
  const questionModuleIndex = target.kind === "question" ? questionIndexesByModule.findIndex(indexes => indexes.includes(target.question)) : -1;
  const initialPage = target.kind === "slide"
    ? target.module === -1 ? 0 : target.module === -2 ? modulePageStart(course.modules.length) : modulePageStart(target.module) + target.slide
    : target.kind === "question" && questionModuleIndex >= 0
      ? modulePageStart(questionModuleIndex) + course.modules[questionModuleIndex].slides.length + questionIndexesByModule[questionModuleIndex].indexOf(target.question)
      : 0;
  return <section className="ce-editor">
    <header className="ce-header"><div><span className="ce-kicker">AURA · EDITING STUDIO</span><h1>Make it yours.</h1><p>{draftStatus || "Review and edit your course before publishing."}</p></div>
      <div className="ce-actions">{onBack && <button disabled={locked} onClick={onBack}>Back to drafts</button>}<button disabled={locked || !past.length} onClick={undo} title="Undo">Undo</button><button disabled={locked || !future.length} onClick={redo} title="Redo">Redo</button><div className="ce-mode-switch" role="group" aria-label="Course editor view"><button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>Preview</button><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit</button></div><button className="ce-primary" disabled={locked || !!suggestion || !!problem} title={problem || (suggestion ? "Accept or discard the suggestion first" : publishLabel)} onClick={onPublish}>{isPublishing ? "Saving…" : publishLabel}</button></div>
    </header>
    {(error || publishError || problem) && <p className="ce-alert" role="alert">{error || publishError || problem}</p>}
    {mode === "preview" ? <CourseViewer course={course} initialPage={initialPage} /> : <div className="ce-workspace">
      <nav className="ce-outline" aria-label="Edit course section"><button disabled={locked} className={target.kind === "course" ? "active" : ""} onClick={() => choose({ kind: "course" })}>Course details & cover</button>
        {course.overview && <button disabled={locked} onClick={() => choose({ kind: "slide", module: -1, slide: 0 })}>Course overview</button>}
        {course.modules.map((module, mi) => <div key={mi}><h3>{String(mi + 1).padStart(2, "0")} · {module.title}</h3>{module.slides.map((item, si) => <div key={`${item.id ?? item.title}-${si}`} className={`ce-outline-slide${draggingSlide?.module === mi && draggingSlide.slide === si ? " dragging" : ""}${dropTarget?.module === mi && dropTarget.slide === si ? " drop-target" : ""}`} draggable={!locked} title="Drag to reorder slides" onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(si)); setDraggingSlide({ module: mi, slide: si }); }} onDragOver={event => { if (draggingSlide?.module === mi) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget({ module: mi, slide: si }); } }} onDrop={event => { event.preventDefault(); if (draggingSlide?.module === mi) reorderSlide(mi, draggingSlide.slide, si); }} onDragEnd={() => { setDraggingSlide(null); setDropTarget(null); }}><button disabled={locked} className={target.kind === "slide" && target.module === mi && target.slide === si ? "active" : ""} onClick={() => choose({ kind: "slide", module: mi, slide: si })}>{si + 1}. {item.title}</button></div>)}</div>)}
        {course.recap && <button disabled={locked} onClick={() => choose({ kind: "slide", module: -2, slide: 0 })}>Course recap</button>}
        <h3>Assessment</h3>{assessment.map((_, qi) => <button disabled={locked} key={qi} onClick={() => choose({ kind: "question", question: qi })}>Question {qi + 1}</button>)}
      </nav>
      <div className="ce-content"><h2>{targetLabel}</h2><div className="ce-rich-toolbar" role="toolbar" aria-label="Presentation formatting"><label><span>Apply to</span><select value={scope === "selection" && selection ? "selection" : slide ? scope : "course"} onChange={event => setScope(event.target.value as "course" | "slide" | "selection")}><option value="course">Course</option>{slide && <option value="slide">Selected card</option>}{selection && <option value="selection">Selected text</option>}</select></label><button type="button" className={toolbarDesign.bold ? "active" : ""} title="Bold" aria-label="Toggle bold" onMouseDown={event => event.preventDefault()} onClick={() => changeFormatting({ bold: !toolbarDesign.bold })}><strong>B</strong></button><button type="button" className={toolbarDesign.italic ? "active" : ""} title="Italic" aria-label="Toggle italic" onMouseDown={event => event.preventDefault()} onClick={() => changeFormatting({ italic: !toolbarDesign.italic })}><em>I</em></button><label><span>Font</span><select aria-label="Font family" value={toolbarDesign.fontFamily} onChange={event => changeFormatting({ fontFamily: event.target.value })}>{PRESENTATION_FONTS.map(font => <option key={font}>{font}</option>)}</select></label><label><span>Size</span><select aria-label="Body text size" value={toolbarDesign.fontSize} onChange={event => changeFormatting({ fontSize: Number(event.target.value) })}>{[14, 16, 18, 20, 24, 28, 32].map(size => <option key={size} value={size}>{size}px</option>)}</select></label><label className="ce-toolbar-color"><span>Text color</span><input aria-label="Text color" type="color" value={toolbarDesign.textColor} onChange={event => changeFormatting({ textColor: event.target.value })} /></label><label><span>Align</span><select aria-label="Text alignment" value={design.align} onChange={event => changeDesign({ align: event.target.value as Design["align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><fieldset disabled={locked} className="ce-fields">
        <label className="ce-field"><span>Heading color</span><input aria-label="Heading color" type="color" value={design.headingColor} disabled={scope === "selection"} onChange={event => changeDesign({ headingColor: event.target.value })} /></label>
        {target.kind === "course" && <>{textField("Course title", "title", course.title)}{textField("Description", "description", course.description, true)}{linesField("Learning objectives", "learningObjectives", course.learningObjectives)}</>}
        {slide && <>{target.kind === "slide" && target.module >= 0 && textField("Module title", "moduleTitle", course.modules[target.module].title)}{textField("Slide title", "title", slide.title)}{textField("Content", "content", slide.content, true)}{linesField("Key points", "keyPoints", slide.keyPoints)}{textField("Example", "example", slide.example, true)}</>}
        {question && <>{textField("Question", "question", question.question, true)}{question.options.map((option, index) => <label className="ce-field" key={index}><span>Option {index + 1}</span><input value={option} onChange={event => { const options = [...question.options]; options[index] = event.target.value; edit({ options, correctAnswer: question.correctAnswer === option ? event.target.value : question.correctAnswer }); }} /></label>)}<label className="ce-field"><span>Correct answer</span><select value={question.correctAnswer} onChange={event => edit({ correctAnswer: event.target.value })}>{question.options.map((option, i) => <option key={i} value={option}>{option || `Option ${i + 1}`}</option>)}</select></label>{textField("Explanation", "explanation", question.explanation, true)}</>}
        <section className="ce-ai"><h3>✦ AI assist</h3><label className="ce-field"><span>What would you like to change?</span><textarea rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="For example: simplify this explanation for a beginner, keeping the source facts." /></label><div className="ce-actions"><button onClick={() => rewrite("regenerate")}>Regenerate selected content</button></div><small>AI text edits use the original source. Review the suggestion before applying it.</small></section>
        {!question && <section className="ce-images"><h3>{target.kind === "course" ? "Cover image" : "Slide image"}</h3>{imageUrl ? <img src={imageUrl} alt={target.kind === "course" ? course.coverImageAlt || "Course cover" : slide?.imageAlt || "Slide illustration"} /> : <p>No image on this {target.kind === "course" ? "cover" : "slide"}.</p>}
          {textField("Alternative text", target.kind === "course" ? "coverImageAlt" : "imageAlt", (target.kind === "course" ? course.coverImageAlt : slide?.imageAlt) || "")}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden ref={fileInput} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 10 * 1024 * 1024) { setError("Choose an image under 10MB."); return; } const data = new FormData(); data.append("file", file); void request("/api/course/editor/image/upload", data, "Uploading replacement…"); }} />
          <div className="ce-actions"><button onClick={() => fileInput.current?.click()}>Upload replacement</button><button disabled={!prompt.trim()} onClick={() => void request("/api/course/editor/image", { prompt, kind: target.kind, content: { title: "title" in current ? current.title : "", content: slide?.content || course.description, keyPoints: slide?.keyPoints || [] } }, "Generating image…")}>Generate image from prompt</button><button disabled={!imageUrl} onClick={() => edit(target.kind === "course" ? { coverImage: "", coverImageAlt: "" } : { imageUrl: "", image: "", imageRequired: false, imageStatus: "not_required" })}>Remove image</button></div><small>Use the AI assist prompt above to describe your replacement image. PNG, JPEG, or WebP · up to 10MB.</small></section>}
      </fieldset>
      {busy && <p role="status">{busy}</p>}
      {suggestion && <section className="ce-suggestion"><h3>Review suggestion</h3>{suggestion.kind === "image" ? <img src={suggestion.imageUrl} alt={suggestion.imageAlt || "Proposed replacement"} /> : <dl>{Object.entries(suggestion.content).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? <ul>{value.map((line, i) => <li key={i}>{String(line)}</li>)}</ul> : String(value)}</dd></div>)}</dl>}<div className="ce-actions"><button className="ce-primary" onClick={applySuggestion}>Apply suggestion</button><button onClick={() => setSuggestion(null)}>Discard</button></div></section>}
      </div>
    </div>}
  </section>;
}
