# AURA Professional Learning Platform

Project AURA is best described as an AI-Native Learning Experience Platform (LXP). It actively creates, personalizes, and delivers training across multiple formats (web/mobile apps). The platform acts as an automated creation engine that transforms raw inputs into interactive, localized learning experiences on any device.

## Overview

The frontend is a Vite-powered React and TypeScript application. It provides role-oriented experiences for learners, creators, and administrators, with a Flask API responsible for persistence, content ingestion, course generation, and chat.

## Capabilities

- Browse and search the course feed
- View courses and track learner progress
- Save and manage personal courses
- Create courses from links or uploaded source documents
- Generate course content with live progress updates
- Edit course details, modules, slides, and images
- Publish and manage course drafts
- Manage users, roles, and account statuses
- Switch between light and dark themes
- Detect and display course domains such as AI, web development, data science, and cybersecurity

## Technology

- React 18
- TypeScript
- Vite 5
- Flask API
- MySQL
- FAISS-backed document and vector processing
- AI-assisted content generation

## Repository Layout

```text
frontend/code/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.tsx             # Application shell, navigation, state, and API calls
    ├── CourseFeed.tsx      # Course discovery and feed interactions
    ├── CourseViewer.tsx    # Course viewing experience
    ├── CourseEditor.tsx    # Course editing and publishing experience
    ├── courseDomains.ts    # Course domain detection and labels
    ├── BrandIcons.tsx      # AURA brand icon components
    ├── main.tsx            # React application entry point
    └── styles.css          # Global styling
```

## Prerequisites

- Node.js 18 or later
- npm
- Python 3.12 recommended for the backend
- Access to the configured MySQL database when using persistence features
- Backend model configuration when using AI generation or assistant features

## Frontend Setup

From `frontend/code`, install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Vite will display the local URL, normally:

```text
http://localhost:5173
```

## Backend Setup

The frontend currently connects to the Flask API at `http://127.0.0.1:5000`. Start the backend from the repository root:

```powershell
.\aura_env\Scripts\Activate.ps1
pip install -r demo\requirements.txt
python demo\main.py
```

The backend dependencies are listed in `demo/requirements.txt`. The API requires the project’s database and model configuration for course persistence, document processing, generation, and chat.

> Keep database credentials, API keys, and other secrets in local configuration or environment variables. Do not commit them to source control.

## Available Scripts

Run these commands from `frontend/code`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check the project and create a production build |
| `npm run preview` | Preview the production build locally |

## Production Build

Create a production build with:

```powershell
npm run build
```

The compiled frontend is written to `frontend/code/dist`. The Flask application can serve this compiled output when configured for production-style local use.

## API Integration

The frontend currently uses the following backend operations:

| Area | Endpoints |
| --- | --- |
| Feed and source operations | `GET /fetch`, `POST /insert` |
| Users and administration | `GET /api/users`, user update endpoints |
| Courses | `GET`, `POST`, and `PUT /api/courses` |
| Course generation | `POST /api/course/generate` |
| Source ingestion | `POST /api/content/link`, `POST /api/content/upload` |
| Assistant chat | `GET /api/chat/history`, `POST /api/chat`, `GET /api/chat/sessions` |

The API base URL is currently defined in `src/App.tsx`. Change it there when the backend runs on a different host or port.

## Supported Uploads

The backend accepts PDF, DOCX, and PPTX source files. Uploads are limited to 20 MB by the Flask application.

## Development Notes

- Run `npm run build` after frontend changes when testing through the Flask-served compiled UI.
- Course generation supports streamed `application/x-ndjson` progress responses and regular JSON responses for compatibility.
- The frontend can run independently for UI work, but backend-dependent features require the Flask service.
- Keep generated build output and local secrets out of version control according to the repository’s Git configuration.
