import { AuraMark } from "./BrandIcons";

import CourseViewer, { type Course as EditableCourse } from "./CourseViewer";
import CourseEditor, { EDITOR_DRAFT_KEY } from "./CourseEditor";
import type { CourseDomainMetadata } from "./courseDomains";
import CourseFeed, { type FeedCourse } from "./CourseFeed";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";


type GenerationProgress = {
  stage: string;
  message: string;
  title?: string;
  module?: { index: number; title: string; slides: number };
  imageTotal?: number;
  imageDone?: number;
};

async function readCourseGeneration(response: Response, onProgress: (event: GenerationProgress) => void): Promise<{ course: GeneratedCourse }> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    return response.json(); // Compatibility with a backend still returning JSON.
  }
  if (!response.body) throw new Error("Live progress is unavailable. Please try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { course: GeneratedCourse } | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress") onProgress(event);
    if (event.type === "error") throw new Error(event.message || "Course generation failed.");
    if (event.type === "complete") result = event.payload;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consume);
      if (done) { consume(buffer); break; }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!result?.course) throw new Error("The connection ended before your course was ready. Please try again.");
  return result;
}

type ScreenId =
  | "home"
  | "admin"
  | "creator"
  | "courses"
  | "builder";

type CourseSetupStep = "idle" | "level" | "persona" | "goal";

type User = {
  id?: number;
  initials: string;
  name: string;
  email: string;
  role: "Creator" | "Learner" | "Admin";
  status: "Active" | "Pending Invite" | "Suspended";
};

type UserForm = {
  username: string;
  email: string;
  role: User["role"];
  status: User["status"];
};

type CourseCard = {
  title: string;
  category: string;
  status: string;
  progress: string;
  description: string;
  action: string;
  savedCourseId?: number;
  slideCount?: number;
  moduleCount?: number;
};

type CourseModule = {
  id: number;
  title: string;
  content: string;
};

type GeneratedCourse = EditableCourse & CourseDomainMetadata;

type CourseDraft = {
  title: string;
  description: string;
  audience: string;
  coverImage: string;
  modules: CourseModule[];
  images: string[];
};

type SavedCourseDraft = CourseDomainMetadata & {
  id: number;
  status: "draft" | "published";
  title: string;
  description: string;
  audience: string;
  coverImage: string;
  modules: CourseModule[];
  images: string[];
  updatedAt: string;
  creatorName?: string;
  course?: GeneratedCourse;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSession = {
  sessionId: string;
  title: string;
  updatedAt?: string;
};

const navigation: { id: ScreenId; label: string }[] = [
  { id: "home", label: "Home Feed" },
  { id: "admin", label: "Admin" },
  { id: "creator", label: "Creator Studio" },
  { id: "courses", label: "My Courses" },
  { id: "builder", label: "Course Builder" },
];


function NavIcon({ name }: { name: ScreenId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<ScreenId, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-6h6v6" /></>,
    admin: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8h5M19.5 5.5v5M17 17h5" /></>,
    creator: <><path d="m4 20 2-7L17 2l5 5-11 11-7 2Zm2-7 5 5M14 5l5 5" /></>,
    courses: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7v10l8-5z" /></>,
    builder: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 7v10M7 12h10" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

const API_BASE = "http://127.0.0.1:5000";

const getInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "NA";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const normalizeRole = (value: string): User["role"] => {
  const lowered = value.trim().toLowerCase();

  if (lowered === "creator") {
    return "Creator";
  }

  if (lowered === "admin") {
    return "Admin";
  }

  return "Learner";
};

const normalizeStatus = (value: string): User["status"] => {
  const lowered = value.trim().toLowerCase();

  if (lowered === "pending invite") {
    return "Pending Invite";
  }

  if (lowered === "suspended") {
    return "Suspended";
  }

  return "Active";
};

const curriculum = [
  {
    step: "1",
    title: "Introduction to Enterprise AI",
    duration: "~10m",
    summary:
      "Welcome & Objectives, The Evolution of AI in Business, and a short article block.",
  },
  {
    step: "2",
    title: "Core Concepts & Terminology",
    duration: "~15m",
    summary:
      "Definitions, prompt structure, and foundational concepts for executive audiences.",
  },
  {
    step: "3",
    title: "Practical Application Scenarios",
    duration: "~12m",
    summary:
      "High-level case studies and enterprise deployment patterns.",
  },
];

const learnerLevelOptions = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

const learnerPersonaOptions = [
  "Student",
  "IT Professional",
  "Content Creator",
  "Developer",
  "Manager",
  "Other",
];

const learnerGoalOptions = [
  "Learn the fundamentals",
  "Apply it at work",
  "Build practical skills",
  "Prepare for an assessment",
];

function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("aura-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [activeScreen, setActiveScreen] =
    useState<ScreenId>("home");

  const [search, setSearch] = useState("");

  const [roleFilter, setRoleFilter] =
    useState<"All" | User["role"]>("All");

  const [statusFilter, setStatusFilter] =
    useState<"All" | User["status"]>("All");

  const [courseTab, setCourseTab] =
    useState<
      "All" | "Active" | "Draft" | "Posted" | "Archived"
    >("All");

  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] =
    useState(false);
  const [userError, setUserError] = useState("");

  const [newUser, setNewUser] =
    useState<UserForm>({
      username: "",
      email: "",
      role: "Learner",
      status: "Active",
    });

  const [draftCourse, setDraftCourse] =
    useState<CourseDraft>({
      title: "Fundamentals of Enterprise AI",
      description:
        "A practical course for teams to adopt AI with confident decision-making and responsible implementation.",
      audience: "People Managers and Team Leads",
      coverImage: "",
      modules: [
        {
          id: 1,
          title: "Module 1: AI in Everyday Workflows",
          content:
            "Introduce common use cases, value framing, and boundaries for enterprise-safe usage.",
        },
        {
          id: 2,
          title: "Module 2: Prompt Patterns",
          content:
            "Show reusable prompt templates for summaries, policy mapping, and stakeholder updates.",
        },
      ],
      images: [],
    });

  const [newModule, setNewModule] = useState({
    title: "",
    content: "",
  });

  const [newImageUrl, setNewImageUrl] =
    useState("");

  const [draftSaveMessage, setDraftSaveMessage] =
    useState("");

  const [savedDraftCourses, setSavedDraftCourses] =
    useState<SavedCourseDraft[]>([]);

  const [isLoadingCourses, setIsLoadingCourses] =
    useState(false);

  const [courseError, setCourseError] =
    useState("");

  /* =====================================================
     CHAT STATE
     ===================================================== */

  const [chatMessages, setChatMessages] =
    useState<ChatMessage[]>([]);

  const [chatInput, setChatInput] = useState("");

  const [isSending, setIsSending] =
    useState(false);

  const [isIngestionOpen, setIsIngestionOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [ingestionError, setIngestionError] = useState("");
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  const [isUploading, setIsUploading] =
    useState(false);

  const [isGeneratingCourse, setIsGeneratingCourse] =
    useState(false);


  const [generatedCourse, setGeneratedCourse] =
  useState<GeneratedCourse | null>(null);
  const [isCourseEditorOpen, setIsCourseEditorOpen] = useState(false);

  const [recoverableDraft, setRecoverableDraft] = useState<{ course: GeneratedCourse; documentId: number | null } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EDITOR_DRAFT_KEY) || "null");
      if (saved?.course && typeof saved.course.title === "string" && Array.isArray(saved.course.modules) && (Array.isArray(saved.course.assessment) || Array.isArray(saved.course.assessments))) return saved;
    } catch { /* Browser storage may be disabled. */ }
    return null;
  });

  const [selectedSavedCourse, setSelectedSavedCourse] =
    useState<GeneratedCourse | null>(null);

  const [editingSavedCourseId, setEditingSavedCourseId] = useState<number | null>(null);

  const [courseSaveMessage, setCourseSaveMessage] =
    useState("");

  const [isSavingCourse, setIsSavingCourse] =
    useState(false);

  const [courseSetupStep, setCourseSetupStep] =
    useState<CourseSetupStep>("idle");

  const [courseLevel, setCourseLevel] =
    useState("");

  const [coursePersona, setCoursePersona] =
    useState("");

  const [courseGoal, setCourseGoal] =
    useState("");

  const [isHistoryOpen, setIsHistoryOpenState] =
    useState(false);

  const [chatSessions, setChatSessions] =
    useState<ChatSession[]>([]);

  const [isLoadingHistory, setIsLoadingHistory] =
    useState(false);

  const [activeDocumentId, setActiveDocumentId] =
    useState<number | null>(null);

  const activeDocumentIdRef =
    useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("aura-theme", theme);
    } catch {
    }
  }, [theme]);

  const [sessionId, setSessionId] =
    useState<string>(() => {
      const generated = crypto.randomUUID();

      localStorage.setItem(
        "aura_session_id",
        generated,
      );

      return generated;
    });

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const chatEndRef =
    useRef<HTMLDivElement>(null);

  /* =====================================================
     USER MANAGEMENT
     ===================================================== */

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    setUserError("");

    try {
      const response = await fetch(
        `${API_BASE}/fetch`,
      );

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to fetch users (${response.status})`,
        );
      }

      const payload =
        (await response.json()) as Array<{
          id?: number;
          username: string;
          email: string;
          role: string;
          status: string;
        }>;

      const normalized = payload.map(
        (item) => ({
          id: item.id,
          initials: getInitials(
            item.username,
          ),
          name: item.username,
          email: item.email,
          role: normalizeRole(item.role),
          status: normalizeStatus(item.status),
        }),
      );

      setUsers(normalized);
    } catch (error) {
      setUserError(
        error instanceof Error
          ? error.message
          : "Unable to fetch users",
      );
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeScreen === "admin") {
      void fetchUsers();
    }
  }, [activeScreen]);

  useEffect(() => {
  if (!courseSaveMessage) {
    return;
  }

  const timer = window.setTimeout(() => {
    setCourseSaveMessage("");
  }, 2000);

  return () => {
    window.clearTimeout(timer);
  };
}, [courseSaveMessage]);

  /* =====================================================
     CHAT HISTORY
     ===================================================== */

  const loadSelectedChat = async (
    selectedSessionId: string,
  ) => {
    try {
      setIsLoadingHistory(true);

      const response = await fetch(
        `${API_BASE}/api/chat/history?sessionId=${encodeURIComponent(
          selectedSessionId,
        )}`,
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load chat history.",
        );
      }

      const payload =
        (await response.json()) as Array<{
          id: number;
          role: "user" | "assistant";
          content: string;
          documentId?: number | null;
        }>;

      setChatMessages(
        payload.map((item) => ({
          id: String(item.id),
          role: item.role,
          content: item.content,
        })),
      );

      const lastWithDocument = [...payload]
        .reverse()
        .find((item) => item.documentId);

      setActiveDocumentId(
        lastWithDocument?.documentId ?? null,
      );

      setCourseSetupStep("idle");
      setCourseLevel("");
      setCoursePersona("");
      setCourseGoal("");
      setIsGeneratingCourse(false);
      setGeneratedCourse(null);

      setSessionId(selectedSessionId);

      localStorage.setItem(
        "aura_session_id",
        selectedSessionId,
      );

      setIsHistoryOpenState(false);
    } catch (error) {
      setChatMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to load chat history.",
        },
      ]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [chatMessages, isGeneratingCourse]);

  /* =====================================================
     CONTENT INGESTION
     ===================================================== */

  const handleFileSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    await ingestSource(file);
  };

  const ingestSource = async (source: File | string) => {
    if (isUploading || isGeneratingCourse) return;
    setIngestionError("");
    if (typeof source !== "string") {
      if (!/\.(pdf|docx|pptx)$/i.test(source.name)) {
        setIngestionError("Choose a PDF, DOCX, or PPTX file.");
        return;
      }
      if (source.size > 20 * 1024 * 1024) {
        setIngestionError("Source exceeds the 20MB limit.");
        return;
      }
    } else {
      source = source.trim();
      try {
        const url = new URL(source);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        setIngestionError("Enter a valid HTTP or HTTPS link.");
        return;
      }
    }
    // Close the source picker immediately; processing continues in the chat.
    setIsIngestionOpen(false);
    setActiveScreen("home");
    setSelectedSavedCourse(null);
    setGeneratedCourse(null);
    setIsUploading(true);

    setChatMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: typeof source === "string" ? `🔗 Added ${source}` : `📄 Uploaded ${source.name}`,
      },
    ]);

    try {
      let response: Response;
      if (typeof source === "string") {
        response = await fetch(`${API_BASE}/api/content/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: source, sessionId }),
        });
      } else {
        const formData = new FormData();
        formData.append("file", source);
        formData.append("sessionId", sessionId);
        response = await fetch(`${API_BASE}/api/content/upload`, {
          method: "POST",
          body: formData,
        });
      }

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to add source (${response.status})`,
        );
      }

      const payload =
        (await response.json()) as {
          documentId: number;
          filename: string;
          message?: string;
        };

      // setActiveDocumentId(
      //   payload.documentId,
      // );
      setIsIngestionOpen(false);
      setSourceUrl("");
      activeDocumentIdRef.current = payload.documentId;
      
      setActiveDocumentId(
        payload.documentId,
      );

      /*
       * Start the learner-personalization flow.
       */
      setCourseLevel("");
      setCoursePersona("");
      setCourseGoal("");

      setCourseSetupStep("level");

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Great. I have your source material. Before I create the course, I need a few details about the learner.\n\n**What is your current learning level?**",
        },
      ]);
    } catch (error) {
      setIngestionError(error instanceof Error ? error.message : "Unable to add source.");
      setCourseSetupStep("idle");

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to add source.",
        },
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  /* =====================================================
     COURSE QUESTION FLOW
     ===================================================== */

  // const handleCourseSetupChoice = async (
  //   choice: string,
  // ) => {
  //   if (
  //     !activeDocumentId ||
  //     isGeneratingCourse
  //   ) {
  //     return;
  //   }
  const handleCourseSetupChoice = async (
  choice: string,
) => {
  const currentDocumentId = activeDocumentIdRef.current;

  if (
    !currentDocumentId ||
    isGeneratingCourse
  ) {
    return;
  }

    if (courseSetupStep === "level") {
      setCourseLevel(choice);
      setCourseSetupStep("persona");

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: choice,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "**Which learner persona best describes you?**",
        },
      ]);

      return;
    }

    if (courseSetupStep === "persona") {
      setCoursePersona(choice);
      setCourseSetupStep("goal");

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: choice,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "**What is your main learning goal?**",
        },
      ]);

      return;
    }

    if (courseSetupStep === "goal") {
      const selectedGoal = choice;

      setCourseGoal(selectedGoal);
      setCourseSetupStep("idle");
      setIsGeneratingCourse(true);

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: selectedGoal,
        },
      ]);

      try {
        const response = await fetch(
          `${API_BASE}/api/course/generate`,
          {
            method: "POST",
            headers: {
              Accept: "application/x-ndjson",
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              documentId:
                currentDocumentId,
              level: courseLevel,
              persona: coursePersona,
              goal: selectedGoal,
            }),
          },
        );

        if (!response.ok) {
          let backendError = "";

          try {
            const errorPayload =
              (await response.json()) as {
                error?: string;
              };

            backendError =
              errorPayload.error ?? "";
          } catch {
            backendError = "";
          }

          throw new Error(
            backendError ||
              `Unable to generate course (${response.status})`,
          );
        }

        const payload = await readCourseGeneration(response, () => {});

        setGeneratedCourse(payload.course);
        setIsCourseEditorOpen(true);
      
      } catch (error) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "Unable to generate course.",
          },
        ]);
      } finally {
        setIsGeneratingCourse(false);
      }
    }
  };

  /* =====================================================
     NORMAL CHAT
     ===================================================== */

  const handleSendChatMessage = async (
    overrideMessage?: string,
  ) => {
    const trimmed = (
      overrideMessage ?? chatInput
    ).trim();

    if (
      !trimmed ||
      isSending ||
      isUploading ||
      isGeneratingCourse ||
      courseSetupStep !== "idle"
    ) {
      return;
    }

    setChatInput("");

    setChatMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      },
    ]);

    setIsSending(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            sessionId,
            message: trimmed,
            documentId:
              activeDocumentId,
          }),
        },
      );

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to get a response (${response.status})`,
        );
      }

      const payload =
        (await response.json()) as {
          reply: string;
        };

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.reply,
        },
      ]);
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to get a response.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  /* =====================================================
     ADMIN
     ===================================================== */

  const handleAddUser = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setUserError("");

    if (
      !newUser.username.trim() ||
      !newUser.email.trim()
    ) {
      setUserError(
        "Username and email are required.",
      );
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/insert`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            username:
              newUser.username.trim(),
            email:
              newUser.email.trim(),
            role: newUser.role,
            status: newUser.status,
          }),
        },
      );

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to add user (${response.status})`,
        );
      }

      setNewUser({
        username: "",
        email: "",
        role: "Learner",
        status: "Active",
      });

      await fetchUsers();
    } catch (error) {
      setUserError(
        error instanceof Error
          ? error.message
          : "Unable to add user",
      );
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch = [
        user.name,
        user.email,
        user.role,
        user.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesRole =
        roleFilter === "All" ||
        user.role === roleFilter;

      const matchesStatus =
        statusFilter === "All" ||
        user.status === statusFilter;

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      );
    });
  }, [
    roleFilter,
    search,
    statusFilter,
    users,
  ]);

  /* =====================================================
     COURSES
     ===================================================== */

  const fetchSavedCourses = async () => {
    setIsLoadingCourses(true);
    setCourseError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/courses`,
      );

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to fetch courses (${response.status})`,
        );
      }

      const payload =
        (await response.json()) as Array<{
          id: number;
          title: string;
          description: string;
          audience?: string;
          coverImage?: string;
          modules?: CourseModule[];
          images?: string[];
          updatedAt?: string;
          status?: "draft" | "published";
          course?: GeneratedCourse;
          creatorName?: string;
          domain?: string;
          category?: string;
          topics?: string[];
        }>;

      setSavedDraftCourses(
        payload.map((course) => ({
          id: course.id,
          status: course.status ?? (course.course ? "published" : "draft"),
          title: course.title,
          description:
            course.description,
          audience:
            course.audience ?? "",
          coverImage:
            course.coverImage ?? "",
          modules: Array.isArray(
            course.modules,
          )
            ? course.modules
            : [],
          images: Array.isArray(
            course.images,
          )
            ? course.images
            : [],
          updatedAt:
            course.updatedAt ?? "",
          course: course.course,
          creatorName: course.creatorName,
          domain: course.domain,
          category: course.category,
          topics: course.topics,
        })),
      );
    } catch (error) {
      setCourseError(
        error instanceof Error
          ? error.message
          : "Unable to fetch courses",
      );
    } finally {
      setIsLoadingCourses(false);
    }
  };

  useEffect(() => {
    if (
      activeScreen === "creator" ||
      activeScreen === "courses" ||
      activeScreen === "home"
    ) {
      void fetchSavedCourses();
    }
  }, [activeScreen]);

  const feedCourses: FeedCourse[] = savedDraftCourses
    .filter((item): item is SavedCourseDraft & { course: GeneratedCourse } => item.status === "published" && Boolean(item.course?.modules?.some(module => module.slides?.length)))
    .map(item => ({ id: item.id, title: item.title || item.course.title, description: item.description || item.course.description, audience: item.audience, coverImage: item.coverImage, updatedAt: item.updatedAt, creatorName: item.creatorName, domain: item.domain, category: item.category, topics: item.topics, course: item.course }));

  const savedDraftCards: CourseCard[] =
    savedDraftCourses.map((course) => ({
      title: course.title,
      category:
        course.audience || "General",
      status: course.status === "published" ? "Posted" : "Draft",
      progress: "Saved",
      description:
        course.description,
      action: course.course && course.status === "published"
        ? "Open Course"
        : course.course ? "Edit draft" : "View draft",
      savedCourseId: course.id,
      moduleCount: course.course?.modules?.length ?? course.modules.length,
      slideCount: course.course?.modules?.reduce(
        (total, module) => total + (module.slides?.length ?? 0), 0,
      ) ?? 0,
    }));

  const displayedCourses = savedDraftCards;

  const visibleCourses =
    courseTab === "All"
      ? displayedCourses
      : displayedCourses.filter(
          (course) =>
            course.status === courseTab,
        );

  function openSavedCourse(savedCourseId?: number): void {
    if (!savedCourseId) return;
    const saved = savedDraftCourses.find((item) => item.id === savedCourseId);
    if (!saved) return;
    if (saved.course && saved.status === "draft") {
      setActiveDocumentId(saved.course.sourceDocumentId ?? null);
      activeDocumentIdRef.current = saved.course.sourceDocumentId ?? null;
      setGeneratedCourse(saved.course);
      setEditingSavedCourseId(saved.id);
      setIsCourseEditorOpen(true);
      setCourseSaveMessage("");
      setActiveScreen("creator");
      return;
    }
    if (saved.course) {
      setSelectedSavedCourse(saved.course);
      setActiveScreen("courses");
      return;
    }
    setDraftCourse({
      title: saved.title,
      description: saved.description,
      audience: saved.audience,
      coverImage: saved.coverImage,
      modules: saved.modules,
      images: saved.images,
    });
    setActiveScreen("builder");
  }

  const addModule = () => {
    if (
      !newModule.title.trim() ||
      !newModule.content.trim()
    ) {
      return;
    }

    setDraftCourse((prev) => ({
      ...prev,
      modules: [
        ...prev.modules,
        {
          id: Date.now(),
          title:
            newModule.title.trim(),
          content:
            newModule.content.trim(),
        },
      ],
    }));

    setNewModule({
      title: "",
      content: "",
    });
  };

  const updateModule = (
    id: number,
    field: "title" | "content",
    value: string,
  ) => {
    setDraftCourse((prev) => ({
      ...prev,
      modules: prev.modules.map(
        (module) =>
          module.id === id
            ? {
                ...module,
                [field]: value,
              }
            : module,
      ),
    }));
  };

  const removeModule = (
    id: number,
  ) => {
    setDraftCourse((prev) => ({
      ...prev,
      modules: prev.modules.filter(
        (module) =>
          module.id !== id,
      ),
    }));
  };

  const addImage = () => {
    if (!newImageUrl.trim()) {
      return;
    }

    setDraftCourse((prev) => ({
      ...prev,
      images: [
        ...prev.images,
        newImageUrl.trim(),
      ],
    }));

    setNewImageUrl("");
  };

  const removeImage = (
    index: number,
  ) => {
    setDraftCourse((prev) => ({
      ...prev,
      images: prev.images.filter(
        (_, imageIndex) =>
          imageIndex !== index,
      ),
    }));
  };

  const deleteUserFromApi = async (
    identifier: string,
  ) => {
    const response = await fetch(
      `${API_BASE}/api/users/${encodeURIComponent(
        identifier,
      )}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      let backendError = "";

      try {
        const errorPayload =
          (await response.json()) as {
            error?: string;
          };

        backendError =
          errorPayload.error ?? "";
      } catch {
        backendError = "";
      }

      throw new Error(
        backendError ||
          `Unable to delete user (${response.status})`,
      );
    }
  };

  const handleSaveGeneratedCourse = async () => {
    if (!generatedCourse || isSavingCourse) {
      return;
    }

    setIsSavingCourse(true);
    setCourseSaveMessage("");

    try {
      const sourceDocumentId = activeDocumentIdRef.current ?? activeDocumentId;
      const response = await fetch(
        `${API_BASE}/api/courses`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            course: { ...generatedCourse, sourceDocumentId },
            status: "draft",
            audience: [
              courseLevel,
              coursePersona,
            ]
              .filter(Boolean)
              .join(" • "),
          }),
        },
      );

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to save course (${response.status})`,
        );
      }

      try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch { /* Database save still succeeds. */ }
      setRecoverableDraft(null);
      await fetchSavedCourses();
      setGeneratedCourse(null);
      setEditingSavedCourseId(null);
      setSelectedSavedCourse(null);
      setChatMessages([]);
      setCourseSetupStep("idle");
      setCourseLevel("");
      setCoursePersona("");
      setCourseGoal("");
      setActiveDocumentId(null);
      
      setCourseSaveMessage("Course saved to Creator Studio drafts.");
      setCourseTab("Draft");
      setActiveScreen("creator");
    } catch (error) {
      setCourseSaveMessage(
        error instanceof Error
          ? error.message
          : "Unable to save course.",
      );
    } finally {
      setIsSavingCourse(false);
    }
  };

  const handlePublishSavedCourse = async () => {
    if (!generatedCourse || !editingSavedCourseId || isSavingCourse) return;
    setIsSavingCourse(true);
    setCourseSaveMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/courses/${editingSavedCourseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: generatedCourse, status: "published" }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Unable to publish course (${response.status})`);
      try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch { /* Database save still succeeds. */ }
      setRecoverableDraft(null);
      setGeneratedCourse(null);
      setEditingSavedCourseId(null);
      await fetchSavedCourses();
      setCourseTab("All");
      setCourseSaveMessage("Course saved to My Courses and published to Home Feed.");
      setActiveScreen("courses");
    } catch (error) {
      setCourseSaveMessage(error instanceof Error ? error.message : "Unable to publish course.");
    } finally {
      setIsSavingCourse(false);
    }
  };

  const handleSaveDraft = async () => {
    setDraftSaveMessage("");

    if (
      !draftCourse.title.trim() ||
      !draftCourse.description.trim()
    ) {
      setDraftSaveMessage(
        "Course title and description are required before saving.",
      );
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/courses`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            { ...draftCourse, status: "draft" },
          ),
        },
      );

      if (!response.ok) {
        let backendError = "";

        try {
          const errorPayload =
            (await response.json()) as {
              error?: string;
            };

          backendError =
            errorPayload.error ?? "";
        } catch {
          backendError = "";
        }

        throw new Error(
          backendError ||
            `Unable to save draft (${response.status})`,
        );
      }

      setDraftSaveMessage(
        "Draft saved to database successfully.",
      );

      await fetchSavedCourses();

      setCourseTab("Draft");
      setActiveScreen("creator");
    } catch (error) {
      setDraftSaveMessage(
        error instanceof Error
          ? error.message
          : "Unable to save draft",
      );
    }
  };

  /* =====================================================
     HISTORY
     ===================================================== */

  async function loadChatSessions() {
    setIsLoadingHistory(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/chat/sessions`,
      );

      if (!response.ok) {
        return;
      }

      const payload =
        (await response.json()) as Array<{
          sessionId?: string;
          title?: string;
          updatedAt?: string;
        }>;

      setChatSessions(
        payload
          .filter(
            (chat) =>
              Boolean(chat.sessionId),
          )
          .map((chat) => ({
            sessionId:
              chat.sessionId as string,
            title:
              chat.title ||
              "Untitled chat",
            updatedAt:
              chat.updatedAt,
          })),
      );
    } catch {
      setChatSessions([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function handleNewChat(): void {
    const newSessionId =
      crypto.randomUUID();

    localStorage.setItem(
      "aura_session_id",
      newSessionId,
    );

    setSessionId(newSessionId);

    setChatMessages([]);
    setGeneratedCourse(null);

    setActiveDocumentId(null);

    setChatInput("");

    setCourseSetupStep("idle");

    setCourseLevel("");

    setCoursePersona("");

    setCourseGoal("");

    setIsGeneratingCourse(false);

    setIsHistoryOpenState(false);
  }

  function startContentIngestion(): void {
    if (isUploading || isGeneratingCourse) return;
    setIngestionError("");
    setIsIngestionOpen(true);
  }

  /* =====================================================
     MARKDOWN / AURA RESPONSE RENDERER
     ===================================================== */

  function renderAssistantMessage(
    content: string,
  ): ReactNode {
    const lines = content
      .replace(/\r\n?/g, "\n")
      .split("\n");

    const nodes: ReactNode[] = [];

    const renderInline = (
      text: string,
    ): ReactNode[] => {
      const parts = text.split(
        /(\*\*[^*]+\*\*|`[^`]+`)/,
      );

      return parts.map(
        (part, index) => {
          if (
            part.startsWith("**") &&
            part.endsWith("**")
          ) {
            return (
              <strong key={index}>
                {part.slice(2, -2)}
              </strong>
            );
          }

          if (
            part.startsWith("`") &&
            part.endsWith("`")
          ) {
            return (
              <code key={index}>
                {part.slice(1, -1)}
              </code>
            );
          }

          return (
            <span key={index}>
              {part}
            </span>
          );
        },
      );
    };

    for (
      let index = 0;
      index < lines.length;
    ) {
      const rawLine = lines[index];
      const line = rawLine.trim();

      if (!line) {
        nodes.push(
          <div
            key={`space-${index}`}
            className="summary-space"
          />,
        );

        index += 1;
        continue;
      }

      /* Code block */

      if (
        line.startsWith("```")
      ) {
        const codeLines: string[] = [];

        index += 1;

        while (
          index < lines.length &&
          !lines[index]
            .trim()
            .startsWith("```")
        ) {
          codeLines.push(
            lines[index],
          );

          index += 1;
        }

        if (
          index < lines.length &&
          lines[index]
            .trim()
            .startsWith("```")
        ) {
          index += 1;
        }

        nodes.push(
          <pre
            key={`code-${index}`}
            className="summary-code"
          >
            <code>
              {codeLines.join("\n")}
            </code>
          </pre>,
        );

        continue;
      }

      /* Headings */

      const heading = line.match(
        /^(#{1,3})\s+(.+)$/,
      );

      if (heading) {
        const headingLevel =
          heading[1].length;

        if (headingLevel === 1) {
          nodes.push(
            <h2
              key={`heading-${index}`}
            >
              {renderInline(
                heading[2],
              )}
            </h2>,
          );
        } else if (
          headingLevel === 2
        ) {
          nodes.push(
            <h3
              key={`heading-${index}`}
            >
              {renderInline(
                heading[2],
              )}
            </h3>,
          );
        } else {
          nodes.push(
            <h4
              key={`heading-${index}`}
            >
              {renderInline(
                heading[2],
              )}
            </h4>,
          );
        }

        index += 1;
        continue;
      }

      /* Numbered list */

      if (
        /^\d+\.\s+/.test(line)
      ) {
        const items: string[] =
          [];

        while (
          index < lines.length &&
          /^\d+\.\s+/.test(
            lines[index].trim(),
          )
        ) {
          items.push(
            lines[index]
              .trim()
              .replace(
                /^\d+\.\s+/,
                "",
              ),
          );

          index += 1;
        }

        nodes.push(
          <ol
            key={`ordered-${index}`}
            className="summary-list"
          >
            {items.map(
              (item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInline(item)}
                </li>
              ),
            )}
          </ol>,
        );

        continue;
      }

      /* Bullet list */

      if (
        /^[-*•]\s+/.test(line)
      ) {
        const items: string[] =
          [];

        while (
          index < lines.length &&
          /^[-*•]\s+/.test(
            lines[index].trim(),
          )
        ) {
          items.push(
            lines[index]
              .trim()
              .replace(
                /^[-*•]\s+/,
                "",
              ),
          );

          index += 1;
        }

        nodes.push(
          <ul
            key={`unordered-${index}`}
            className="summary-list"
          >
            {items.map(
              (item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInline(item)}
                </li>
              ),
            )}
          </ul>,
        );

        continue;
      }

      /* Normal paragraph */

      nodes.push(
        <p
          key={`paragraph-${index}`}
        >
          {renderInline(line)}
        </p>,
      );

      index += 1;
    }

    return nodes;
  }

  /* =====================================================
     APP UI
     ===================================================== */

  return (
    <div className="app-shell">
      {isIngestionOpen && <dialog
        ref={(dialog) => {
          if (dialog && !dialog.open) dialog.showModal();
        }}
        className="ingestion-dialog"
        aria-labelledby="ingestion-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!isUploading) setIsIngestionOpen(false);
        }}
      >
        <button type="button" className="ingestion-close" aria-label="Close source dialog" disabled={isUploading} onClick={() => setIsIngestionOpen(false)}>×</button>
        <p className="ingestion-eyebrow">COURSE SOURCE</p>
        <h1 id="ingestion-title">Add learning material</h1>
        <button
          type="button"
          className={`ingestion-file-button${isFileDragActive ? " is-dragging" : ""}`}
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isUploading && event.dataTransfer.types.includes("Files")) setIsFileDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsFileDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsFileDragActive(false);
            const file = event.dataTransfer.files[0];
            if (file) void ingestSource(file);
          }}
        >
          <span aria-hidden="true">＋</span>
          <span><strong>Choose a file</strong><small>{isFileDragActive ? "Drop your file to upload" : "PDF, DOCX, PPTX · Maximum 20MB"}</small></span>
        </button>
        <div className="ingestion-divider">OR ADD A LINK</div>
        <form className="ingestion-url-form" onSubmit={(event) => { event.preventDefault(); void ingestSource(sourceUrl); }}>
          <input type="url" required aria-label="Webpage or PDF URL" placeholder="https://example.com/article" value={sourceUrl} disabled={isUploading} onChange={(event) => setSourceUrl(event.target.value)} />
          <button type="submit" disabled={isUploading || !sourceUrl.trim()}>{isUploading ? "Adding…" : "Add link"}</button>
        </form>
        {isUploading && <p role="status">Reading your source material…</p>}
        {ingestionError && <p role="alert">{ingestionError}</p>}
      </dialog>}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={(event) => void handleFileSelected(event)}
      />
      <aside className="sidebar">
        <div>
          <div className="brand-lockup">
            <div className="brand-mark">
              <AuraMark />
            </div>

            <div>
              <div className="brand-name">
                AURA
              </div>
              <div className="brand-subtitle">LEARNING STUDIO</div>
            </div>
          </div>

          <button type="button" className="sidebar-create-button" onClick={startContentIngestion} disabled={isUploading || isGeneratingCourse}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> Create Course
          </button>

          <nav className="nav-list">
            {navigation.map(
              (item) => (
                <button
                  key={item.id}
                  className={
                    activeScreen ===
                    item.id
                      ? "nav-item active"
                      : "nav-item"
                  }
                  onClick={() => {
                    setIsCourseEditorOpen(false);
                    if (item.id === "courses") {
                      setSelectedSavedCourse(null);
                      setCourseTab("All");
                    }
                    setActiveScreen(item.id);
                  }}
                  type="button"
                >
                  <NavIcon name={item.id} />
                  <span>
                    {item.label}
                  </span>
                </button>
              ),
            )}
          </nav>
        </div>

        <div className="sidebar-profile">
          <span className="sidebar-profile-avatar">A</span>
          <div><strong>AURA Studio</strong><small>Your workspace</small></div>
        </div>
      </aside>

      <main className={activeScreen === "home" ? "content content-home" : "content"}>
        <header className="top-bar">
          <div>
            <div className="eyebrow">YOUR CREATIVE SPACE <span className="top-bar-divider"></span></div>

            <h1>
              {
                navigation.find(
                  (item) =>
                    item.id ===
                    activeScreen,
                )?.label
              }
            </h1>
          </div>

          <div className="top-bar-actions">
            {activeScreen === "home" && (
            <button
              type="button"
              className="history-open-button"
              onClick={() => {
                setIsHistoryOpenState(
                  true,
                );

                void loadChatSessions();
              }}
              title="New chat / Chat history"
              aria-label="New chat"
            >
              <span>+</span>
              <span>New chat</span>
            </button>
            )}

            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              aria-pressed={theme === "dark"}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                </svg>
              )}
            </button>

            <div className="avatar">
              SA
            </div>
          </div>
        </header>

        {/* =================================================
            HOME
            ================================================= */}

        {activeScreen === "home" && (
          <>


            {/* History drawer */}

            {isHistoryOpen && (
              <div
                className="history-overlay"
                onClick={() =>
                  setIsHistoryOpenState(
                    false,
                  )
                }
              >
                <aside
                  className="history-drawer"
                  onClick={(event) =>
                    event.stopPropagation()
                  }
                >
                  <div className="history-header">
                    <h2>
                      Chat history
                    </h2>

                    <button
                      type="button"
                      className="history-close-button"
                      onClick={() =>
                        setIsHistoryOpenState(
                          false,
                        )
                      }
                      aria-label="Close chat history"
                    >
                      ×
                    </button>
                  </div>

                  <button
                    type="button"
                    className="new-chat-button"
                    onClick={
                      handleNewChat
                    }
                  >
                    + New chat
                  </button>

                  <div className="history-list">
                    {isLoadingHistory ? (
                      <div className="history-empty">
                        Loading chats...
                      </div>
                    ) : chatSessions.length ===
                      0 ? (
                      <div className="history-empty">
                        No previous chats yet.
                      </div>
                    ) : (
                      chatSessions.map(
                        (chat) => (
                          <button
                            key={
                              chat.sessionId
                            }
                            type="button"
                            className={
                              chat.sessionId ===
                              sessionId
                                ? "history-item active"
                                : "history-item"
                            }
                            onClick={() =>
                              void loadSelectedChat(
                                chat.sessionId,
                              )
                            }
                          >
                            <span className="history-title">
                              {chat.title
                                .length >
                              50
                                ? `${chat.title.substring(
                                    0,
                                    50,
                                  )}...`
                                : chat.title}
                            </span>

                            <span className="history-date">
                              {chat.updatedAt
                                ? new Date(
                                    chat.updatedAt,
                                  ).toLocaleDateString()
                                : ""}
                            </span>
                          </button>
                        ),
                      )
                    )}
                  </div>
                </aside>
              </div>
            )}

            {/* Empty home */}
            {isCourseEditorOpen && generatedCourse && editingSavedCourseId === null ? (
              <CourseEditor
                course={generatedCourse}
                documentId={activeDocumentIdRef.current ?? activeDocumentId}
                apiBase={API_BASE}
                onChange={setGeneratedCourse}
                onPublish={() => void handleSaveGeneratedCourse()}
                isPublishing={isSavingCourse}
                publishError={courseSaveMessage}
                publishLabel="Save to Creator Studio"
              />
            )
  : chatMessages.length ===
            0 ? (
              <section className="chat-home aura-home-feed">
                {recoverableDraft && <div className="ce-resume"><span>Unpublished draft: <strong>{recoverableDraft.course.title}</strong></span><button onClick={() => {
                  setGeneratedCourse(recoverableDraft.course);
                  setEditingSavedCourseId(null);
                  setIsCourseEditorOpen(true);
                  setActiveDocumentId(recoverableDraft.documentId);
                  activeDocumentIdRef.current = recoverableDraft.documentId;
                  setCourseSaveMessage("");
                }}>Resume editing</button></div>}
                <div className="chat-home-content">
                  <CourseFeed
                    courses={feedCourses}
                    loading={isLoadingCourses}
                    error={courseError}
                    onRefresh={() => void fetchSavedCourses()}
                    onCreate={startContentIngestion}
                    composer={<>
                  <div className="chat-home-title"><h2>Ask AURA anything</h2></div>

                  <form
                    className="chat-home-composer"
                    onSubmit={(event) => {
                      event.preventDefault();

                      void handleSendChatMessage();
                    }}
                  >
                    <button
                      type="button"
                      className="chat-home-attach"
                      onClick={() =>
                        startContentIngestion()
                      }
                      disabled={
                        isUploading
                      }
                      title="Add source: PDF, DOCX, PPTX, or link"
                      aria-label="Add source: PDF, DOCX, PPTX, or link"
                    >
                      ＋
                    </button>

                    <input
                      value={chatInput}
                      onChange={(event) =>
                        setChatInput(
                          event.target.value,
                        )
                      }
                      placeholder="Ask AURA anything..."
                      aria-label="Ask AURA"
                      disabled={
                        isSending ||
                        isUploading ||
                        isGeneratingCourse
                      }
                      autoComplete="off"
                    />

                    <button
                      type="submit"
                      className="chat-home-send"
                      disabled={
                        isSending ||
                        isUploading ||
                        isGeneratingCourse ||
                        !chatInput.trim()
                      }
                    >
                      ↑
                    </button>
                  </form>
                    </>}
                  />
                </div>
              </section>
            ) : (
              /* Conversation */

              <section className="chat-conversation">
                <div className="chat-messages">
                  {chatMessages.map(
                    (message) => (
                      <div
                        key={message.id}
                        className={`chat-message-row ${message.role}`}
                      >
                        {message.role ===
                        "user" ? (
                          <div className="user-message-content">
                            {
                              message.content
                            }
                          </div>
                        ) : (
                          <article className="assistant-message-content">
                            {renderAssistantMessage(
                              message.content,
                            )}
                          </article>
                        )}
                      </div>
                    ),
                  )}

                  {/* Course setup choices */}

                  {courseSetupStep ===
                    "level" && (
                    <div className="chat-message-row assistant">
                      <div className="course-choice-container">
                        {learnerLevelOptions.map(
                          (option) => (
                            <button
                              key={
                                option
                              }
                              type="button"
                              className="prompt-chip"
                              onClick={() =>
                                void handleCourseSetupChoice(
                                  option,
                                )
                              }
                            >
                              {option}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {courseSetupStep ===
                    "persona" && (
                    <div className="chat-message-row assistant">
                      <div className="course-choice-container">
                        {learnerPersonaOptions.map(
                          (option) => (
                            <button
                              key={
                                option
                              }
                              type="button"
                              className="prompt-chip"
                              onClick={() =>
                                void handleCourseSetupChoice(
                                  option,
                                )
                              }
                            >
                              {option}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {courseSetupStep ===
                    "goal" && (
                    <div className="chat-message-row assistant">
                      <div className="course-choice-container">
                        {learnerGoalOptions.map(
                          (option) => (
                            <button
                              key={
                                option
                              }
                              type="button"
                              className="prompt-chip"
                              onClick={() =>
                                void handleCourseSetupChoice(
                                  option,
                                )
                              }
                            >
                              {option}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {(isSending || isUploading || isGeneratingCourse) && (
                    <div className="chat-message-row assistant">
                      <div className="aura-thinking" role="status" aria-live="polite">
                        <span className="aura-thinking-name">
                          AURA
                        </span>

                        <span className="aura-thinking-text">
                          {isGeneratingCourse
                            ? "is generating your course"
                            : isUploading
                              ? "is reading your source material"
                              : "is thinking"}
                        </span>

                        <span className="thinking-dots">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    </div>
                  )}

                  <div
                    ref={chatEndRef}
                  />
                </div>

                {/* Conversation composer */}

                <form
                  className="chat-composer"
                  onSubmit={(event) => {
                    event.preventDefault();

                    void handleSendChatMessage();
                  }}
                >
                  <button
                    type="button"
                    className="icon-button"
                    title="Add source: PDF, DOCX, PPTX, or link"
                    onClick={() =>
                      startContentIngestion()
                    }
                    disabled={
                      isUploading ||
                      isGeneratingCourse
                    }
                  >
                    📎
                  </button>

                  <input
                    aria-label="Message"
                    value={chatInput}
                    onChange={(event) =>
                      setChatInput(
                        event.target.value,
                      )
                    }
                    placeholder={
                      courseSetupStep !==
                      "idle"
                        ? "Choose an option above to continue..."
                        : "Ask AURA anything..."
                    }
                    disabled={
                      isUploading ||
                      isGeneratingCourse ||
                      courseSetupStep !==
                        "idle"
                    }
                  />

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      isSending ||
                      isUploading ||
                      isGeneratingCourse ||
                      courseSetupStep !==
                        "idle" ||
                      !chatInput.trim()
                    }
                  >
                    Send
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        {/* =================================================
            ADMIN
            ================================================= */}

        {activeScreen === "admin" && (
          <section className="panel stack">
            <div className="panel-header">
              <div>
                <h2>
                  User Management
                </h2>

                <p>
                  Manage roles,
                  permissions, and
                  account status for
                  all platform users.
                </p>
              </div>

              <div className="action-row">
                <button type="button">
                  Bulk Update Roles
                </button>

                <button
                  type="button"
                  className="primary-button"
                >
                  Invite User
                </button>
              </div>
            </div>

            <form
              className="filters-row"
              onSubmit={(event) =>
                void handleAddUser(
                  event,
                )
              }
            >
              <label>
                Name

                <input
                  value={
                    newUser.username
                  }
                  onChange={(event) =>
                    setNewUser(
                      (prev) => ({
                        ...prev,
                        username:
                          event.target
                            .value,
                      }),
                    )
                  }
                  placeholder="Enter full name"
                />
              </label>

              <label>
                Email

                <input
                  value={
                    newUser.email
                  }
                  onChange={(event) =>
                    setNewUser(
                      (prev) => ({
                        ...prev,
                        email:
                          event.target
                            .value,
                      }),
                    )
                  }
                  placeholder="Enter email"
                />
              </label>

              <label>
                New Role

                <select
                  value={
                    newUser.role
                  }
                  onChange={(event) =>
                    setNewUser(
                      (prev) => ({
                        ...prev,
                        role: event.target
                          .value as User["role"],
                      }),
                    )
                  }
                >
                  <option>
                    Creator
                  </option>
                  <option>
                    Learner
                  </option>
                  <option>
                    Admin
                  </option>
                </select>
              </label>

              <label>
                New Status

                <select
                  value={
                    newUser.status
                  }
                  onChange={(event) =>
                    setNewUser(
                      (prev) => ({
                        ...prev,
                        status:
                          event.target
                            .value as User["status"],
                      }),
                    )
                  }
                >
                  <option>
                    Active
                  </option>

                  <option>
                    Pending Invite
                  </option>

                  <option>
                    Suspended
                  </option>
                </select>
              </label>

              <button
                type="submit"
                className="primary-button"
              >
                Add User
              </button>
            </form>

            <div className="filters-row">
              <label>
                Search

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Search users"
                />
              </label>

              <label>
                Role Type

                <select
                  value={roleFilter}
                  onChange={(event) =>
                    setRoleFilter(
                      event.target
                        .value as typeof roleFilter,
                    )
                  }
                >
                  <option>
                    All
                  </option>
                  <option>
                    Creator
                  </option>
                  <option>
                    Learner
                  </option>
                  <option>
                    Admin
                  </option>
                </select>
              </label>

              <label>
                Status

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target
                        .value as typeof statusFilter,
                    )
                  }
                >
                  <option>
                    All
                  </option>
                  <option>
                    Active
                  </option>
                  <option>
                    Pending Invite
                  </option>
                  <option>
                    Suspended
                  </option>
                </select>
              </label>
            </div>

            {userError && (
              <div className="preview-alert">
                {userError}
              </div>
            )}

            {isLoadingUsers && (
              <div className="table-footer">
                Loading users from database...
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map(
                    (user) => (
                      <tr
                        key={`${user.id ?? user.email}-${user.email}`}
                      >
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar">
                              {
                                user.initials
                              }
                            </div>

                            <div>
                              <strong>
                                {user.name}
                              </strong>
                            </div>
                          </div>
                        </td>

                        <td>
                          {user.email}
                        </td>

                        <td>
                          {user.role}
                        </td>

                        <td>
                          <span
                            className={`status-pill ${user.status
                              .toLowerCase()
                              .replace(
                                / /g,
                                "-",
                              )}`}
                          >
                            {
                              user.status
                            }
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="link-button"
                          >
                            Edit Role
                          </button>

                          <button
                            type="button"
                            className="link-button"
                            onClick={async () => {
                              try {
                                await deleteUserFromApi(
                                  user.email,
                                );

                                await fetchUsers();
                              } catch (
                                error
                              ) {
                                setUserError(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to delete user",
                                );
                              }
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              Showing{" "}
              {
                filteredUsers.length
              }{" "}
              users from the database
            </div>
          </section>
        )}

        {/* =================================================
            CREATOR
            ================================================= */}

        {activeScreen ===
          "creator" && (
          isCourseEditorOpen && editingSavedCourseId !== null && generatedCourse ? (
            <CourseEditor
              course={generatedCourse}
              documentId={activeDocumentIdRef.current ?? activeDocumentId}
              apiBase={API_BASE}
              onChange={setGeneratedCourse}
              onPublish={() => void handlePublishSavedCourse()}
              isPublishing={isSavingCourse}
              publishError={courseSaveMessage}
              publishLabel="Save to Course Studio & Publish"
              onBack={() => {
                setGeneratedCourse(null);
                setEditingSavedCourseId(null);
                setIsCourseEditorOpen(false);
                setCourseSaveMessage("");
              }}
            />
          ) : (
          <section className="stack">
            <div className="panel hero-strip">
              <div>
                <div className="eyebrow">
                  Creator Hub
                </div>

                <p>
                  Shape your saved courses and manual drafts in one place.
                </p>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  setActiveScreen(
                    "builder",
                  )
                }
              >
                Create a Draft
              </button>
            </div>

            <div className="tabs-row">
              {[
                "All",
                "Draft",
              ].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={
                    courseTab ===
                    tab
                      ? "tab active"
                      : "tab"
                  }
                  onClick={() =>
                    setCourseTab(
                      tab as typeof courseTab,
                    )
                  }
                >
                  {tab}
                </button>
              ))}
            </div>

            {courseError && (
              <div className="preview-alert">
                {courseError}
              </div>
            )}

            {courseSaveMessage && (
              <div className="preview-alert" role="status">
                {courseSaveMessage}
              </div>
            )}

            {isLoadingCourses && (
              <div className="table-footer">
                Loading saved drafts...
              </div>
            )}

            {visibleCourses.length === 0 && !isLoadingCourses && !courseError ? <div className="panel course-empty-state"><span className="empty-state-symbol">✦</span><h2>No drafts here yet</h2><p>Build a course draft or add a PDF, DOCX, PPTX, or link to begin.</p><button type="button" className="primary-button" onClick={() => setActiveScreen("builder")}>Create a draft</button></div> : <div className="course-grid">
              {visibleCourses.map(
                (course) => (
                  <article
                    key={course.title}
                    className="panel course-card"
                  >
                    <div className="course-cover" aria-hidden="true"><span className="course-cover-emblem">✦</span><span className="course-cover-label">{course.moduleCount ? `${course.moduleCount} MODULES` : "COURSE DRAFT"}</span></div>
                    <div className="card-topline">
                      <span className="status-pill active">
                        {
                          course.status
                        }
                      </span>

                      <span>
                        {
                          course.category
                        }
                      </span>
                    </div>

                    <h2>
                      {course.title}
                    </h2>

                    <p>
                      {
                        course.description
                      }
                    </p>

                    <div className="card-footer">
                      <strong>
                        {
                          course.progress
                        }
                      </strong>

                      <button
                        type="button"
                        className="link-button"
                        onClick={() => openSavedCourse(course.savedCourseId)}
                      >
                        {
                          course.action
                        }
                      </button>
                    </div>
                  </article>
                ),
              )}
            </div>}
          </section>
          )
        )}

        {/* =================================================
            MY COURSES
            ================================================= */}

        {activeScreen ===
          "courses" && (
          <section className="stack">
            {selectedSavedCourse ? (
              <CourseViewer
                course={selectedSavedCourse}
                onBack={() =>
                  setSelectedSavedCourse(null)
                }
              />
            ) : (
              <>
                <div className="panel hero-strip">
                  <div>
                    <div className="eyebrow">YOUR LIBRARY</div>

                    <h2>Made from your material.</h2>

                    <p>
                      Your saved courses and learning paths.
                      Click a saved course to open it.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={startContentIngestion}
                  >
                    Create Course
                  </button>
                </div>

                {courseSaveMessage && (
                  <div className="preview-alert">
                    {courseSaveMessage}
                  </div>
                )}

                <div className="tabs-row">
                  {[
                    "All",
                    "Posted",
                    "Draft",
                  ].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={
                        courseTab === tab
                          ? "tab active"
                          : "tab"
                      }
                      onClick={() =>
                        setCourseTab(
                          tab as typeof courseTab,
                        )
                      }
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {isLoadingCourses ? (
                  <div className="panel">
                    Loading courses...
                  </div>
                ) : courseError ? (
                  <div className="preview-alert">
                    {courseError}
                  </div>
                ) : visibleCourses.length === 0 ? (
                  <div className="panel course-empty-state"><span className="empty-state-symbol">✦</span><h2>{courseTab === "All" ? "Your course library starts here" : "No drafts yet"}</h2><p>Add a PDF, DOCX, PPTX, or link to create a course and it will appear here.</p><button type="button" className="primary-button" onClick={startContentIngestion}>Add source</button></div>
                ) : (
                  <div className="course-grid">
                    {visibleCourses.map((course) => (
                      <article
                        key={
                          course.savedCourseId ??
                          course.title
                        }
                        className="panel course-card learn-card"
                        role={
                          course.savedCourseId
                            ? "button"
                            : undefined
                        }
                        tabIndex={
                          course.savedCourseId
                            ? 0
                            : undefined
                        }
                        style={
                          course.savedCourseId
                            ? { cursor: "pointer" }
                            : undefined
                        }
                        onClick={() => {
                          openSavedCourse(course.savedCourseId);
                        }}
                        onKeyDown={(event) => {
                          if (
                            course.savedCourseId &&
                            (event.key === "Enter" ||
                              event.key === " ")
                          ) {
                            event.preventDefault();

                            openSavedCourse(course.savedCourseId);
                          }
                        }}
                      >
                        <div className="course-cover" aria-hidden="true"><span className="course-cover-emblem">✦</span><span className="course-cover-label">{course.slideCount ? `${course.slideCount} SLIDES` : "COURSE DRAFT"}</span></div>
                        <div className="card-topline">
                          <span className="status-pill active">
                            {course.status}
                          </span>

                          <span>
                            {course.category}
                          </span>
                        </div>

                        <h2>{course.title}</h2>

                        <p>{course.description}</p>

                        <div className="card-footer">
                          <strong>{course.progress}</strong>

                          <button
                            type="button"
                            className="link-button"
                            onClick={(event) => {
                              event.stopPropagation();

                              openSavedCourse(course.savedCourseId);
                            }}
                          >
                            {course.action}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}


        {/* =================================================
            BUILDER
            ================================================= */}

        {activeScreen ===
          "builder" && (
          <section className="stack">
            <div className="panel hero-strip">
              <div>
                <div className="eyebrow">
                  Course Builder
                </div>

                <p>
                  Draft and edit your
                  course content before
                  publishing.
                </p>
              </div>

              <div className="action-row">
                <button
                  type="button"
                  onClick={() =>
                    setActiveScreen(
                      "creator",
                    )
                  }
                >
                  Back to Creator
                  Hub
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    void handleSaveDraft()
                  }
                >
                  Save Draft
                </button>
              </div>
            </div>

            {draftSaveMessage && (
              <div className="preview-alert">
                {
                  draftSaveMessage
                }
              </div>
            )}

            <div className="course-builder-layout">
              <article className="panel stack">
                <div className="panel-header">
                  <h2>
                    Course Details
                  </h2>

                  <span>
                    editable
                  </span>
                </div>

                <div className="builder-form-grid">
                  <label>
                    Course Title

                    <input
                      value={
                        draftCourse.title
                      }
                      onChange={(event) =>
                        setDraftCourse(
                          (prev) => ({
                            ...prev,
                            title: event
                              .target
                              .value,
                          }),
                        )
                      }
                      placeholder="Enter course title"
                    />
                  </label>

                  <label>
                    Audience

                    <input
                      value={
                        draftCourse.audience
                      }
                      onChange={(event) =>
                        setDraftCourse(
                          (prev) => ({
                            ...prev,
                            audience:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="Who is this for?"
                    />
                  </label>

                  <label className="builder-full-width">
                    Description

                    <textarea
                      value={
                        draftCourse.description
                      }
                      onChange={(event) =>
                        setDraftCourse(
                          (prev) => ({
                            ...prev,
                            description:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="Describe the learning outcomes and scope"
                    />
                  </label>

                  <label className="builder-full-width">
                    Cover Image URL

                    <input
                      value={
                        draftCourse.coverImage
                      }
                      onChange={(event) =>
                        setDraftCourse(
                          (prev) => ({
                            ...prev,
                            coverImage:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="https://example.com/cover-image.jpg"
                    />
                  </label>
                </div>

                {draftCourse.coverImage && (
                  <img
                    className="builder-cover-preview"
                    src={
                      draftCourse.coverImage
                    }
                    alt="Course cover preview"
                  />
                )}
              </article>

              <article className="panel stack">
                <div className="panel-header">
                  <h2>
                    Content Modules
                  </h2>

                  <span>
                    {
                      draftCourse
                        .modules
                        .length
                    }{" "}
                    total
                  </span>
                </div>

                <div className="stack">
                  {draftCourse.modules.map(
                    (
                      module,
                      index,
                    ) => (
                      <div
                        key={module.id}
                        className="module-card"
                      >
                        <div className="module-card-header">
                          <strong>
                            Section{" "}
                            {index +
                              1}
                          </strong>

                          <button
                            type="button"
                            className="link-button"
                            onClick={() =>
                              removeModule(
                                module.id,
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>

                        <input
                          value={
                            module.title
                          }
                          onChange={(
                            event,
                          ) =>
                            updateModule(
                              module.id,
                              "title",
                              event.target
                                .value,
                            )
                          }
                          placeholder="Section title"
                        />

                        <textarea
                          value={
                            module.content
                          }
                          onChange={(
                            event,
                          ) =>
                            updateModule(
                              module.id,
                              "content",
                              event.target
                                .value,
                            )
                          }
                          placeholder="Section content"
                        />
                      </div>
                    ),
                  )}
                </div>

                <div className="module-card module-card-new">
                  <strong>
                    Add New Section
                  </strong>

                  <input
                    value={
                      newModule.title
                    }
                    onChange={(event) =>
                      setNewModule(
                        (prev) => ({
                          ...prev,
                          title:
                            event.target
                              .value,
                        }),
                      )
                    }
                    placeholder="New section title"
                  />

                  <textarea
                    value={
                      newModule.content
                    }
                    onChange={(event) =>
                      setNewModule(
                        (prev) => ({
                          ...prev,
                          content:
                            event.target
                              .value,
                        }),
                      )
                    }
                    placeholder="New section content"
                  />

                  <button
                    type="button"
                    className="primary-button"
                    onClick={addModule}
                  >
                    Add Section
                  </button>
                </div>
              </article>

              <article className="panel stack">
                <div className="panel-header">
                  <h2>
                    Image Assets
                  </h2>

                  <span>
                    {
                      draftCourse
                        .images
                        .length
                    }{" "}
                    uploaded
                  </span>
                </div>

                <div className="prompt-box">
                  <input
                    value={
                      newImageUrl
                    }
                    onChange={(event) =>
                      setNewImageUrl(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Paste image URL"
                  />

                  <button
                    type="button"
                    className="primary-button"
                    onClick={
                      addImage
                    }
                  >
                    Add Image
                  </button>
                </div>

                <div className="image-grid">
                  {draftCourse.images.map(
                    (
                      imageUrl,
                      index,
                    ) => (
                      <div
                        key={`${imageUrl}-${index}`}
                        className="image-item"
                      >
                        <img
                          src={
                            imageUrl
                          }
                          alt={`Course asset ${
                            index + 1
                          }`}
                        />

                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            removeImage(
                              index,
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ),
                  )}
                </div>

                {draftCourse.images
                  .length ===
                  0 && (
                  <div className="preview-alert">
                    No images yet.
                    Add URLs to
                    build your course
                    media library.
                  </div>
                )}
              </article>
            </div>

            <div className="panel builder-save-footer">
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  void handleSaveDraft()
                }
              >
                Save Course
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
