import React from "react";

type Slide = { id?: number; title: string; content: string; keyPoints: string[]; example: string };
type Module = { id?: number; title: string; introduction: string; objectives?: string[]; learningObjectives?: string[]; slides: Slide[]; recap: string | string[] };
type Question = { id?: number; type?: string; question: string; options: string[]; correctAnswer: string; explanation: string };
type Theme = { style: string; background: string; surface: string; text: string; accent: string; font: string };
type Course = { title: string; description: string; learningObjectives: string[]; theme: Theme; modules: Module[]; assessment: Question[] };
type Props = { course: Course; onSave?: () => void; onBack?: () => void; isSaving?: boolean };

export default function CourseViewer({ course, onSave, onBack, isSaving = false }: Props) {
  const [moduleIndex, setModuleIndex] = React.useState(0);
  const [slideIndex, setSlideIndex] = React.useState(0);
  const [showAssessment, setShowAssessment] = React.useState(false);
  React.useEffect(() => { setModuleIndex(0); setSlideIndex(0); setShowAssessment(false); }, [course]);

  const modules = course.modules ?? [];
  const questions = course.assessment ?? [];
  const module = modules[moduleIndex];
  const slide = module?.slides?.[slideIndex];
  const totalSlides = modules.reduce((count, item) => count + (item.slides?.length ?? 0), 0);
  const slideNumber = modules.slice(0, moduleIndex).reduce((count, item) => count + item.slides.length, 0) + slideIndex + 1;
  const progress = totalSlides ? Math.round((slideNumber / totalSlides) * 100) : 0;
  const accent = /^#[0-9a-f]{6}$/i.test(course.theme?.accent ?? "") ? course.theme.accent : "#4f46e5";

  function openModule(index: number) { setModuleIndex(index); setSlideIndex(0); setShowAssessment(false); }
  function goNext() {
    if (!module) return;
    if (slideIndex < module.slides.length - 1) setSlideIndex((index) => index + 1);
    else if (moduleIndex < modules.length - 1) openModule(moduleIndex + 1);
    else setShowAssessment(true);
  }
  function goPrevious() {
    if (slideIndex > 0) setSlideIndex((index) => index - 1);
    else if (moduleIndex > 0) {
      const previous = modules[moduleIndex - 1];
      setModuleIndex(moduleIndex - 1);
      setSlideIndex(Math.max(0, previous.slides.length - 1));
    }
  }
  if (!module || !slide) return <div className="course-viewer course-empty">Course content is unavailable.</div>;

  return <div className="course-viewer" style={{ "--course-accent": accent } as React.CSSProperties}>
    <div className="course-studio-bar"><span>Studio <b>/</b> Generated course</span><span>{modules.length} modules · {totalSlides} slides</span></div>
    <header className="course-player-header">
      <div className="course-player-intro"><div className="course-eyebrow">✦ &nbsp; AURA COURSE STUDIO</div><h1>{course.title}</h1><p>{course.description}</p></div>
      <div className="course-player-actions">
        {onBack && <button type="button" className="course-nav-button secondary" onClick={onBack}>← My Courses</button>}
        {onSave && <button type="button" className="course-nav-button" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save course"}</button>}
      </div>
    </header>
    {!showAssessment ? <div className="course-player-layout">
      <aside className="course-sidebar" aria-label="Course modules">
        <div className="course-sidebar-heading"><div><span className="course-eyebrow">YOUR LEARNING PATH</span><h2>Course modules</h2></div><span className="course-module-total">{modules.length}</span></div>
        <div className="course-module-list">{modules.map((item, index) => <button key={`${index}-${item.title}`} type="button" className={`course-module${index === moduleIndex ? " active" : ""}`} onClick={() => openModule(index)} aria-current={index === moduleIndex ? "step" : undefined}>
          <span className="course-module-index">{String(index + 1).padStart(2, "0")}</span><span className="course-module-copy"><strong>{item.title}</strong><small>{item.slides?.length ?? 0} slides</small></span><span className="course-module-arrow" aria-hidden="true">›</span>
        </button>)}
        <button type="button" className="course-module assessment-link" onClick={() => setShowAssessment(true)}><span className="course-module-index">✦</span><span className="course-module-copy"><strong>Final assessment</strong><small>{questions.length} questions</small></span><span className="course-module-arrow" aria-hidden="true">›</span></button></div>
        <p className="course-sidebar-note">✦ &nbsp; Built from your PDF. Move through the slides at your own pace.</p>
      </aside>
      <main className="course-slide-area">
        <div className="course-stage-toolbar"><div><span className="course-eyebrow">NOW VIEWING</span><h2>{module.title}</h2></div><span className="course-stage-counter">Slide {slideNumber} / {totalSlides}</span></div>
        <div className="course-progress-track" role="progressbar" aria-label="Course progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
        <p className="course-module-intro">{module.introduction}</p>
        <article className="course-feed-card" aria-live="polite">
          <div className="course-feed-author"><span className="course-feed-avatar" aria-hidden="true">A</span><div><strong>AURA Studio</strong><small>{module.title} · Slide {slideIndex + 1} of {module.slides.length}</small></div><span className="course-feed-source">From your PDF</span></div>
          <div className="course-slide-card"><div className="course-slide-topline"><span className="course-slide-number">MODULE {String(moduleIndex + 1).padStart(2, "0")}</span><span className="course-slide-count">{String(slideIndex + 1).padStart(2, "0")} / {String(module.slides.length).padStart(2, "0")}</span></div>
            <div className="course-slide-main"><span className="course-slide-kicker">THE BIG IDEA</span><h3>{slide.title}</h3><p className="course-slide-content">{slide.content}</p>
              {slide.keyPoints?.length > 0 && <section className="course-key-points"><h4>Key takeaways</h4><ul>{slide.keyPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul></section>}
              {slide.example && <section className="course-example"><span>✦</span><div><strong>From the material</strong><p>{slide.example}</p></div></section>}
            </div><div className="course-slide-footer"><span>Explore one idea at a time</span><span className="course-slide-dots" aria-hidden="true">{module.slides.map((_, index) => <i key={index} className={index === slideIndex ? "active" : ""} />)}</span></div>
          </div><div className="course-feed-actions"><span>✦ &nbsp; Learn · Reflect · Continue</span><span>{Math.round((slideIndex + 1) / module.slides.length * 100)}% of this module</span></div>
        </article>
        <div className="course-sequence-header"><div><span className="course-eyebrow">THIS MODULE</span><h3>Slide sequence</h3></div><span>{module.slides.length} slides</span></div>
        <div className="course-slide-sequence" aria-label="Choose a slide">{module.slides.map((item, index) => <button key={`${index}-${item.title}`} type="button" className={`course-sequence-item${index === slideIndex ? " active" : ""}`} onClick={() => setSlideIndex(index)} aria-current={index === slideIndex ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong></button>)}</div>
        <div className="course-navigation"><button type="button" className="course-nav-button secondary" onClick={goPrevious} disabled={moduleIndex === 0 && slideIndex === 0}>← Previous</button><button type="button" className="course-nav-button" onClick={goNext}>{moduleIndex === modules.length - 1 && slideIndex === module.slides.length - 1 ? "Take assessment →" : "Next slide →"}</button></div>
        {module.recap && <section className="course-recap"><span>✦</span><div><h3>Module recap</h3>{Array.isArray(module.recap) ? <ul>{module.recap.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>{module.recap}</p>}</div></section>}
      </main>
    </div> : <main className="course-assessment"><div className="course-assessment-header"><span className="course-eyebrow">YOU'VE MADE IT</span><h2>Test your knowledge</h2><p>{questions.length} questions from your course.</p></div>
      <div className="assessment-grid">{questions.map((question, index) => <article className="assessment-card" key={`${index}-${question.question}`}><span className="course-slide-number">QUESTION {String(index + 1).padStart(2, "0")}</span><h3>{question.question}</h3>
        {question.options?.length > 0 && <div className="assessment-options">{question.options.map((option, optionIndex) => <label key={`${optionIndex}-${option}`}><input type="radio" name={`question-${index}`} value={option} /><span>{option}</span></label>)}</div>}
        <details><summary>Show answer</summary><p><strong>Correct answer:</strong> {question.correctAnswer}</p><p>{question.explanation}</p></details>
      </article>)}</div><button type="button" className="course-nav-button" onClick={() => { setShowAssessment(false); setModuleIndex(0); setSlideIndex(0); }}>← Back to course</button>
    </main>}
  </div>;
}
